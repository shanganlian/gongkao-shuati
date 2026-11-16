import React from 'react';
import { ImageOff, SkipForward } from 'lucide-react';

interface MissingFigurePlaceholderProps {
  /** 参考答案：缺图时也能先核对答案 */
  answer?: string;
  /** 跳过本题；只读列表（错题本 / 复习 / 试卷）不传，则不显示按钮 */
  onSkip?: () => void;
  /** 紧凑模式（用于列表内嵌） */
  compact?: boolean;
}

/**
 * 「本题配图缺失」占位卡片。
 *
 * 图形推理 / 图表题的图片资源尚未抽取入库时，题干只剩文字，用户会看到「无图」的图形题。
 * 这里统一给出缺图提示 + 跳过入口；等 imageUrl 补齐后，调用方不再渲染本组件，自动恢复配图。
 */
export const MissingFigurePlaceholder: React.FC<MissingFigurePlaceholderProps> = ({
  answer,
  onSkip,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50/70 dark:bg-amber-900/20 border border-dashed border-amber-300/80 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200">
        <ImageOff className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-0">本题配图缺失，暂无法展示图形</span>
        {answer && <span className="ml-auto shrink-0 font-semibold">答案：{answer}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-900/20 p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5">
        <ImageOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
            本题配图缺失
          </p>
          <p className="text-[11px] sm:text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
            原题为图形推理 / 图表类，图片资源尚未入库，题干图形暂无法展示
            {answer ? `（参考答案：${answer}）` : ''}。
            {onSkip
              ? '可先跳过本题继续练习，图片补录后会自动恢复。'
              : '图片补录后会自动恢复展示，可先对照参考解析复习。'}
          </p>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
              跳过本题
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
