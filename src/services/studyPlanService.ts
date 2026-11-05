import { authFetch } from '../lib/authFetch';
import { supabase } from '../lib/supabase';
import {
  STUDY_PLAN_ENDPOINT,
  addDays,
  buildTemplateStudyPlan,
  shanghaiDateKey,
} from '../../shared/study-plan';
import type {
  StudyPlan,
  StudyPlanGenerateResponse,
  StudyPlanProvider,
  StudyPlanRecord,
  StudyPlanRequest,
} from '../types';

/**
 * 定制计划服务层。
 *
 * 存储策略（优先级从高到低）：
 *   1. 登录用户：Supabase study_plans / study_plan_task_logs
 *   2. 任何人：localStorage（游客唯一存储；登录用户作为断网兜底）
 *   3. 云端表未迁移 / 请求失败：静默降级到 localStorage，绝不阻塞页面
 *
 * 生成策略：
 *   登录 → POST /api/study-plan/generate（DeepSeek，失败自动模板）
 *   游客 → 本地 buildTemplateStudyPlan（同款规则引擎，零等待）
 */

const PLAN_KEY = 'xingan_study_plan_v1_';
const DONE_KEY = 'xingan_study_plan_done_v1_';
const CLIENT_TIMEOUT_MS = 55000;

/** 任务完成记录：taskId → 完成日期（补做时记录真实完成日） */
export type TaskCompletionMap = Record<string, string>;

export interface GenerateStudyPlanResult {
  record: StudyPlanRecord;
  cloud: boolean;
  /** 本次实际来源：deepseek / template */
  provider: StudyPlanProvider;
  note?: string;
}

