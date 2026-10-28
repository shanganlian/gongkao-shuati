import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  AUTH_DAILY_LIMIT,
  GUEST_DAILY_LIMIT,
  consumeGuestQuota,
  getGuestQuota,
  todayKey,
  type GuestConsumeMeta,
} from '../lib/guestStore';

/**
 * 每日额度：游客 10 题/日，登录 50 题/日。
 * 登录态以服务端 user_quota 为准（SECURITY DEFINER 原子扣减）。
 * 若迁移尚未执行（RPC 不存在），自动降级为本地计数并标记 degraded，
 * 保证页面仍可用，同时控制台给出明确告警。
 */

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  loading: boolean;
  degraded: boolean;
}

export interface SingleConsumeResult {
  allowed: boolean;
  charged?: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

export interface BatchQuotaItem {
  question_id: string;
  selected_key?: string | null;
  is_correct?: boolean | null;
  source?: string;
}

export interface BatchConsumeResult {
  allowed: boolean;
  charged: number;
  blocked: number;
  allowedIds: string[];
  blockedIds: string[];
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

interface LocalQuota {
  date: string;
  count: number;
  questionIds: string[];
}

const LOCAL_PREFIX = 'xingan_local_quota_v1_';

function readLocalQuota(userId: string): LocalQuota {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${userId}`);
    if (!raw) return { date: today, count: 0, questionIds: [] };
    const parsed = JSON.parse(raw) as LocalQuota;
    if (!parsed || parsed.date !== today || !Array.isArray(parsed.questionIds)) {
      return { date: today, count: 0, questionIds: [] };
    }
    return {
      date: today,
      count: Math.max(0, Math.min(Number(parsed.count) || 0, AUTH_DAILY_LIMIT)),
      questionIds: parsed.questionIds.filter(id => typeof id === 'string'),
    };
  } catch (e) {
    return { date: today, count: 0, questionIds: [] };
  }
}

function writeLocalQuota(userId: string, quota: LocalQuota): void {
  try {
    localStorage.setItem(`${LOCAL_PREFIX}${userId}`, JSON.stringify(quota));
  } catch (e) {
    /* ignore */
  }
}

function makeState(used: number, limit: number, degraded: boolean): QuotaState {
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    loading: false,
    degraded,
  };
}

function localConsume(userId: string, questionId: string, meta: GuestConsumeMeta): SingleConsumeResult {
  const quota = readLocalQuota(userId);
  if (quota.questionIds.includes(questionId)) {
    return { allowed: true, charged: false, ...makeState(quota.count, AUTH_DAILY_LIMIT, true) };
  }
  if (quota.count >= AUTH_DAILY_LIMIT) {
    return { allowed: false, charged: false, ...makeState(quota.count, AUTH_DAILY_LIMIT, true), reason: 'quota_exhausted' };
  }
  const next = { ...quota, count: quota.count + 1, questionIds: [...quota.questionIds, questionId] };
  writeLocalQuota(userId, next);
  return { allowed: true, charged: true, ...makeState(next.count, AUTH_DAILY_LIMIT, true) };
}

export function useQuota() {
  const { user, mergeVersion } = useAuth();
  const isGuest = !user;

  const [state, setState] = useState<QuotaState>(() => {
    if (user) {
      return { used: 0, limit: AUTH_DAILY_LIMIT, remaining: AUTH_DAILY_LIMIT, loading: true, degraded: false };
    }
    const guest = getGuestQuota();
    return makeState(guest.count, GUEST_DAILY_LIMIT, false);
  });

  const refresh = useCallback(async () => {
    if (!user) {
      const guest = getGuestQuota();
      setState(makeState(guest.count, GUEST_DAILY_LIMIT, false));
      return;
    }

    const { data, error } = await supabase.rpc('get_daily_quota');
    if (error || !data) {
      const local = readLocalQuota(user.id);
      console.warn(
        '[quota] get_daily_quota 不可用，已降级为本地计数。请先执行 supabase/migrations/create_user_quota.sql：',
        error?.message
      );
      setState(makeState(local.count, AUTH_DAILY_LIMIT, true));
      return;
    }

    const payload = data as Record<string, unknown>;
    const used = Number(payload.used) || 0;
    const limit = Number(payload.limit) || AUTH_DAILY_LIMIT;
    setState(makeState(used, limit, false));
  }, [user?.id, mergeVersion]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const consume = useCallback(
    async (questionId: string, meta: GuestConsumeMeta = {}): Promise<SingleConsumeResult> => {
      if (!user) {
        const outcome = consumeGuestQuota(questionId, meta);
        setState(makeState(outcome.used, outcome.limit, false));
        return outcome;
      }

      const { data, error } = await supabase.rpc('consume_question_quota', {
        p_question_id: questionId,
        p_selected_key: meta.selectedKey ?? null,
        p_is_correct: typeof meta.isCorrect === 'boolean' ? meta.isCorrect : null,
        p_source: meta.source || 'drill',
      });

      if (error || !data) {
        console.warn('[quota] consume_question_quota 不可用，已降级为本地计数：', error?.message);
        const fallback = localConsume(user.id, questionId, meta);
        setState(makeState(fallback.used, fallback.limit, true));
        return fallback;
      }

      const payload = data as Record<string, unknown>;
      const used = Number(payload.used) || 0;
      const limit = Number(payload.limit) || AUTH_DAILY_LIMIT;
      setState(makeState(used, limit, false));

      return {
        allowed: payload.allowed !== false,
        charged: payload.charged === true,
        used,
        limit,
        remaining: Number(payload.remaining) || 0,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      };
    },
    [user?.id]
  );

  const consumeBatch = useCallback(
    async (items: BatchQuotaItem[], source: string = 'paper'): Promise<BatchConsumeResult> => {
      const list = Array.isArray(items) ? items.filter(item => item && item.question_id) : [];

      if (!user) {
        const allowedIds: string[] = [];
        const blockedIds: string[] = [];
        let charged = 0;
        for (const item of list) {
          const outcome = consumeGuestQuota(item.question_id, {
            selectedKey: item.selected_key ?? null,
            isCorrect: item.is_correct ?? null,
            source: item.source || source,
          });
          if (outcome.allowed) {
            allowedIds.push(item.question_id);
            if (outcome.charged) charged += 1;
          } else {
            blockedIds.push(item.question_id);
          }
        }
        const guest = getGuestQuota();
        setState(makeState(guest.count, GUEST_DAILY_LIMIT, false));
        return {
          allowed: blockedIds.length === 0,
          charged,
          blocked: blockedIds.length,
          allowedIds,
          blockedIds,
          used: guest.count,
          limit: GUEST_DAILY_LIMIT,
          remaining: Math.max(GUEST_DAILY_LIMIT - guest.count, 0),
          reason: blockedIds.length > 0 ? 'guest_limit' : undefined,
        };
      }

      const runLocal = (): BatchConsumeResult => {
        const allowedIds: string[] = [];
        const blockedIds: string[] = [];
        let charged = 0;
        for (const item of list) {
          const outcome = localConsume(user.id, item.question_id, {
            selectedKey: item.selected_key ?? null,
            isCorrect: item.is_correct ?? null,
            source: item.source || source,
          });
          if (outcome.allowed) {
            allowedIds.push(item.question_id);
            if (outcome.charged) charged += 1;
          } else {
            blockedIds.push(item.question_id);
          }
        }
        const local = readLocalQuota(user.id);
        return {
          allowed: blockedIds.length === 0,
          charged,
          blocked: blockedIds.length,
          allowedIds,
          blockedIds,
          used: local.count,
          limit: AUTH_DAILY_LIMIT,
          remaining: Math.max(AUTH_DAILY_LIMIT - local.count, 0),
          reason: blockedIds.length > 0 ? 'quota_exhausted' : undefined,
        };
      };

      if (list.length === 0) {
        return {
          allowed: true,
          charged: 0,
          blocked: 0,
          allowedIds: [],
          blockedIds: [],
          used: state.used,
          limit: state.limit || AUTH_DAILY_LIMIT,
          remaining: Math.max((state.limit || AUTH_DAILY_LIMIT) - state.used, 0),
        };
      }

      const { data, error } = await supabase.rpc('consume_question_quota_batch', {
        p_items: list,
        p_source: source,
      });

      if (error || !data) {
        console.warn('[quota] consume_question_quota_batch 不可用，已降级为本地计数：', error?.message);
        const fallback = runLocal();
        setState(makeState(fallback.used, fallback.limit, true));
        return fallback;
      }

      const payload = data as Record<string, unknown>;
      const used = Number(payload.used) || 0;
      const limit = Number(payload.limit) || AUTH_DAILY_LIMIT;
      const allowedIds = Array.isArray(payload.allowed_ids) ? payload.allowed_ids.map(String) : [];
      const blockedIds = Array.isArray(payload.blocked_ids) ? payload.blocked_ids.map(String) : [];

      setState(makeState(used, limit, false));

      return {
        allowed: payload.allowed !== false,
        charged: Number(payload.charged) || 0,
        blocked: Number(payload.blocked) || blockedIds.length,
        allowedIds,
        blockedIds,
        used,
        limit,
        remaining: Number(payload.remaining) || 0,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      };
    },
    [user?.id, state.used, state.limit, state.degraded]
  );

  return {
    ...state,
    isGuest,
    exhausted: !state.loading && state.remaining <= 0,
    refresh,
    consume,
    consumeBatch,
  };
}
