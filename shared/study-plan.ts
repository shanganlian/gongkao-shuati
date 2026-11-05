/**
 * 定制计划 v1.0 · 4 周计划共享层
 *
 * 被三处引用：
 *  - server.ts（本地 dev，tsx 直跑）
 *  - netlify/functions/api.ts（线上 Functions，esbuild 打包）
 *  - src/services/studyPlanService.ts（前端：游客/离线直接用 buildTemplateStudyPlan）
 *
 * 约束：本文件不读 process.env、不碰文件系统、不依赖 DOM，保持纯函数。
 * 设计原则：AI 只负责“更像人写的计划”，任何失败都必须能退回规则模板，绝不把页面打空。
 */
import type {
  ExamModule,
  StudyPlan,
  StudyPlanDay,
  StudyPlanRequest,
  StudyPlanTargetExam,
  StudyPlanTask,
  StudyPlanWeek,
} from '../src/types';

/** 前后端共用端点；本地 dev 由 server.ts 提供，线上由 netlify/functions/api.ts 提供 */
export const STUDY_PLAN_ENDPOINT = '/api/study-plan/generate';
export const DEEPSEEK_STUDY_PLAN_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_STUDY_PLAN_MODEL = 'deepseek-chat';
/** 比前端 55s 放弃略短，保证前端先收到模板兜底结果而不是裸超时 */
export const STUDY_PLAN_TIMEOUT_MS = 45000;
/** 一个计划的标准长度（4 周） */
export const STUDY_PLAN_STANDARD_DAYS = 28;
/** 笔试日过近时的最短计划长度 */
export const STUDY_PLAN_MIN_DAYS = 7;

/** 自评薄弱模块白名单：五大行测模块 + 申论思维（申论任务跳「每日两题」，其余跳刷题页） */
export const STUDY_PLAN_MODULES = [
  { module: 'changshi', name: '常识判断' },
  { module: 'yanyu', name: '言语理解' },
  { module: 'shuliang', name: '数量关系' },
  { module: 'panduan', name: '判断推理' },
  { module: 'ziliao', name: '资料分析' },
  { module: 'shenlun', name: '申论思维' },
] as const;

export type StudyPlanModuleKey = (typeof STUDY_PLAN_MODULES)[number]['module'];

const MODULE_KEYS: string[] = STUDY_PLAN_MODULES.map(item => item.module);
const MODULE_NAME: Record<string, string> = STUDY_PLAN_MODULES.reduce<Record<string, string>>((acc, item) => {
  acc[item.module] = item.name;
  return acc;
}, {});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOAL_LABELS: Record<StudyPlanTargetExam, string> = {
  national: '国考 · 行政执法/市地综合',
  provincial: '省考 · 乡镇/县级综合',
};

const WEEK_BLUEPRINT = [
  {
    theme: '第1周 · 摸底与手感',
    focus: '先把节奏找回来：每天固定题量，盯错因不盯分数。',
    action: '基础专项',
    tip: '先做熟题找手感，错题当天标注错因',
  },
  {
    theme: '第2周 · 弱项攻坚',
    focus: '集中火力打透自评最弱的两块，错题当天回炉。',
    action: '弱项攻坚',
    tip: '同一类错因连做三题，确认真的会了',
  },
  {
    theme: '第3周 · 真题实战',
    focus: '按考试时间做真题，练取舍与做题顺序。',
    action: '真题限时',
    tip: '限时作答，超 1 分钟的题先标记跳过',
  },
  {
    theme: '第4周 · 查漏补缺',
    focus: '只做错题与高频模型，把会做的题稳稳拿住。',
    action: '查漏补缺',
    tip: '遮住答案重做，只看错因是否重现',
  },
];

const REST_TIPS = [
  '把本周错题遮住答案重做一遍，只记错因',
  '复盘本周放弃的题：是知识漏洞还是时间不够',
  '把本周高频模型抄成一页纸，睡前过一遍',
];

/* ------------------------------------------------------------------ *
 * 日期工具（统一 Asia/Shanghai 自然日，避免跨时区把“今天”算错）
 * ------------------------------------------------------------------ */

