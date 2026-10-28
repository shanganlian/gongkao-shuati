/**
 * 面试大厅 v1.0 · 评分与历史服务
 *
 * 调用链：录音结束 → 本文件 POST /api/interview-review → 服务端 DeepSeek（失败则本地规则）
 * 前端只信任 isInterviewReview 校验通过的结构；网络超时/结构异常/字数不足一律本地兜底，
 * 且 review.provider='local' + degraded=true 原样往上传，UI 必须显示“本地规则评分”。
 */
import type {
  ExpressionMetrics,
  InterviewQuestion,
  InterviewReview,
  InterviewSessionRecord,
} from '../types';
import {
  ANSWER_MIN_CHARS,
  INTERVIEW_REVIEW_ENDPOINT,
  isInterviewReview,
  type InterviewReviewQuestionPayload,
  type InterviewReviewRequest,
} from '../../shared/interview-review';
import { buildLocalInterviewReview, computeExpressionMetrics } from '../lib/interviewScoring';
import { authFetch } from '../lib/authFetch';

/** 略大于服务端 26s，保证先收到服务端降级结果，而不是前端先 abort */
const CLIENT_TIMEOUT_MS = 30000;
const HISTORY_KEY = 'xingan_interview_sessions_v1';
const HISTORY_LIMIT = 50;

export interface RequestInterviewReviewParams {
  question: InterviewQuestion;
  answerText: string;
  durationSeconds: number;
  inputMode: 'voice' | 'typing';
}

function toQuestionPayload(question: InterviewQuestion): InterviewReviewQuestionPayload {
  return {
    id: question.id,
    category: question.category,
    subType: question.subType,
    difficulty: question.difficulty,
    scene: question.scene,
    title: question.title,
    task: question.task,
    answerSeconds: question.answerSeconds,
    keyPoints: question.keyPoints,
    pitfalls: question.pitfalls || [],
    referenceOutline: question.referenceOutline || [],
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '未知错误';
}

/**
 * 请求 AI 复盘。永远 resolve：失败时返回本地规则报告（degraded=true），由报告页显式提示。
 */
export async function requestInterviewReview(
  params: RequestInterviewReviewParams
): Promise<InterviewReview> {
  const { question, answerText, durationSeconds, inputMode } = params;
  const metrics = computeExpressionMetrics(answerText, durationSeconds);
  const trimmed = answerText.trim();

  if (metrics.charCount < ANSWER_MIN_CHARS) {
    return buildLocalInterviewReview({
      question: toQuestionPayload(question),
      answerText: trimmed,
      metrics,
      reason: `有效作答不足 ${ANSWER_MIN_CHARS} 字，未调用 AI，先用本地规则给出骨架反馈`,
    });
  }

  const body: InterviewReviewRequest = {
    question: toQuestionPayload(question),
    answerText: trimmed,
    durationSeconds,
    inputMode,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await authFetch(INTERVIEW_REVIEW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const data = await res.json();
        detail = typeof data?.error === 'string' ? data.error : '';
      } catch {
        /* 忽略非 JSON 错误体 */
      }
      throw new Error(`HTTP ${res.status}${detail ? `：${detail}` : ''}`);
    }

    const data = await res.json();
    if (isInterviewReview(data?.review)) {
      return {
        ...data.review,
        metrics: data.review.metrics || metrics,
      };
    }
    throw new Error('服务端返回的评分结构不完整');
  } catch (err) {
    const reason = controller.signal.aborted
      ? 'AI 评分超时（30 秒），已用本地规则给出骨架反馈'
      : `AI 评分不可用：${errorMessage(err)}，已用本地规则给出骨架反馈`;
    return buildLocalInterviewReview({
      question: toQuestionPayload(question),
      answerText: trimmed,
      metrics,
      reason,
    });
  } finally {
    clearTimeout(timer);
  }
}

function newRecordId(): string {
  return `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export interface SaveInterviewSessionParams extends RequestInterviewReviewParams {
  review: InterviewReview;
  /** 开始作答的时间；不传则按 durationSeconds 反推 */
  startedAt?: string;
}

/** 追加一条练习记录（最多保留 50 条，最新在前） */
export function saveInterviewSession(params: SaveInterviewSessionParams): InterviewSessionRecord | null {
  if (!canUseStorage()) return null;
  const { question, answerText, durationSeconds, inputMode, review } = params;
  const metrics: ExpressionMetrics =
    review.metrics || computeExpressionMetrics(answerText, durationSeconds);
  const startedAt =
    params.startedAt || new Date(Date.now() - Math.max(0, durationSeconds) * 1000).toISOString();

  const record: InterviewSessionRecord = {
    id: newRecordId(),
    questionId: question.id,
    questionTitle: question.title,
    category: question.category,
    difficulty: question.difficulty,
    startedAt,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    answerText,
    inputMode,
    metrics,
    review,
    provider: review.provider,
  };

  try {
    const existing = loadInterviewSessions();
    const next = [record, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return record;
  } catch (err) {
    console.warn('[interview] 保存练习记录失败', err);
    return null;
  }
}

function isSessionRecord(value: any): value is InterviewSessionRecord {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.questionId === 'string' &&
    typeof value.startedAt === 'string' &&
    isInterviewReview(value.review)
  );
}

/** 读取历史；坏数据直接跳过，不让一条脏记录拖垮整个页面 */
export function loadInterviewSessions(): InterviewSessionRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionRecord).slice(0, HISTORY_LIMIT);
  } catch (err) {
    console.warn('[interview] 读取练习记录失败', err);
    return [];
  }
}

export function deleteInterviewSession(id: string): void {
  if (!canUseStorage()) return;
  try {
    const next = loadInterviewSessions().filter((record) => record.id !== id);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[interview] 删除练习记录失败', err);
  }
}

export function clearInterviewSessions(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    console.warn('[interview] 清空练习记录失败', err);
  }
}

export interface InterviewHistoryStats {
  total: number;
  bestScore: number;
  averageScore: number;
  lastPracticedAt: string | null;
  /** 各题型练习次数，用于大厅展示“还差哪类没练” */
  categoryCounts: Record<string, number>;
  degradedCount: number;
}

export function summarizeInterviewHistory(records: InterviewSessionRecord[]): InterviewHistoryStats {
  const categoryCounts: Record<string, number> = {};
  let scoreSum = 0;
  let bestScore = 0;
  let degradedCount = 0;

  records.forEach((record) => {
    const score = Number(record.review?.overallScore) || 0;
    scoreSum += score;
    bestScore = Math.max(bestScore, score);
    categoryCounts[record.category] = (categoryCounts[record.category] || 0) + 1;
    if (record.review?.degraded) degradedCount += 1;
  });

  return {
    total: records.length,
    bestScore,
    averageScore: records.length ? Math.round(scoreSum / records.length) : 0,
    lastPracticedAt: records.length > 0 ? records[0].startedAt : null,
    categoryCounts,
    degradedCount,
  };
}

