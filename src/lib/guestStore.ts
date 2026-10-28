import { supabase } from './supabase';

/**
 * 游客态本地存储：额度、错题、答题历史。
 * 登录后由 AuthContext 调用 mergeGuestDataToAccount() 一次性并入云端。
 * 注意：localStorage 只能防"普通用户"，挡不住直接抓静态题库，仅作为产品额度手段。
 */

export const GUEST_DAILY_LIMIT = 10;
export const AUTH_DAILY_LIMIT = 50;

const TZ = 'Asia/Shanghai';
const QUOTA_KEY = 'xingan_guest_quota_v1';
const MISTAKE_KEY = 'xingan_guest_mistakes_v1';
const HISTORY_KEY = 'xingan_guest_history_v1';
const MISTAKE_LIMIT = 200;
const HISTORY_LIMIT = 200;

export interface GuestAnswerRecord {
  question_id: string;
  selected_key: string | null;
  is_correct: boolean | null;
  source: string;
  answered_on: string;
  answered_at: string;
}

interface GuestQuota {
  date: string;
  count: number;
  questionIds: string[];
}

export interface GuestConsumeMeta {
  selectedKey?: string | null;
  isCorrect?: boolean | null;
  source?: string;
}

export interface ConsumeOutcome {
  allowed: boolean;
  charged: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: 'guest_limit';
}

/** Asia/Shanghai 自然日，格式 YYYY-MM-DD */
export function todayKey(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
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
    /* ignore quota / privacy mode */
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

export function getGuestQuota(): GuestQuota {
  const today = todayKey();
  const stored = readJson<GuestQuota>(QUOTA_KEY, { date: today, count: 0, questionIds: [] });
  if (!stored || stored.date !== today || !Array.isArray(stored.questionIds)) {
    return { date: today, count: 0, questionIds: [] };
  }
  return {
    date: today,
    count: Math.max(0, Math.min(Number(stored.count) || 0, GUEST_DAILY_LIMIT)),
    questionIds: stored.questionIds.filter(id => typeof id === 'string'),
  };
}

function saveGuestQuota(quota: GuestQuota): void {
  writeJson(QUOTA_KEY, quota);
}

export function getGuestUsageToday(): number {
  return getGuestQuota().count;
}

/** 游客答题扣额度；同题当日不重复扣 */
export function consumeGuestQuota(questionId: string, meta: GuestConsumeMeta = {}): ConsumeOutcome {
  const quota = getGuestQuota();

  if (quota.questionIds.includes(questionId)) {
    return {
      allowed: true,
      charged: false,
      used: quota.count,
      limit: GUEST_DAILY_LIMIT,
      remaining: Math.max(GUEST_DAILY_LIMIT - quota.count, 0),
    };
  }

  if (quota.count >= GUEST_DAILY_LIMIT) {
    return {
      allowed: false,
      charged: false,
      used: quota.count,
      limit: GUEST_DAILY_LIMIT,
      remaining: 0,
      reason: 'guest_limit',
    };
  }

  const next: GuestQuota = {
    date: quota.date,
    count: quota.count + 1,
    questionIds: [...quota.questionIds, questionId],
  };
  saveGuestQuota(next);
  addGuestHistory(questionId, meta);

  return {
    allowed: true,
    charged: true,
    used: next.count,
    limit: GUEST_DAILY_LIMIT,
    remaining: Math.max(GUEST_DAILY_LIMIT - next.count, 0),
  };
}

export function getGuestMistakes(): string[] {
  const list = readJson<string[]>(MISTAKE_KEY, []);
  return Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
}

export function addGuestMistake(questionId: string): void {
  const list = getGuestMistakes();
  if (list.includes(questionId)) return;
  writeJson(MISTAKE_KEY, [questionId, ...list].slice(0, MISTAKE_LIMIT));
}

export function getGuestHistory(): GuestAnswerRecord[] {
  const list = readJson<GuestAnswerRecord[]>(HISTORY_KEY, []);
  if (!Array.isArray(list)) return [];
  return list.filter(item => item && typeof item.question_id === 'string');
}

export function addGuestHistory(questionId: string, meta: GuestConsumeMeta = {}): void {
  const today = todayKey();
  const record: GuestAnswerRecord = {
    question_id: questionId,
    selected_key: meta.selectedKey ?? null,
    is_correct: typeof meta.isCorrect === 'boolean' ? meta.isCorrect : null,
    source: meta.source || 'drill',
    answered_on: today,
    answered_at: new Date().toISOString(),
  };
  const rest = getGuestHistory().filter(
    item => !(item.question_id === questionId && item.answered_on === today)
  );
  writeJson(HISTORY_KEY, [record, ...rest].slice(0, HISTORY_LIMIT));
}

export function hasGuestData(): boolean {
  return (
    getGuestMistakes().length > 0 ||
    getGuestHistory().length > 0 ||
    getGuestUsageToday() > 0
  );
}

export function clearGuestData(): void {
  removeKey(QUOTA_KEY);
  removeKey(MISTAKE_KEY);
  removeKey(HISTORY_KEY);
}

export interface MergeResult {
  merged: boolean;
  error?: string;
}

let mergeInFlight: Promise<MergeResult> | null = null;

/**
 * 登录成功后调用：把本地游客数据并入账号。
 * 失败时保留 localStorage，下次登录/刷新会重试。
 * 并发保护：StrictMode 双调用 / 重复触发时只跑一次 RPC。
 */
export async function mergeGuestDataToAccount(): Promise<MergeResult> {
  if (mergeInFlight) return mergeInFlight;
  if (!hasGuestData()) return { merged: false };

  const mistakes = getGuestMistakes();
  const history = getGuestHistory();
  const used = getGuestUsageToday();

  mergeInFlight = (async (): Promise<MergeResult> => {
    const { error } = await supabase.rpc('merge_guest_data', {
      p_mistake_ids: mistakes,
      p_history: history,
      p_used: used,
    });

    if (error) {
      console.warn('[guest-store] 游客数据合并失败，保留本地数据待重试：', error.message);
      return { merged: false, error: error.message };
    }

    clearGuestData();
    return { merged: true };
  })().finally(() => {
    mergeInFlight = null;
  });

  return mergeInFlight;
}
