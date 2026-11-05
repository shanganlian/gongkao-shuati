import { getGuestHistory, todayKey } from './guestStore';
import { loadInterviewSessions } from '../services/interviewReviewService';

/**
 * 真实学习活动统计。
 *
 * 数据来源（优先级从高到低）：
 *   1. 登录用户：Supabase answer_records（若迁移已执行）
 *   2. 登录用户：Supabase user_quota 的按日 used_count（answer_records 未初始化时的兜底）
 *   3. 本机活动账本：练习 / 每日两题 / 打卡 / 计划任务（按账号隔离）
 *   4. 游客答题历史：guestStore 的 xingan_guest_history_v1
 *   5. 面试练习记录：interviewReviewService 的本地记录
 *
 * 所有日期统一使用 Asia/Shanghai 自然日，避免跨时区把连续天数算错。
 */

const ACTIVITY_PREFIX = 'xingan_activity_v1_';
const MAX_EVENTS = 5000;
const MAX_DAYS = 366;

export const OBJECTIVE_MODULES = [
  { module: 'changshi', name: '常识判断', radarLabel: '政治站位与常识' },
  { module: 'yanyu', name: '言语理解', radarLabel: '言语理解与逻辑' },
  { module: 'shuliang', name: '数量关系', radarLabel: '数量关系与速解' },
  { module: 'panduan', name: '判断推理', radarLabel: '判断推理严谨度' },
  { module: 'ziliao', name: '资料分析', radarLabel: '资料分析准确率' },
] as const;

export type ActivityEventType = 'question' | 'mindset' | 'checkin' | 'plan';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  date: string;
  at: string;
  /** 同一天内的去重键：题目用 questionId，打卡/计划用固定键 */
  key: string;
  questionId?: string;
  module?: string;
  isCorrect?: boolean;
  source?: string;
}

export interface RecordedQuestionInput {
  questionId: string;
  module?: string;
  isCorrect?: boolean | null;
  source?: string;
}

export interface MindsetCompletionInput {
  /** 每日两题中的行测应用题 id */
  q2QuestionId?: string;
  q2Module?: string;
  q2Correct?: boolean | null;
}

/** Supabase 侧按日聚合后的真实答题数据 */
export interface RemoteActivityDay {
  date: string;
  questionIds: string[];
  correctById: Record<string, boolean>;
  /** user_quota.used_count：作为 answer_records 缺失/截断时的当日答题数兜底 */
  fallbackCount: number;
}

export interface RemoteActivitySnapshot {
  days: RemoteActivityDay[];
}

export interface ModuleStat {
  module: string;
  name: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  count: number;
}

export interface ActivityStats {
  totalAnswered: number;
  correctCount: number;
  objectiveCount: number;
  accuracy: number;
  streakDays: number;
  activeDays: number;
  todayAnswered: number;
  todayActive: boolean;
  activeDates: string[];
  trend: TrendPoint[];
  moduleStats: ModuleStat[];
  moduleCoverage: number;
  mindsetDays: number;
  mindsetStreak: number;
  checkInDays: number;
  todayCheckedIn: boolean;
  planTasks: number;
  interviewSessions: number;
  interviewMinutes: number;
  interviewScore: number;
  hasAnyActivity: boolean;
}

