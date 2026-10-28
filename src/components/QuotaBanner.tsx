import React from 'react';
import { AlertTriangle, Crown, Gauge, LogIn } from 'lucide-react';

interface QuotaBannerProps {
  used: number;
  limit: number;
  remaining: number;
  isGuest: boolean;
  loading?: boolean;
  degraded?: boolean;
  onLogin: () => void;
  onUpgrade: () => void;
}

/**
 * 刷题页额度条：游客 10 题/日、登录 50 题/日。
 * 纯展示组件，额度状态由 PracticeArena 的 useQuota 统一持有，
 * 避免多个组件各持一份状态导致扣减后不刷新。
 */
export const QuotaBanner: React.FC<QuotaBannerProps> = ({
  used,
  limit,
  remaining,
  isGuest,
  loading,
  degraded,
  onLogin,
  onUpgrade,
}) => {
  const safeLimit = limit > 0 ? limit : 1;
  const percent = Math.min(100, Math.round((used / safeLimit) * 100));
  const exhausted = !loading && remaining <= 0;

  return (
    <div className={`rounded-xl border p-3.5 ${exhausted ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200/80'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <Gauge className={`w-4 h-4 ${exhausted ? 'text-rose-500' : 'text-emerald-600'}`} />
          <span className="font-bold text-slate-800">
            {isGuest ? '游客免费额度' : '今日刷题额度'}
          </span>
          <span className="font-mono text-slate-600">
            {loading ? '计算中...' : `${used} / ${limit}`}
          </span>
          {isGuest && (
            <span className="text-[11px] text-slate-500">登录后每日 50 题</span>
          )}
          {degraded && (
            <span className="flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="w-3 h-3" />
              本地计数（额度服务未初始化）
            </span>
          )}
        </div>

        {isGuest ? (
          <button
            onClick={onLogin}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg cursor-pointer"
          >
            <LogIn className="w-3 h-3" />
            登录领 50 题
          </button>
        ) : exhausted ? (
          <button
            onClick={onUpgrade}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg cursor-pointer"
          >
            <Crown className="w-3 h-3" />
            升级会员
          </button>
        ) : null}
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            exhausted ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {exhausted && (
        <p className="mt-2 text-[11px] font-semibold text-rose-700">
          今日额度已用完，明天再来，或升级会员解锁更多题目。
        </p>
      )}
    </div>
  );
};
