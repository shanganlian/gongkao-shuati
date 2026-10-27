/**
 * 面试大厅 v1.0 · 展示层公共工具
 */
import type {
  InterviewQuestionCategory,
  InterviewQuestionDifficulty,
  InterviewReviewProvider,
} from '../../types';

export const INTERVIEW_CATEGORIES: InterviewQuestionCategory[] = [
  '综合分析',
  '组织管理',
  '应急应变',
  '人际沟通',
  '自我认知',
  '言语表达',
];

export const INTERVIEW_DIFFICULTIES: InterviewQuestionDifficulty[] = ['基础', '中等', '拔高'];

export const CATEGORY_BADGE_STYLES: Record<InterviewQuestionCategory, string> = {
  综合分析: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  组织管理: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  应急应变: 'bg-rose-50 text-rose-700 border-rose-200',
  人际沟通: 'bg-amber-50 text-amber-700 border-amber-200',
  自我认知: 'bg-sky-50 text-sky-700 border-sky-200',
  言语表达: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const DIFFICULTY_BADGE_STYLES: Record<InterviewQuestionDifficulty, string> = {
  基础: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  中等: 'bg-amber-50 text-amber-700 border-amber-200',
  拔高: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatFullDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  if (safe < 60) return `${safe} 秒`;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return secs > 0 ? `${mins} 分 ${secs} 秒` : `${mins} 分钟`;
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function effectiveCharCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

export function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export function providerLabel(provider: InterviewReviewProvider, degraded?: boolean): string {
  if (provider === 'local' || degraded) return '本地规则评分';
  return 'DeepSeek AI 评分';
}

export function providerDescription(provider: InterviewReviewProvider, degraded?: boolean): string {
  if (provider === 'local' || degraded) {
    return 'AI 评分不可用，本次由本地关键词与结构规则生成，结果仅供骨架参考。';
  }
  return '本次由 DeepSeek 按采分点逐条对照生成。';
}

export function gradeTone(grade: string): string {
  if (grade === '优秀') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (grade === '良好') return 'text-sky-600 bg-sky-50 border-sky-200';
  if (grade === '中等') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-rose-600 bg-rose-50 border-rose-200';
}

export function scoreTone(score: number): string {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-sky-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

export function truncateText(text: string, max = 90): string {
  const chars = Array.from(text || '');
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}