interface DayAccumulator {
  date: string;
  questionMap: Map<string, { correct?: boolean; module?: string }>;
  fallbackCount: number;
  active: boolean;
  mindset: boolean;
  checkIn: boolean;
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storageKey(scope: string): string {
  return `${ACTIVITY_PREFIX}${scope || 'guest'}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 隐私模式 / 配额满时静默降级，页面仍可正常使用 */
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}
/** YYYY-MM-DD 安全偏移，使用 UTC 计算避免夏令时干扰 */
export function shiftDateKey(date: string, deltaDays: number): string {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return todayKey();
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function lastNDateKeys(days: number): string[] {
  const today = todayKey();
  const safeDays = Math.max(1, Math.trunc(days));
  return Array.from({ length: safeDays }, (_, i) => shiftDateKey(today, i - safeDays + 1));
}

function weekdayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date.slice(5);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || date.slice(5);
}

export function readActivityEvents(scope: string): ActivityEvent[] {
  const list = readJson<ActivityEvent[]>(storageKey(scope), []);
  if (!Array.isArray(list)) return [];
  return list.filter(item => (
    item &&
    typeof item.id === 'string' &&
    typeof item.date === 'string' &&
    typeof item.key === 'string' &&
    (item.type === 'question' || item.type === 'mindset' || item.type === 'checkin' || item.type === 'plan')
  ));
}

function saveActivityEvents(scope: string, events: ActivityEvent[]): void {
  const cutoff = shiftDateKey(todayKey(), -MAX_DAYS);
  const deduped = new Map<string, ActivityEvent>();
  events.forEach(event => {
    if (!event || event.date < cutoff) return;
    deduped.set(`${event.date}|${event.type}|${event.key}`, event);
  });
  const next = Array.from(deduped.values())
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, MAX_EVENTS);
  writeJson(storageKey(scope), next);
}

function appendEvents(scope: string, events: ActivityEvent[]): void {
  if (!events.length) return;
  saveActivityEvents(scope, [...events, ...readActivityEvents(scope)]);
}

export function recordQuestionEvents(scope: string, inputs: RecordedQuestionInput[]): void {
  const date = todayKey();
  const at = new Date().toISOString();
  const events: ActivityEvent[] = [];
  const seen = new Set<string>();

  (Array.isArray(inputs) ? inputs : []).forEach(input => {
    const questionId = typeof input?.questionId === 'string' ? input.questionId.trim() : '';
    if (!questionId || seen.has(questionId)) return;
    seen.add(questionId);
    events.push({
      id: makeId(),
      type: 'question',
      date,
      at,
      key: questionId,
      questionId,
      module: typeof input.module === 'string' ? input.module : undefined,
      isCorrect: typeof input.isCorrect === 'boolean' ? input.isCorrect : undefined,
      source: input.source || 'drill',
    });
  });

  appendEvents(scope, events);
}

export function recordMindsetEvents(scope: string, input: MindsetCompletionInput = {}): void {
  const date = todayKey();
  const at = new Date().toISOString();
  const events: ActivityEvent[] = [
    {
      id: makeId(),
      type: 'mindset',
      date,
      at,
      key: `mindset-shenlun:${date}`,
      source: 'mindset',
    },
  ];

  if (input.q2QuestionId) {
    events.push({
      id: makeId(),
      type: 'mindset',
      date,
      at,
      key: `mindset:${input.q2QuestionId}`,
      questionId: input.q2QuestionId,
      module: input.q2Module || 'changshi',
      isCorrect: typeof input.q2Correct === 'boolean' ? input.q2Correct : undefined,
      source: 'mindset',
    });
  }

  appendEvents(scope, events);
}

export function recordCheckInEvent(scope: string): void {
  const date = todayKey();
  appendEvents(scope, [{
    id: makeId(),
    type: 'checkin',
    date,
    at: new Date().toISOString(),
    key: 'daily',
    source: 'community',
  }]);
}

export function recordPlanTaskEvent(scope: string, taskId?: string): void {
  const date = todayKey();
  appendEvents(scope, [{
    id: makeId(),
    type: 'plan',
    date,
    at: new Date().toISOString(),
    key: taskId || 'daily',
    source: 'plan',
  }]);
}

/**
 * 登录后把游客本机的活动账本迁移到当前账号；只在账号账本为空时迁移一次。
 * 游客答题历史本身由 merge_guest_data 并入云端，这里只迁移 mindset / checkin / plan 等本地事件。
 */
export function adoptGuestActivity(scope: string): boolean {
  if (!scope || scope === 'guest') return false;
  if (readActivityEvents(scope).length > 0) return false;
  const guestEvents = readActivityEvents('guest');
  if (!guestEvents.length) return false;
  saveActivityEvents(scope, guestEvents);
  removeKey(storageKey('guest'));
  return true;
}

function getDay(map: Map<string, DayAccumulator>, date: string): DayAccumulator {
  let day = map.get(date);
  if (!day) {
    day = {
      date,
      questionMap: new Map(),
      fallbackCount: 0,
      active: false,
      mindset: false,
      checkIn: false,
    };
    map.set(date, day);
  }
  return day;
}

function addQuestion(
  day: DayAccumulator,
  questionId: string,
  correct?: boolean,
  module?: string
): void {
  if (!questionId) return;
  const existing = day.questionMap.get(questionId);
  const nextCorrect = typeof correct === 'boolean' ? correct : existing?.correct;
  day.questionMap.set(questionId, {
    correct: nextCorrect,
    module: module || existing?.module,
  });
}

function calculateStreak(dates: Set<string>, today: string): number {
  if (!dates.size) return 0;
  let cursor = dates.has(today) ? today : shiftDateKey(today, -1);
  let streak = 0;
  while (dates.has(cursor) && streak < 3660) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export interface BuildActivityStatsOptions {
  scope: string;
  includeGuestHistory?: boolean;
  remote?: RemoteActivitySnapshot | null;
}

export function buildActivityStats(options: BuildActivityStatsOptions): ActivityStats {
  const scope = options.scope || 'guest';
  const today = todayKey();
  const dayMap = new Map<string, DayAccumulator>();
  const mindsetDates = new Set<string>();
  const checkInDates = new Set<string>();
  let planTasks = 0;

  const localEvents = readActivityEvents(scope);
  localEvents.forEach(event => {
    const day = getDay(dayMap, event.date);
    day.active = true;

    if (event.type === 'question' || event.type === 'mindset') {
      // 旧的思维晨练事件曾把“申论文章”伪装成一道题，计入总数会虚增；这里显式排除。
      const isArticleOnly = event.type === 'mindset'
        && (!event.questionId || event.questionId.startsWith('mindset-shenlun:'));
      if (event.questionId && !isArticleOnly) {
        addQuestion(day, event.questionId, event.isCorrect, event.module);
      }
      if (event.type === 'mindset') {
        day.mindset = true;
        mindsetDates.add(event.date);
      }
    } else if (event.type === 'checkin') {
      day.checkIn = true;
      checkInDates.add(event.date);
    } else if (event.type === 'plan') {
      planTasks += 1;
    }
  });

  if (options.includeGuestHistory) {
    getGuestHistory().forEach(record => {
      if (!record?.question_id || !record.answered_on) return;
      const day = getDay(dayMap, record.answered_on);
      day.active = true;
      addQuestion(
        day,
        record.question_id,
        typeof record.is_correct === 'boolean' ? record.is_correct : undefined,
        undefined
      );
    });
  }

  (options.remote?.days || []).forEach(remoteDay => {
    if (!remoteDay?.date) return;
    const day = getDay(dayMap, remoteDay.date);
    day.active = true;
    day.fallbackCount = Math.max(day.fallbackCount, Number(remoteDay.fallbackCount) || 0);
    (remoteDay.questionIds || []).forEach(questionId => {
      if (!questionId) return;
      addQuestion(day, questionId, remoteDay.correctById?.[questionId]);
    });
  });

  // 面试练习记录：本地真实记录，计入连续天数、总时长与面试维度得分
  const interviewDates = new Set<string>();
  let interviewSeconds = 0;
  let interviewScoreTotal = 0;
  let interviewScoreCount = 0;
  const interviewRecords = loadInterviewSessions();
  interviewRecords.forEach(record => {
    const started = record?.startedAt ? new Date(record.startedAt) : null;
    if (started && !Number.isNaN(started.getTime())) {
      const date = todayKey(started);
      interviewDates.add(date);
      getDay(dayMap, date).active = true;
    }
    const seconds = Number(record?.durationSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      interviewSeconds += seconds;
    }
    const score = Number(record?.review?.overallScore);
    if (Number.isFinite(score) && score > 0) {
      interviewScoreTotal += score;
      interviewScoreCount += 1;
    }
  });

  let totalAnswered = 0;
  let correctCount = 0;
  let objectiveCount = 0;
  const activeDates = new Set<string>();
  const moduleTotals = new Map<string, { answered: number; correct: number }>();

  dayMap.forEach(day => {
    const questions = day.questionMap.size;
    const answered = Math.max(questions, day.fallbackCount);
    if (answered > 0) {
      totalAnswered += answered;
    }
    if (answered > 0 || day.mindset || day.checkIn) {
      activeDates.add(day.date);
    }

    day.questionMap.forEach(question => {
      if (typeof question.correct !== 'boolean') return;
      objectiveCount += 1;
      if (question.correct) correctCount += 1;

      if (!question.module) return;
      const current = moduleTotals.get(question.module) || { answered: 0, correct: 0 };
      current.answered += 1;
      if (question.correct) current.correct += 1;
      moduleTotals.set(question.module, current);
    });
  });

  interviewDates.forEach(date => activeDates.add(date));

  const accuracy = objectiveCount > 0
    ? Math.round((correctCount / objectiveCount) * 100)
    : 0;

  const moduleStats: ModuleStat[] = OBJECTIVE_MODULES.map(item => {
    const totals = moduleTotals.get(item.module) || { answered: 0, correct: 0 };
    return {
      module: item.module,
      name: item.name,
      answered: totals.answered,
      correct: totals.correct,
      accuracy: totals.answered > 0 ? Math.round((totals.correct / totals.answered) * 100) : 0,
    };
  });

  const coveredModules = moduleStats.filter(item => item.answered > 0).length;
  const moduleCoverage = Math.round((coveredModules / OBJECTIVE_MODULES.length) * 100);

  const trend: TrendPoint[] = lastNDateKeys(7).map(date => {
    const day = dayMap.get(date);
    return {
      date,
      label: weekdayLabel(date),
      count: day ? Math.max(day.questionMap.size, day.fallbackCount) : 0,
    };
  });

  const todayDay = dayMap.get(today);
  const todayAnswered = todayDay
    ? Math.max(todayDay.questionMap.size, todayDay.fallbackCount)
    : 0;

  return {
    totalAnswered,
    correctCount,
    objectiveCount,
    accuracy,
    streakDays: calculateStreak(activeDates, today),
    activeDays: activeDates.size,
    todayAnswered,
    todayActive: activeDates.has(today),
    activeDates: Array.from(activeDates).sort(),
    trend,
    moduleStats,
    moduleCoverage,
    mindsetDays: mindsetDates.size,
    mindsetStreak: calculateStreak(mindsetDates, today),
    checkInDays: checkInDates.size,
    todayCheckedIn: checkInDates.has(today),
    planTasks,
    interviewSessions: interviewRecords.length,
    interviewMinutes: interviewSeconds > 0 ? Math.ceil(interviewSeconds / 60) : 0,
    interviewScore: interviewScoreCount > 0
      ? Math.round(interviewScoreTotal / interviewScoreCount)
      : 0,
    hasAnyActivity: activeDates.size > 0 || totalAnswered > 0 || interviewRecords.length > 0,
  };
}

/** 统一的连续天数文案；无记录时展示“今天开始第 1 天”而不是 0 天 */
export function formatStreakDays(streakDays: number): string {
  return streakDays > 0 ? `连续 ${streakDays} 天` : '今天开始第 1 天';
}

export function streakBadgeDays(streakDays: number): number {
  return Math.max(1, Math.trunc(streakDays) || 0);
}

