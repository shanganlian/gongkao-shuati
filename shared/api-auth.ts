import type { Request } from 'express';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * 服务端接口鉴权与统计聚合的共享实现。
 * server.ts（本地/VPS）与 netlify/functions/api.ts 共用，避免两份逻辑漂移。
 */

const DEFAULT_SUPABASE_URL = 'https://axcezfmqjotwcgqnaqro.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y2V6Zm1xam90d2NncW5hcXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDcyMDcsImV4cCI6MjEwNzI4MzIwN30.mlaIpGrQfb1HdAibrTZ222B-L5SbMXGhoEJXVzNC8zc';

export const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export interface AuthContext {
  user: User;
  /** 带请求者 JWT 的客户端，所有查询都受 RLS 约束 */
  client: SupabaseClient;
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function authenticateRequest(req: Request): Promise<AuthContext | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;

  return { user: data.user, client };
}

export function shanghaiDate(date: Date = new Date()): string {
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

export interface TrendPoint {
  date: string;
  count: number;
}

export interface StatsOverview {
  totalAnswered: number;
  correctCount: number;
  accuracy: number;
  streakDays: number;
  activeDays: number;
  trend: TrendPoint[];
  quota: { used: number; limit: number; remaining: number };
}

type AnswerRow = {
  question_id: string;
  is_correct: boolean | null;
  answered_on: string;
};

/** 个人统计总览：只读本人数据，行数上限 2000，避免一次拉全量 */
export async function buildStatsOverview(auth: AuthContext): Promise<StatsOverview> {
  const { data, error } = await auth.client
    .from('answer_records')
    .select('question_id, is_correct, answered_on')
    .order('answered_at', { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  const rows = (data || []) as AnswerRow[];
  const objective = rows.filter(row => typeof row.is_correct === 'boolean');
  const correctCount = objective.filter(row => row.is_correct === true).length;
  const accuracy = objective.length > 0
    ? Math.round((correctCount / objective.length) * 1000) / 10
    : 0;

  const counts = new Map<string, number>();
  rows.forEach(row => {
    if (!row.answered_on) return;
    counts.set(row.answered_on, (counts.get(row.answered_on) || 0) + 1);
  });

  const today = shanghaiDate();
  const trend: TrendPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = shanghaiDate(new Date(Date.now() - i * 86400000));
    trend.push({ date: key, count: counts.get(key) || 0 });
  }

  let streakDays = 0;
  for (let i = 0; i < 366; i += 1) {
    const key = shanghaiDate(new Date(Date.now() - i * 86400000));
    if (counts.has(key)) {
      streakDays += 1;
    } else if (i === 0) {
      // 今天还没开始刷，连续天数允许从昨天起算
      continue;
    } else {
      break;
    }
  }

  const { data: quotaRow } = await auth.client
    .from('user_quota')
    .select('used_count, limit_count')
    .eq('quota_date', today)
    .maybeSingle();

  const used = Number(quotaRow?.used_count) || 0;
  const limit = Number(quotaRow?.limit_count) || 50;

  return {
    totalAnswered: rows.length,
    correctCount,
    accuracy,
    streakDays,
    activeDays: counts.size,
    trend,
    quota: { used, limit, remaining: Math.max(limit - used, 0) },
  };
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  answered_count: number;
  accuracy: number;
}

/** 排行榜走 SECURITY DEFINER 聚合函数，只返回脱敏昵称与聚合指标 */
export async function buildLeaderboard(
  auth: AuthContext,
  limit: number = 20
): Promise<{ entries: LeaderboardEntry[]; error?: string }> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const { data, error } = await auth.client.rpc('get_leaderboard', { p_limit: safeLimit });

  if (error) {
    return { entries: [], error: error.message };
  }
  return { entries: (data || []) as LeaderboardEntry[] };
}