export function shanghaiDateKey(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
}

/** YYYY-MM-DD 安全偏移（用 UTC 计算，避免夏令时干扰） */
export function addDays(dateKey: string, deltaDays: number): string {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return shanghaiDateKey();
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** to - from 的自然日差（同一天为 0） */
export function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = String(from || '').split('-').map(Number);
  const [ty, tm, td] = String(to || '').split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

export function weekdayLabelOf(startDate: string, absoluteDay: number): string {
  const [year, month, day] = String(addDays(startDate, absoluteDay - 1)).split('-').map(Number);
  if (!year || !month || !day) return `第${absoluteDay}天`;
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || `第${absoluteDay}天`;
}


/* ------------------------------------------------------------------ *
 * 入参白名单校验
 * ------------------------------------------------------------------ */

export interface SanitizeStudyPlanResult {
  ok: boolean;
  value?: StudyPlanRequest;
  error?: string;
}

/**
 * 服务端入参一律按字段重建，不信任任何多余字段。
 * startDate 缺省为上海今天；examDate 必须晚于 startDate，否则 400。
 */
export function sanitizeStudyPlanRequest(body: unknown): SanitizeStudyPlanResult {
  if (!body || typeof body !== 'object') return { ok: false, error: '请求体必须是 JSON 对象' };
  const raw = body as Record<string, any>;

  const targetExam: StudyPlanTargetExam | null =
    raw.targetExam === 'national' || raw.targetExam === 'provincial' ? raw.targetExam : null;
  if (!targetExam) return { ok: false, error: 'targetExam 只能是 national 或 provincial' };

  const dailyMinutes = Number(raw.dailyMinutes);
  if (![30, 60, 120].includes(dailyMinutes)) {
    return { ok: false, error: 'dailyMinutes 只能是 30 / 60 / 120' };
  }

  const startDate = typeof raw.startDate === 'string' && DATE_RE.test(raw.startDate.trim())
    ? raw.startDate.trim()
    : shanghaiDateKey();

  let examDate: string | null = null;
  if (typeof raw.examDate === 'string' && raw.examDate.trim()) {
    const candidate = raw.examDate.trim();
    if (!DATE_RE.test(candidate)) return { ok: false, error: 'examDate 格式必须是 YYYY-MM-DD' };
    if (diffDays(startDate, candidate) < 1) return { ok: false, error: '笔试日期需晚于计划开始日' };
    examDate = candidate;
  }

  const weakModules: string[] = [];
  const seen = new Set<string>();
  (Array.isArray(raw.weakModules) ? raw.weakModules : []).forEach((item: unknown) => {
    const key = typeof item === 'string' ? item.trim() : '';
    if (!key || seen.has(key) || !MODULE_KEYS.includes(key)) return;
    seen.add(key);
    weakModules.push(key);
  });
  if (!weakModules.length) return { ok: false, error: '请至少选择一个薄弱模块' };

  return {
    ok: true,
    value: {
      targetExam,
      examDate,
      dailyMinutes: dailyMinutes as 30 | 60 | 120,
      weakModules,
      startDate,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 规则模板：保证任何情况下都有一份完整、可执行的 4 周计划
 * ------------------------------------------------------------------ */

/** 计划总天数：默认 28 天；笔试日不足 28 天时压缩到剩余天数（最少 7 天） */
export function resolveStudyPlanDays(req: StudyPlanRequest): number {
  if (!req.examDate) return STUDY_PLAN_STANDARD_DAYS;
  const remaining = diffDays(req.startDate, req.examDate);
  if (remaining >= STUDY_PLAN_STANDARD_DAYS) return STUDY_PLAN_STANDARD_DAYS;
  return Math.max(STUDY_PLAN_MIN_DAYS, remaining);
}

function isShenlun(module: string): boolean {
  return module === 'shenlun';
}

function countOf(module: string, base: number): number {
  return isShenlun(module) ? 1 : base;
}

/** 每天任务数：30 分钟 2 条 / 1 小时 3 条 / 2 小时以上 4 条 */
function taskSlotsOf(minutes: number): number {
  if (minutes <= 30) return 2;
  if (minutes <= 60) return 3;
  return 4;
}

function minutesOfSlots(dailyMinutes: number, index: number, total: number): number {
  const base = Math.max(10, Math.round(dailyMinutes / total));
  // 第一条任务占大头（专项主攻），最后一条留复盘
  if (index === 0) return Math.min(dailyMinutes - (total - 1) * 10, base + 5);
  if (index === total - 1 && total > 2) return Math.max(10, base - 5);
  return base;
}

function buildTemplateTasks(
  req: StudyPlanRequest,
  weekIndex: number,
  absoluteDay: number
): StudyPlanTask[] {
  const blueprint = WEEK_BLUEPRINT[Math.min(weekIndex, WEEK_BLUEPRINT.length - 1)];
  const weak = req.weakModules.length ? req.weakModules : ['ziliao', 'panduan'];
  const isRestDay = absoluteDay % 7 === 0;

  if (isRestDay) {
    const reviewModule = weak[0];
    return [
      {
        id: `d${absoluteDay}t1`,
        title: '错题复盘 · 只看错因',
        minutes: Math.max(10, Math.round(req.dailyMinutes * 0.5)),
        tip: REST_TIPS[(absoluteDay / 7 - 1) % REST_TIPS.length],
      },
      {
        id: `d${absoluteDay}t2`,
        title: `第${weekIndex + 1}周小测 · ${MODULE_NAME[reviewModule] || '综合'}`,
        module: reviewModule as ExamModule,
        count: countOf(reviewModule, weekIndex >= 2 ? 20 : 15),
        minutes: Math.max(10, req.dailyMinutes - Math.round(req.dailyMinutes * 0.5)),
        tip: '按考试节奏一次做完，中途不看答案',
      },
    ];
  }

  const slots = taskSlotsOf(req.dailyMinutes);
  const tasks: StudyPlanTask[] = [];
  for (let i = 0; i < slots; i += 1) {
    const moduleKey = weak[i % weak.length];
    const isLast = i === slots - 1 && slots > 2;
    const baseCount = i === 0
      ? (req.dailyMinutes >= 120 ? 25 : req.dailyMinutes >= 60 ? 20 : 15)
      : (req.dailyMinutes >= 120 ? 15 : 10);
    const adjusted = weekIndex >= 2 ? baseCount + 5 : baseCount;

    if (isLast) {
      tasks.push({
        id: `d${absoluteDay}t${i + 1}`,
        title: '错题回炉 · 昨日错题重做',
        module: moduleKey as ExamModule,
        count: countOf(moduleKey, 5),
        minutes: minutesOfSlots(req.dailyMinutes, i, slots),
        tip: '只做错过的题，遮住答案重算一遍',
      });
      continue;
    }

    tasks.push({
      id: `d${absoluteDay}t${i + 1}`,
      title: `${MODULE_NAME[moduleKey] || '薄弱模块'}${blueprint.action}${isShenlun(moduleKey) ? '（1 道小题）' : ''}`,
      module: moduleKey as ExamModule,
      count: countOf(moduleKey, adjusted),
      minutes: minutesOfSlots(req.dailyMinutes, i, slots),
      tip: isShenlun(moduleKey) ? '先列提纲再落笔，控制在 25 分钟内' : blueprint.tip,
    });
  }
  return tasks;
}

export function buildTemplateStudyPlan(req: StudyPlanRequest): StudyPlan {
  const totalDays = resolveStudyPlanDays(req);
  const weekCount = Math.ceil(totalDays / 7);
  const weeks: StudyPlanWeek[] = [];
  let absoluteDay = 1;

  for (let w = 0; w < weekCount; w += 1) {
    const blueprint = WEEK_BLUEPRINT[Math.min(w, WEEK_BLUEPRINT.length - 1)];
    const days: StudyPlanDay[] = [];
    const dayCount = Math.min(7, totalDays - w * 7);
    for (let d = 0; d < dayCount; d += 1) {
      days.push({
        day: absoluteDay,
        weekdayLabel: weekdayLabelOf(req.startDate, absoluteDay),
        tasks: buildTemplateTasks(req, w, absoluteDay),
      });
      absoluteDay += 1;
    }
    weeks.push({
      week: w + 1,
      theme: blueprint.theme,
      focus: blueprint.focus,
      days,
    });
  }

  const totalTasks = weeks.reduce(
    (sum, week) => sum + week.days.reduce((daySum, day) => daySum + day.tasks.length, 0),
    0
  );
  const weakNames = (req.weakModules.length ? req.weakModules : ['ziliao', 'panduan'])
    .map(key => MODULE_NAME[key] || key)
    .slice(0, 3)
    .join(' / ');

  return {
    planTitle: `${GOAL_LABELS[req.targetExam]} · ${totalDays} 天定制计划`,
    goalLabel: GOAL_LABELS[req.targetExam],
    summary: `每天 ${req.dailyMinutes} 分钟，主攻 ${weakNames}。前两周建立手感，后两周真题与查漏补缺。`,
    coachNote: '按部就班就是伟大。当天的任务当天勾掉，漏了也会自动顺延，不会凭空消失。',
    totalDays,
    totalTasks,
    weeks,
  };
}


/* ------------------------------------------------------------------ *
 * AI 结果归一化：结构不合法就抛错，由路由退回模板
 * ------------------------------------------------------------------ */

function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, max).join('');
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeTaskList(value: unknown, day: StudyPlanDay): StudyPlanTask[] {
  if (!Array.isArray(value)) return [];
  const tasks: StudyPlanTask[] = [];
  value.slice(0, 5).forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const raw = item as Record<string, any>;
    const title = clipText(raw.title, 30);
    const moduleKey = typeof raw.module === 'string' && MODULE_KEYS.includes(raw.module) ? raw.module : null;
    if (!title) return;
    const count = clampNumber(raw.count, 1, 60);
    const minutes = clampNumber(raw.minutes, 5, 180) || 15;
    tasks.push({
      id: `d${day.day}t${index + 1}`,
      title,
      ...(moduleKey ? { module: moduleKey as ExamModule } : {}),
      ...(count ? { count: isShenlun(moduleKey || '') ? 1 : count } : {}),
      minutes,
      tip: clipText(raw.tip, 30) || undefined,
    });
  });
  return tasks;
}

/**
 * 把模型返回的 weeks 合并到模板骨架：
 *  - 周主题/重点/标题允许改写；缺的周、天、任务自动用模板补齐
 *  - 有效 AI 任务少于模板一半时视为失败，抛错让路由走模板（不伪装 AI）
 */
export function normalizeStudyPlan(raw: unknown, req: StudyPlanRequest): StudyPlan {
  const template = buildTemplateStudyPlan(req);
  const rawObj = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const rawWeeks = Array.isArray(rawObj.weeks) ? rawObj.weeks : [];
  let aiTaskCount = 0;

  const weeks: StudyPlanWeek[] = template.weeks.map((tplWeek, weekIndex) => {
    const rawWeek = rawWeeks[weekIndex] && typeof rawWeeks[weekIndex] === 'object'
      ? (rawWeeks[weekIndex] as Record<string, any>)
      : {};
    const rawDays = Array.isArray(rawWeek.days) ? rawWeek.days : [];
    const days: StudyPlanDay[] = tplWeek.days.map((tplDay, dayIndex) => {
      const rawDay = rawDays[dayIndex] && typeof rawDays[dayIndex] === 'object'
        ? (rawDays[dayIndex] as Record<string, any>)
        : null;
      const tasks = rawDay ? normalizeTaskList(rawDay.tasks, tplDay) : [];
      if (!tasks.length) return tplDay;
      aiTaskCount += tasks.length;
      return { ...tplDay, tasks };
    });
    return {
      week: tplWeek.week,
      theme: clipText(rawWeek.theme, 24) || tplWeek.theme,
      focus: clipText(rawWeek.focus, 60) || tplWeek.focus,
      days,
    };
  });

  if (aiTaskCount < Math.ceil(template.totalTasks * 0.5)) {
    throw new Error(`AI 计划有效任务不足（${aiTaskCount}/${template.totalTasks}）`);
  }

  const totalTasks = weeks.reduce(
    (sum, week) => sum + week.days.reduce((daySum, day) => daySum + day.tasks.length, 0),
    0
  );

  return {
    planTitle: clipText(rawObj.planTitle, 40) || template.planTitle,
    goalLabel: template.goalLabel,
    summary: clipText(rawObj.summary, 120) || template.summary,
    coachNote: clipText(rawObj.coachNote, 60) || template.coachNote,
    totalDays: template.totalDays,
    totalTasks,
    weeks,
  };
}


/* ------------------------------------------------------------------ *
 * DeepSeek 调用
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `你是深耕中国公务员考试（国考、省考）的备考规划师。
你输出的计划必须务实、可执行、拒绝贩卖焦虑，不写空话套话。
只输出 JSON，不要 markdown 代码块，不要任何解释文字。`;

export function buildStudyPlanPrompt(req: StudyPlanRequest): string {
  const totalDays = resolveStudyPlanDays(req);
  const weekCount = Math.ceil(totalDays / 7);
  const weak = req.weakModules
    .map(key => `${key}(${MODULE_NAME[key] || key})`)
    .join('、');
  const examLine = req.examDate
    ? `笔试日期：${req.examDate}（距今 ${diffDays(req.startDate, req.examDate)} 天，计划按 ${totalDays} 天排）`
    : `笔试日期：未确定（按标准 ${totalDays} 天排）`;

  return `请为一名考生制定 ${totalDays} 天的备考计划（${weekCount} 周，每周 7 天，最后一周可不足 7 天）。

【考生信息】
目标考试：${GOAL_LABELS[req.targetExam]}
${examLine}
每天可学时长：${req.dailyMinutes} 分钟
自评薄弱模块：${weak}

【硬性要求】
1. 周数固定 ${weekCount} 周；day 从 1 开始连续编号，到 ${totalDays} 结束。
2. 每天 2-4 条任务，总时长合计约 ${req.dailyMinutes} 分钟（上下浮动不超过 10 分钟）。
3. module 只能取：changshi / yanyu / shuliang / panduan / ziliao / shenlun，其余留空。
4. 申论任务 count 固定为 1（道），其余任务 count 为题目数量（5-30 的整数）。
5. 每周第 7 天安排「错题复盘 + 周测」，不排新知识点。
6. title 不超过 14 个汉字，tip 不超过 20 个汉字，口语化、具体可执行。
7. 第 1 周建立手感，第 2 周主攻薄弱模块，第 3 周真题限时，第 4 周查漏补缺。

【输出 JSON 结构】
{
  "planTitle": "不超过 24 字的计划标题",
  "summary": "不超过 80 字的计划说明",
  "coachNote": "不超过 40 字的教练寄语",
  "weeks": [
    {
      "week": 1,
      "theme": "第1周 · 主题（不超过 12 字）",
      "focus": "本周重点（不超过 40 字）",
      "days": [
        { "day": 1, "tasks": [ { "title": "资料分析基础专项", "module": "ziliao", "count": 20, "minutes": 25, "tip": "先做熟题找手感" } ] }
      ]
    }
  ]
}`;
}

/** 服务端调用 DeepSeek；失败抛错，由路由转成模板计划 */
export async function requestDeepSeekStudyPlan(apiKey: string, req: StudyPlanRequest): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STUDY_PLAN_TIMEOUT_MS);
  try {
    const res = await fetch(DEEPSEEK_STUDY_PLAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_STUDY_PLAN_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildStudyPlanPrompt(req) },
        ],
        temperature: 0.5,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status}${detail ? `：${clipText(detail, 160)}` : ''}`);
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek 返回内容为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}
