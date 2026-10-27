/**
 * 面试大厅 v1.0 · 徽标小组件
 */
import React from 'react';
import { Bot, Cpu, Sparkles } from 'lucide-react';
import type {
  InterviewQuestionCategory,
  InterviewQuestionDifficulty,
  InterviewReviewProvider,
} from '../../types';
import {
  CATEGORY_BADGE_STYLES,
  DIFFICULTY_BADGE_STYLES,
  gradeTone,
  providerLabel,
} from './interviewUtils';

export const InterviewCategoryBadge: React.FC<{ category: InterviewQuestionCategory }> = ({
  category,
}) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
      CATEGORY_BADGE_STYLES[category] || 'bg-slate-50 text-slate-600 border-slate-200'
    }`}
  >
    {category}
  </span>
);

export const InterviewDifficultyBadge: React.FC<{ difficulty: InterviewQuestionDifficulty }> = ({
  difficulty,
}) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
      DIFFICULTY_BADGE_STYLES[difficulty] || 'bg-slate-50 text-slate-600 border-slate-200'
    }`}
  >
    {difficulty}
  </span>
);

export const InterviewProviderBadge: React.FC<{
  provider: InterviewReviewProvider;
  degraded?: boolean;
  compact?: boolean;
}> = ({ provider, degraded, compact }) => {
  const local = provider === 'local' || degraded;
  const Icon = local ? Cpu : Bot;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${
        local
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-indigo-200 bg-indigo-50 text-indigo-700'
      }`}
      title={local ? 'AI 不可用时的本地规则兜底' : 'DeepSeek 在线评分'}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {providerLabel(provider, degraded)}
    </span>
  );
};

export const InterviewGradeBadge: React.FC<{ grade: string }> = ({ grade }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${gradeTone(
      grade
    )}`}
  >
    <Sparkles className="h-3 w-3" />
    {grade}
  </span>
);
