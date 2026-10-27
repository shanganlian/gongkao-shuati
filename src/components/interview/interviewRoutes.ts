/**
 * 面试大厅 v1.0 · 轻量 hash 路由
 *
 * 项目未引入 react-router，面试模块用 hash 子路由实现可刷新 / 可回退：
 *   #/interview/lobby
 *   #/interview/picker
 *   #/interview/session/<questionId>
 *   #/interview/report/<recordId>
 *   #/interview/history
 */

export type InterviewRouteName = 'lobby' | 'picker' | 'session' | 'report' | 'history';

export interface InterviewRoute {
  name: InterviewRouteName;
  questionId?: string;
  recordId?: string;
}

export const INTERVIEW_HASH_PREFIX = '#/interview';
export const DEFAULT_INTERVIEW_ROUTE: InterviewRoute = { name: 'lobby' };

const ROUTE_NAMES: InterviewRouteName[] = ['lobby', 'picker', 'session', 'report', 'history'];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 严格解析面试子路由；非面试 hash 一律回落到大厅 */
export function parseInterviewRoute(hash: string): InterviewRoute {
  const raw = (hash || '').replace(/^#\/?/, '').split('?')[0];
  const segments = raw.split('/').filter(Boolean);
  if (segments[0] !== 'interview') return { ...DEFAULT_INTERVIEW_ROUTE };

  const page = segments[1] as InterviewRouteName | undefined;
  if (!page || !ROUTE_NAMES.includes(page)) return { ...DEFAULT_INTERVIEW_ROUTE };

  if (page === 'session') {
    return { name: 'session', questionId: safeDecode(segments[2] || '') };
  }
  if (page === 'report') {
    return { name: 'report', recordId: safeDecode(segments[2] || '') };
  }
  return { name: page };
}

export function buildInterviewHash(route: InterviewRoute): string {
  if (route.name === 'session') {
    return `${INTERVIEW_HASH_PREFIX}/session/${encodeURIComponent(route.questionId || '')}`;
  }
  if (route.name === 'report') {
    return `${INTERVIEW_HASH_PREFIX}/report/${encodeURIComponent(route.recordId || '')}`;
  }
  return `${INTERVIEW_HASH_PREFIX}/${route.name}`;
}

export function isInterviewHash(hash: string): boolean {
  const normalized = (hash || '').split('?')[0];
  return normalized === INTERVIEW_HASH_PREFIX || normalized.startsWith(`${INTERVIEW_HASH_PREFIX}/`);
}
