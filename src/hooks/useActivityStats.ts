import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  adoptGuestActivity,
  buildActivityStats,
  recordCheckInEvent,
  recordMindsetEvents,
  recordPlanTaskEvent,
  recordQuestionEvents,
} from '../lib/activityStats';
import type {
  ActivityStats,
  MindsetCompletionInput,
  RecordedQuestionInput,
  RemoteActivitySnapshot,
} from '../lib/activityStats';
import { fetchRemoteActivity } from '../services/activityStatsService';

/**
 * 全站唯一的学习活动统计入口。
 * 游客读 localStorage；登录用户优先合并 Supabase，网络失败也不会把页面打空。
 */
export function useActivityStats() {
  const { user, mergeVersion } = useAuth();
  const scope = user?.id || 'guest';

  const [stats, setStats] = useState<ActivityStats>(() => buildActivityStats({
    scope: 'guest',
    includeGuestHistory: true,
  }));
  const [loading, setLoading] = useState<boolean>(false);
  const remoteRef = useRef<RemoteActivitySnapshot | null>(null);
  const scopeRef = useRef<string>(scope);
  const aliveRef = useRef<boolean>(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const rebuildLocal = useCallback((targetScope: string, remote: RemoteActivitySnapshot | null) => {
    const next = buildActivityStats({
      scope: targetScope,
      includeGuestHistory: targetScope === 'guest',
      remote,
    });
    if (aliveRef.current) setStats(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const targetScope = scopeRef.current;
    if (targetScope === 'guest') {
      rebuildLocal('guest', null);
      return;
    }

    setLoading(true);
    try {
      const remote = await fetchRemoteActivity();
      if (scopeRef.current !== targetScope) return;
      remoteRef.current = remote;
      rebuildLocal(targetScope, remote);
    } finally {
      if (scopeRef.current === targetScope && aliveRef.current) setLoading(false);
    }
  }, [rebuildLocal]);

  useEffect(() => {
    scopeRef.current = scope;
    remoteRef.current = null;

    if (scope === 'guest') {
      rebuildLocal('guest', null);
      setLoading(false);
      return;
    }

    adoptGuestActivity(scope);
    rebuildLocal(scope, null);
    void refresh();
  }, [scope, mergeVersion, rebuildLocal, refresh]);

  const recordQuestions = useCallback((records: RecordedQuestionInput[]) => {
    recordQuestionEvents(scopeRef.current, records);
    rebuildLocal(scopeRef.current, remoteRef.current);
  }, [rebuildLocal]);

  const recordMindset = useCallback((input?: MindsetCompletionInput) => {
    recordMindsetEvents(scopeRef.current, input);
    rebuildLocal(scopeRef.current, remoteRef.current);
  }, [rebuildLocal]);

  const recordCheckIn = useCallback(() => {
    recordCheckInEvent(scopeRef.current);
    rebuildLocal(scopeRef.current, remoteRef.current);
  }, [rebuildLocal]);

  const recordPlanTask = useCallback((taskId?: string) => {
    recordPlanTaskEvent(scopeRef.current, taskId);
    rebuildLocal(scopeRef.current, remoteRef.current);
  }, [rebuildLocal]);

  return {
    stats,
    loading,
    isGuest: !user,
    refresh,
    recordQuestions,
    recordMindset,
    recordCheckIn,
    recordPlanTask,
  };
}
