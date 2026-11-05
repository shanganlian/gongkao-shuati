import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface AbnormalQuestionPlaceholderProps {
  /** 题目 id，便于用户反馈时定位 */
  questionId?: string;
  /** 紧凑模式（用于列表内嵌） */
  compact?: boolean;
}

/**
 * 「本题数据整理中」占位卡片。
 *
 * 用于多题合并等无法自动修复的脏数据：
 * 不渲染题干和选项（内容本身是错的），只显示占位提示，
 * 避免用户看到串题的混乱内容，也避免渲染出错。
 */
export const AbnormalQuestionPlaceholder: React.FC<AbnormalQuestionPlaceholderProps> = ({
  questionId,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50/70 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-200">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>本题数据整理中，暂不可作答</span>
        {questionId && <span className="text-slate-400/70 ml-auto font-mono text-[10px]">{questionId}</span>}
      </div>
    );
  }

  return (
    <div className="bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 rounded-2xl p-6 space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="text-sm font-semibold">本题数据整理中</span>
      </div>
      <p className="text-xs text-slate-500/80 dark:text-slate-400/80 leading-relaxed">
        该题原始数据存在格式问题（疑似多题合并），正在重新整理，暂不可作答。
        你可以先跳过本题继续练习。
      </p>
      {questionId && (
        <p className="text-[10px] text-slate-400/70 font-mono">题目编号：{questionId}</p>
      )}
    </div>
  );
};