function scopeOf(userId?: string | null): string {
  return userId || 'guest';
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
    /* 隐私模式 / 配额满：静默降级，页面仍可用 */
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

/** Supabase 请求加超时：断网/网络抖动时最多等这么久，随后走本地兜底 */
function withTimeout<T>(task: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    Promise.resolve(task).then(value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    /* ignore */
  }
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isStudyPlan(value: unknown): value is StudyPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Record<string, any>;
  if (typeof plan.planTitle !== 'string' || !plan.planTitle) return false;
  if (!Array.isArray(plan.weeks) || !plan.weeks.length) return false;
  return plan.weeks.every((week: any) => (
    week &&
    Array.isArray(week.days) &&
    week.days.every((day: any) => day && Array.isArray(day.tasks))
  ));
}


/* ------------------------------------------------------------------ *
 * 本地存储
 * ------------------------------------------------------------------ */

function readLocalPlan(userId?: string | null): StudyPlanRecord | null {
  const record = readJson<StudyPlanRecord | null>(`${PLAN_KEY}${scopeOf(userId)}`, null);
  if (!record || typeof record.id !== 'string' || !isStudyPlan(record.plan)) return null;
  return record;
}

function writeLocalPlan(record: StudyPlanRecord, userId?: string | null): void {
  writeJson(`${PLAN_KEY}${scopeOf(userId)}`, record);
}

function readLocalDone(planId: string, userId?: string | null): TaskCompletionMap {
  const map = readJson<TaskCompletionMap>(`${DONE_KEY}${scopeOf(userId)}_${planId}`, {});
  if (!map || typeof map !== 'object') return {};
  const next: TaskCompletionMap = {};
  Object.keys(map).forEach(key => {
    const value = map[key];
    if (typeof value === 'string') next[key] = value;
  });
  return next;
}

function writeLocalDone(planId: string, map: TaskCompletionMap, userId?: string | null): void {
  writeJson(`${DONE_KEY}${scopeOf(userId)}_${planId}`, map);
}

/* ------------------------------------------------------------------ *
 * 云端记录
 * ------------------------------------------------------------------ */

function rowToRecord(row: any): StudyPlanRecord | null {
  if (!row || typeof row.id !== 'string') return null;
  const plan = row.plan;
  if (!isStudyPlan(plan)) return null;
  return {
    id: row.id,
    targetExam: row.target_exam === 'national' ? 'national' : 'provincial',
    examDate: row.exam_date || null,
    dailyMinutes: Number(row.daily_minutes) || 60,
    weakModules: Array.isArray(row.weak_modules) ? row.weak_modules : [],
    startDate: row.start_date || shanghaiDateKey(),
    provider: row.provider === 'deepseek' ? 'deepseek' : 'template',
    plan,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

async function fetchCloudPlan(userId: string): Promise<StudyPlanRecord | null> {
  try {
    const query = supabase
      .from('study_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await withTimeout<any>(query, 6000, { data: null, error: true });
    if (error) return null;
    return rowToRecord(data);
  } catch (e) {
    return null;
  }
}

/** 写入云端：先把旧 active 计划归档，再插新行；返回是否成功 */
async function insertCloudPlan(record: StudyPlanRecord, userId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    await supabase
      .from('study_plans')
      .update({ status: 'archived', updated_at: now })
      .eq('user_id', userId)
      .eq('status', 'active');

    const { error } = await supabase.from('study_plans').insert({
      id: record.id,
      user_id: userId,
      target_exam: record.targetExam,
      exam_date: record.examDate,
      daily_minutes: record.dailyMinutes,
      weak_modules: record.weakModules,
      start_date: record.startDate,
      plan: record.plan,
      provider: record.provider,
      status: 'active',
      created_at: record.createdAt,
      updated_at: now,
    });
    return !error;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 读取 / 生成 / 保存
 * ------------------------------------------------------------------ */

/** 读取当前生效计划：云端优先 → 本账号本地 → 接管游客本地 */
export async function loadStudyPlan(userId?: string | null): Promise<StudyPlanRecord | null> {
  if (userId) {
    const remote = await fetchCloudPlan(userId);
    if (remote) {
      writeLocalPlan(remote, userId);
      return remote;
    }
    return readLocalPlan(userId) || adoptLocalGuestPlan(userId);
  }
  return readLocalPlan(userId);
}

/**
 * 登录后接管游客本地计划：云端表未建 / 断网时，至少让用户继续看到原计划与勾选。
 * 不删除游客键，便于云端恢复后仍可迁移；已存在本账号本地计划时不覆盖。
 */
export function adoptLocalGuestPlan(userId?: string | null): StudyPlanRecord | null {
  if (!userId) return null;
  const existing = readLocalPlan(userId);
  if (existing) return existing;
  const guestRecord = readLocalPlan(null);
  if (!guestRecord) return null;
  writeLocalPlan(guestRecord, userId);
  const guestDone = readLocalDone(guestRecord.id, null);
  if (Object.keys(guestDone).length) {
    writeLocalDone(guestRecord.id, guestDone, userId);
  }
  return guestRecord;
}

async function requestGenerate(req: StudyPlanRequest, signal?: AbortSignal): Promise<StudyPlanGenerateResponse> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    const res = await authFetch(STUDY_PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!isStudyPlan(data?.plan)) throw new Error('计划结构不合法');
    const provider: StudyPlanProvider = data.provider === 'deepseek' ? 'deepseek' : 'template';
    return { plan: data.plan, provider, note: typeof data.note === 'string' ? data.note : undefined };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * 生成计划并落库。
 * 游客：本地模板；登录：AI（失败/超时/结构不合法自动模板），随后写云端，写失败落本地。
 */
export async function generateStudyPlan(
  req: StudyPlanRequest,
  options: { userId?: string | null; signal?: AbortSignal } = {}
): Promise<GenerateStudyPlanResult> {
  const { userId, signal } = options;
  let provider: StudyPlanProvider = 'template';
  let plan: StudyPlan;
  let note: string | undefined;

  if (userId) {
    try {
      const result = await requestGenerate(req, signal);
      plan = result.plan;
      provider = result.provider;
      note = result.note;
    } catch (err: any) {
      if (signal?.aborted) throw err;
      plan = buildTemplateStudyPlan(req);
      provider = 'template';
      note = 'client-fallback';
    }
  } else {
    plan = buildTemplateStudyPlan(req);
  }

  const record: StudyPlanRecord = {
    id: newId(),
    targetExam: req.targetExam,
    examDate: req.examDate,
    dailyMinutes: req.dailyMinutes,
    weakModules: req.weakModules,
    startDate: req.startDate,
    provider,
    plan,
    createdAt: new Date().toISOString(),
  };

  let cloud = false;
  if (userId) {
    cloud = await insertCloudPlan(record, userId);
  }
  writeLocalPlan(record, userId || null);
  return { record, cloud, provider, note };
}


/* ------------------------------------------------------------------ *
 * 任务完成记录
 * ------------------------------------------------------------------ */

/** 任务所属日期 = 计划起始日 + (day - 1) */
export function taskDateOf(record: StudyPlanRecord, taskId: string): string {
  const match = /^d(\d+)t/.exec(taskId || '');
  const day = match ? Number(match[1]) : 1;
  return addDays(record.startDate, Math.max(0, day - 1));
}

/** 读取勾选状态：云端优先；云端无记录（含表未迁移）用本地 */
export async function loadTaskCompletions(
  record: StudyPlanRecord,
  userId?: string | null
): Promise<TaskCompletionMap> {
  if (userId) {
    try {
      const query = supabase
        .from('study_plan_task_logs')
        .select('task_key, completed_on')
        .eq('plan_id', record.id)
        .eq('user_id', userId);
      const { data, error } = await withTimeout<any>(query, 6000, { data: null, error: true });
      if (!error && Array.isArray(data)) {
        const map: TaskCompletionMap = {};
        data.forEach((row: any) => {
          if (typeof row.task_key === 'string') {
            map[row.task_key] = row.completed_on || shanghaiDateKey();
          }
        });
        writeLocalDone(record.id, map, userId);
        return map;
      }
    } catch (e) {
      /* 降级到本地 */
    }
  }
  return readLocalDone(record.id, userId);
}

/** 勾选/取消勾选：先写本地（立即生效），再尽力同步云端 */
export async function setTaskCompleted(
  record: StudyPlanRecord,
  taskId: string,
  completed: boolean,
  userId?: string | null
): Promise<{ cloud: boolean }> {
  const map = readLocalDone(record.id, userId);
  if (completed) {
    map[taskId] = shanghaiDateKey();
  } else {
    delete map[taskId];
  }
  writeLocalDone(record.id, map, userId);

  if (!userId) return { cloud: false };

  try {
    if (completed) {
      const { error } = await supabase
        .from('study_plan_task_logs')
        .upsert({
          user_id: userId,
          plan_id: record.id,
          task_key: taskId,
          task_date: taskDateOf(record, taskId),
          completed_on: map[taskId] || shanghaiDateKey(),
        }, { onConflict: 'user_id,plan_id,task_key' });
      return { cloud: !error };
    }
    const { error } = await supabase
      .from('study_plan_task_logs')
      .delete()
      .eq('user_id', userId)
      .eq('plan_id', record.id)
      .eq('task_key', taskId);
    return { cloud: !error };
  } catch (e) {
    return { cloud: false };
  }
}

/* ------------------------------------------------------------------ *
 * 游客计划迁移：登录后把本地游客计划（含勾选）并入云端
 * ------------------------------------------------------------------ */

export async function migrateGuestPlan(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  // 本账号已有本地计划（可能是云端不可用时接管的游客计划或新计划）：不重复插入旧计划
  if (readLocalPlan(userId)) return false;
  const guestRecord = readLocalPlan(null);
  if (!guestRecord) return false;

  const remote = await fetchCloudPlan(userId);
  if (remote) return false;

  const inserted = await insertCloudPlan(guestRecord, userId);
  if (!inserted) return false;

  writeLocalPlan(guestRecord, userId);
  const guestDone = readLocalDone(guestRecord.id, null);
  if (Object.keys(guestDone).length) {
    writeLocalDone(guestRecord.id, guestDone, userId);
    try {
      const rows = Object.keys(guestDone).map(taskId => ({
        user_id: userId,
        plan_id: guestRecord.id,
        task_key: taskId,
        task_date: taskDateOf(guestRecord, taskId),
        completed_on: guestDone[taskId] || shanghaiDateKey(),
      }));
      await supabase
        .from('study_plan_task_logs')
        .upsert(rows, { onConflict: 'user_id,plan_id,task_key' });
    } catch (e) {
      /* 勾选同步失败不影响主流程，本机仍保留 */
    }
  }

  removeKey(`${PLAN_KEY}guest`);
  removeKey(`${DONE_KEY}guest_${guestRecord.id}`);
  return true;
}
