/**
 * 定制计划 v1.0 · 计划生成链路冒烟测试（无需网络、无需 DEEPSEEK_API_KEY）
 *
 * 覆盖：
 *  1. sanitizeStudyPlanRequest：入参白名单、日期边界、模块去重
 *  2. buildTemplateStudyPlan：4 周 28 天、任务数随每日时长变化、任务 id 唯一、申论题量为 1
 *  3. 笔试日压缩：剩余 10 天 → 10 天计划；剩余 2 天 → 最少 7 天
 *  4. normalizeStudyPlan：AI 缺天/缺任务自动补模板、非法模块被丢弃、无有效任务抛错
 *  5. 日期工具：跨月偏移与星期标签
 *  6. buildStudyPlanPrompt：把总天数与模块白名单写进 prompt
 *
 * 运行：npm run plan:smoke（= node --import tsx scripts/smoke-study-plan.ts）
 */
import {
  addDays,
  buildStudyPlanPrompt,
  buildTemplateStudyPlan,
  diffDays,
  normalizeStudyPlan,
  resolveStudyPlanDays,
  sanitizeStudyPlanRequest,
  shanghaiDateKey,
  weekdayLabelOf,
} from '../shared/study-plan';
import type { StudyPlanRequest, StudyPlanTask } from '../src/types';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, condition: boolean, detail?: string) {
  results.push({ name, ok: condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail && !condition ? ` → ${detail}` : ''}`);
}

const START = '2026-03-01';

function baseRequest(overrides: Partial<StudyPlanRequest> = {}): StudyPlanRequest {
  return {
    targetExam: 'provincial',
    examDate: null,
    dailyMinutes: 60,
    weakModules: ['ziliao', 'shenlun'],
    startDate: START,
    ...overrides,
  };
}

function allTasks(req: StudyPlanRequest): StudyPlanTask[] {
  return buildTemplateStudyPlan(req).weeks.flatMap(week => week.days.flatMap(day => day.tasks));
}

/* 1. 入参校验 */
const okBody = {
  targetExam: 'national',
  examDate: '2026-06-01',
  dailyMinutes: 120,
  weakModules: ['yanyu', 'yanyu', 'unknown', 'panduan'],
  startDate: START,
};
const sanitized = sanitizeStudyPlanRequest(okBody);
check('合法入参通过校验', sanitized.ok === true, sanitized.error);
check('未知模块被剔除且去重', sanitized.value?.weakModules.join(',') === 'yanyu,panduan', sanitized.value?.weakModules.join(','));
check(
  '未传 startDate 时默认上海今天',
  sanitizeStudyPlanRequest({ ...okBody, startDate: undefined, examDate: undefined }).value?.startDate === shanghaiDateKey()
);
check('非法 dailyMinutes 被拒绝', sanitizeStudyPlanRequest({ ...okBody, dailyMinutes: 90 }).ok === false);
check('空薄弱模块被拒绝', sanitizeStudyPlanRequest({ ...okBody, weakModules: [] }).ok === false);
check(
  '笔试日早于开始日被拒绝',
  sanitizeStudyPlanRequest({ ...okBody, examDate: '2026-02-01' }).ok === false
);
check(
  '笔试日格式错误被拒绝',
  sanitizeStudyPlanRequest({ ...okBody, examDate: '2026/06/01' }).ok === false
);

/* 2. 模板结构 */
const plan60 = buildTemplateStudyPlan(baseRequest());
check('默认计划 4 周', plan60.weeks.length === 4, `weeks=${plan60.weeks.length}`);
check('默认计划 28 天', plan60.totalDays === 28 && plan60.weeks.every(w => w.days.length === 7));
check(
  '天数连续编号 1..28',
  plan60.weeks.flatMap(w => w.days).every((day, index) => day.day === index + 1)
);
check(
  'totalTasks 与任务总数一致',
  plan60.totalTasks === plan60.weeks.flatMap(w => w.days).reduce((sum, day) => sum + day.tasks.length, 0)
);
const tasks60 = allTasks(baseRequest());
check('任务 id 全局唯一', new Set(tasks60.map(task => task.id)).size === tasks60.length);
check('任务 id 符合 d<N>t<N> 格式', tasks60.every(task => /^d\d+t[1-5]$/.test(task.id)));
check(
  '任务模块都在白名单内',
  tasks60.every(task => !task.module || ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun'].includes(task.module))
);
check(
  '申论任务题量固定为 1 道',
  tasks60.filter(task => task.module === 'shenlun').every(task => task.count === 1)
);
check('普通日每天 3 条任务（1 小时档）', plan60.weeks[0].days[0].tasks.length === 3);
check('每周第 7 天为复盘日', plan60.weeks.every(w => w.days[6].tasks[0].title.includes('错题复盘')));
const firstDayMinutes = plan60.weeks[0].days[0].tasks.reduce((sum, task) => sum + task.minutes, 0);
check('每日总时长接近所选时长（60 分钟 ±15）', firstDayMinutes >= 45 && firstDayMinutes <= 75, `minutes=${firstDayMinutes}`);

const plan30 = buildTemplateStudyPlan(baseRequest({ dailyMinutes: 30 }));
const plan120 = buildTemplateStudyPlan(baseRequest({ dailyMinutes: 120 }));
check('30 分钟档每天 2 条任务', plan30.weeks[0].days[0].tasks.length === 2);
check('2 小时档每天 4 条任务', plan120.weeks[0].days[0].tasks.length === 4);
check('2 小时档任务总时长更大', plan120.totalTasks > plan30.totalTasks);

/* 3. 笔试日压缩 */
const tenDays = baseRequest({ examDate: addDays(START, 10) });
check('剩余 10 天 → 计划 10 天', resolveStudyPlanDays(tenDays) === 10);
const plan10 = buildTemplateStudyPlan(tenDays);
check('压缩后 2 周且最后一周 3 天', plan10.weeks.length === 2 && plan10.weeks[1].days.length === 3);
check('压缩后仍连续编号', plan10.weeks.flatMap(w => w.days).at(-1)?.day === 10);
check('剩余 2 天 → 最少 7 天', resolveStudyPlanDays(baseRequest({ examDate: addDays(START, 2) })) === 7);
check('剩余 60 天 → 仍按 28 天', resolveStudyPlanDays(baseRequest({ examDate: addDays(START, 60) })) === 28);


/* 4. normalizeStudyPlan：AI 结果收敛 */
const template = buildTemplateStudyPlan(baseRequest());
const rawWeeks = template.weeks.map((week, weekIndex) => ({
  week: week.week,
  theme: weekIndex === 0 ? '第1周 · AI 主题' : week.theme,
  focus: 'AI 本周重点',
  days: week.days.map((day, dayIndex) => {
    if (weekIndex === 0 && dayIndex === 0) {
      return {
        day: day.day,
        tasks: [
          { title: '资料分析速算专项', module: 'ziliao', count: 20, minutes: 25, tip: '限时' },
          { title: '资料分析真题', module: 'not-exist', count: 10, minutes: 20 },
        ],
      };
    }
    if (weekIndex === 0 && dayIndex === 2) {
      return { day: day.day, tasks: [] };
    }
    return {
      day: day.day,
      tasks: day.tasks.map(task => ({
        title: `AI替换 ${task.title}`,
        module: task.module,
        count: task.count,
        minutes: task.minutes,
        tip: task.tip,
      })),
    };
  }),
}));
const rawAi = {
  planTitle: '资料分析 28 天攻坚',
  summary: 'AI 摘要',
  coachNote: 'AI 寄语',
  weeks: rawWeeks,
};
const merged = normalizeStudyPlan(rawAi, baseRequest());
check('AI 标题/摘要/寄语被采用', merged.planTitle === '资料分析 28 天攻坚' && merged.coachNote === 'AI 寄语');
check('AI 任务被采用', merged.weeks[0].days[0].tasks[0].title === '资料分析速算专项');
check('非法模块被丢弃', merged.weeks[0].days[0].tasks[1].module === undefined);
check(
  'AI 空白天自动用模板补齐',
  merged.weeks[0].days[2].tasks[0].title === template.weeks[0].days[2].tasks[0].title
);
check('AI 周主题被采用', merged.weeks[0].theme === '第1周 · AI 主题');
check('其余周 AI 任务也被采用', merged.weeks[1].days[0].tasks[0].title.startsWith('AI替换'));
check('模板原始对象未被污染', template.weeks[0].days[0].tasks[0].title !== '资料分析速算专项');

let threw = false;
try {
  normalizeStudyPlan({ weeks: [{ days: [{ tasks: [] }] }] }, baseRequest());
} catch (e) {
  threw = true;
}
check('AI 无有效任务时抛错（路由退回模板）', threw);

/* 5. 日期工具 */
check('跨月偏移', addDays('2026-02-28', 1) === '2026-03-01');
check('跨年偏移', addDays('2026-12-31', 1) === '2027-01-01');
check('自然日差', diffDays('2026-03-01', '2026-03-29') === 28);
check('星期标签与起始日一致', weekdayLabelOf('2026-03-01', 1) === '周日');

/* 6. prompt 内容 */
const prompt = buildStudyPlanPrompt(baseRequest({ dailyMinutes: 120, examDate: '2026-03-11' }));
check('prompt 写入压缩后总天数', prompt.includes('10 天'));
check('prompt 写入每日时长', prompt.includes('120 分钟'));
check('prompt 写入模块白名单', prompt.includes('ziliao') && prompt.includes('shenlun'));
check('prompt 要求只输出 JSON', prompt.includes('"weeks"'));

/* 7. 服务层：游客 localStorage 路径（不触网、不写库） */
const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, String(value)); },
  removeItem: (key: string) => { memory.delete(key); },
};
const service = await import('../src/services/studyPlanService');
const guest = await service.generateStudyPlan(baseRequest(), { userId: null });
check('游客生成走模板且不写云端', guest.provider === 'template' && guest.cloud === false);
check('游客计划落到 localStorage', (await service.loadStudyPlan(null))?.id === guest.record.id);
check('taskDateOf：第 8 天 = 起始日 +7', service.taskDateOf(guest.record, 'd8t2') === addDays(START, 7));
await service.setTaskCompleted(guest.record, 'd1t1', true, null);
check('游客勾选可读回', (await service.loadTaskCompletions(guest.record, null))['d1t1'] === shanghaiDateKey());
await service.setTaskCompleted(guest.record, 'd1t1', false, null);
check('取消勾选可删除', !(await service.loadTaskCompletions(guest.record, null))['d1t1']);
check('未登录不触发游客迁移', (await service.migrateGuestPlan(null)) === false);
const adopted = service.adoptLocalGuestPlan('smoke-user-1');
check('登录后本地接管游客计划', adopted?.id === guest.record.id);
check('重复接管不覆盖已有计划', service.adoptLocalGuestPlan('smoke-user-1')?.id === guest.record.id);


const failed = results.filter(item => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error('失败项：', failed.map(item => item.name).join(' | '));
  process.exit(1);
}

check('非对象请求体被拒绝', sanitizeStudyPlanRequest(null).ok === false);
