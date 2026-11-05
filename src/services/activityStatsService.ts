import { supabase } from '../lib/supabase';
import { shiftDateKey } from '../lib/activityStats';
import { todayKey } from '../lib/guestStore';
import type { RemoteActivityDay, RemoteActivitySnapshot } from '../lib/activityStats';

/**
 * 登录用户的真实答题数据（只读）。
 *
 * 线上 `answer_records` 可能尚未执行迁移，因此这里对两张表分别容错：
 *   - answer_records 可用：拿到逐题 id / 正确性，用于正确率与模块雷达；
 *   - user_quota 可用：拿到按日已答数，用于总题数 / 连续天数 / 7 日趋势；
 *   - 两者都不可用：由 activityStats 继续使用本机账本，页面不会出现假数据。
 */

const ANSWER_RECORD_LIMIT = 5000;
const QUOTA_LOOKBACK_DAYS = 366;

export async function fetchRemoteActivity(): Promise<RemoteActivitySnapshot | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) return null;

  const dayMap = new Map<string, RemoteActivityDay>();
  let hasUsableRemoteData = false;

  const getDay = (date: string): RemoteActivityDay => {
    let day = dayMap.get(date);
    if (!day) {
      day = { date, questionIds: [], correctById: {}, fallbackCount: 0 };
      dayMap.set(date, day);
    }
    return day;
  };

  const answersResult = await supabase
    .from('answer_records')
    .select('question_id,is_correct,answered_on')
    .eq('user_id', userId)
    .order('answered_on', { ascending: false })
    .limit(ANSWER_RECORD_LIMIT);

  if (answersResult.error) {
    console.warn('[activity] answer_records 暂不可用，降级读取 user_quota：', answersResult.error.message);
  } else if (Array.isArray(answersResult.data)) {
    hasUsableRemoteData = true;
    answersResult.data.forEach((row: any) => {
      const date = typeof row?.answered_on === 'string' ? row.answered_on.slice(0, 10) : '';
      const questionId = typeof row?.question_id === 'string' ? row.question_id : '';
      if (!date || !questionId) return;
      const day = getDay(date);
      if (!day.questionIds.includes(questionId)) day.questionIds.push(questionId);
      if (typeof row?.is_correct === 'boolean') {
        day.correctById[questionId] = row.is_correct;
      }
    });
  }

  const quotaResult = await supabase
    .from('user_quota')
    .select('quota_date,used_count')
    .eq('user_id', userId)
    .gte('quota_date', shiftDateKey(todayKey(), -QUOTA_LOOKBACK_DAYS))
    .order('quota_date', { ascending: true });

  if (quotaResult.error) {
    console.warn('[activity] user_quota 暂不可用：', quotaResult.error.message);
  } else if (Array.isArray(quotaResult.data)) {
    hasUsableRemoteData = true;
    quotaResult.data.forEach((row: any) => {
      const date = typeof row?.quota_date === 'string' ? row.quota_date.slice(0, 10) : '';
      if (!date) return;
      const used = Number(row?.used_count);
      getDay(date).fallbackCount = Number.isFinite(used) ? Math.max(0, Math.trunc(used)) : 0;
    });
  }

  if (!hasUsableRemoteData) return null;
  return { days: Array.from(dayMap.values()) };
}
