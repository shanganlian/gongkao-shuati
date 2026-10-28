import React from 'react';
import { Crown, X } from 'lucide-react';

interface QuotaLimitDialogProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

/** 额度耗尽拦截弹窗：明确告诉用户"明天再来"或"升级会员" */
export const QuotaLimitDialog: React.FC<QuotaLimitDialogProps> = ({ open, onClose, onUpgrade }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">今日额度已用完</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">每天 0 点（北京时间）自动重置</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          今日额度已用完，明天再来，或升级会员解锁更多题目。已答过的错题与答题历史不会丢失。
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => {
              onClose();
              onUpgrade();
            }}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            升级会员（面试大厅上线时开放）
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg cursor-pointer"
          >
            明天再来
          </button>
        </div>
      </div>
    </div>
  );
};
