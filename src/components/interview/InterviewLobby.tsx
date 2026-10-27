/**
 * 面试大厅 v1.0 · 大厅入口
 * 历史统计统一走 summarizeInterviewHistory，保证与历史页同口径。
 */
import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  History,
  Layers,
  Mic,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { InterviewQuestion, InterviewSessionRecord } from '../../types';
import { summarizeInterviewHistory } from '../../services/interviewReviewService';
import {
  INTERVIEW_CATEGORIES,
  formatDateTime,
  formatDuration,
  scoreTone,
} from './interviewUtils';
import { InterviewGradeBadge, InterviewProviderBadge } from './InterviewBadges';

interface InterviewLobbyProps {
  questions: InterviewQuestion[];
  records: InterviewSessionRecord[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenPicker: () => void;
  onStartQuestion: (questionId: string) => void;
  onOpenHistory: () => void;
  onOpenRecord: (recordId: string) => void;
}

export const InterviewLobby: React.FC<InterviewLobbyProps> = ({
  questions,
  records,
  loading,
  error,
  onReload,
  onOpenPicker,
  onStartQuestion,
  onOpenHistory,
  onOpenRecord,
}) => {
  const stats = summarizeInterviewHistory(records);
  const recent = records.slice(0, 3);
  const practicedIds = new Set(records.map((record) => record.questionId));
  const practicedCount = questions.filter((question) => practicedIds.has(question.id)).length;
  const unpracticed = questions.filter((question) => !practicedIds.has(question.id));
  const categoryStats = INTERVIEW_CATEGORIES.map((category) => {
    const total = questions.filter((question) => question.category === category).length;
    const done = questions.filter(
      (question) => question.category === category && practicedIds.has(question.id)
    ).length;
    return { category, total, done, rate: total ? Math.round((done / total) * 100) : 0 };
  });
  const suggested = [...categoryStats].sort((a, b) => {
    const rateA = a.total ? a.done / a.total : 1;
    const rateB = b.total ? b.done / b.total : 1;
    return rateA - rateB;
  })[0];

  const handleRandom = () => {
    const pool = unpracticed.length > 0 ? unpracticed : questions;
    if (!pool.length) return;
    const question = pool[Math.floor(Math.random() * pool.length)];
    onStartQuestion(question.id);
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-emerald-500/10 blur-2xl" />
        <div className="relative grid gap-7 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-indigo-100">
              <Mic className="h-3.5 w-3.5" />
              结构化面试 · 单人闭环 v1.0
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">把每一次开口，练成考场本能</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              100 题结构化题库，思考与作答双倒计时，语音实时转写；结束后按采分点逐条对照，
              漏掉的主线采分点会被点名。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={onOpenPicker}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition-colors hover:bg-indigo-50"
              >
                <BookOpen className="h-4 w-4" />
                进入题库抽题
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleRandom}
                disabled={!questions.length}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                随机抽一题
              </button>
              <button
                onClick={onOpenHistory}
                className="inline-flex items-center gap-2 px-2 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
              >
                <History className="h-4 w-4" />
                练习历史
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '累计练习', value: stats.total, suffix: '次', icon: Flame },
              {
                label: '最高分',
                value: stats.total ? stats.bestScore : '—',
                suffix: stats.total ? '分' : '',
                icon: TrendingUp,
              },
              {
                label: '平均分',
                value: stats.total ? stats.averageScore : '—',
                suffix: stats.total ? '分' : '',
                icon: BarChart3,
              },
              {
                label: '已练题目',
                value: loading ? '…' : `${practicedCount}/${questions.length || 100}`,
                suffix: '',
                icon: Target,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    {item.label}
                    <Icon className="h-3.5 w-3.5 text-indigo-300" />
                  </div>
                  <div className="mt-2 text-xl font-black tabular-nums text-white">
                    {item.value}
                    {item.suffix && (
                      <span className="ml-0.5 text-xs font-medium text-slate-400">{item.suffix}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={onReload}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Layers className="h-4 w-4 text-indigo-600" />
                题型覆盖
              </h2>
              <p className="mt-1 text-xs text-slate-500">按已练过的题目去重统计，不按练习次数堆高。</p>
            </div>
            <button
              onClick={onOpenPicker}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              去抽题
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3.5">
            {categoryStats.map((item) => (
              <div key={item.category}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{item.category}</span>
                  <span className="tabular-nums text-slate-500">
                    {item.done}/{item.total}
                    <span className="ml-1.5 text-slate-400">{item.rate}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.max(item.rate, item.done > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {suggested && questions.length > 0 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                下一步建议优先补 <span className="font-bold">{suggested.category}</span>
                （已练 {suggested.done}/{suggested.total}）。先把覆盖面铺开，再回头打磨拔高题。
              </p>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Clock className="h-4 w-4 text-emerald-600" />
                最近练习
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {stats.lastPracticedAt
                  ? `上次练习于 ${formatDateTime(stats.lastPracticedAt)}`
                  : '还没有练习记录'}
              </p>
            </div>
            <button
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              全部
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-9 text-center">
              <Play className="h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">从第一题开始</p>
              <p className="mt-1 text-xs text-slate-500">完成一题后会在这里出现分数与采分点命中情况。</p>
              <button
                onClick={onOpenPicker}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                抽一道题
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recent.map((record) => (
                <button
                  key={record.id}
                  onClick={() => onOpenRecord(record.id)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/80 p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
                    <span
                      className={`text-sm font-black tabular-nums ${scoreTone(record.review.overallScore)}`}
                    >
                      {record.review.overallScore}
                    </span>
                    <span className="text-[9px] text-slate-400">分</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500">{record.category}</span>
                      <InterviewGradeBadge grade={record.review.grade} />
                      <InterviewProviderBadge
                        provider={record.provider}
                        degraded={record.review.degraded}
                        compact
                      />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800 group-hover:text-indigo-700">
                      {record.questionTitle}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatDateTime(record.startedAt)} · {formatDuration(record.durationSeconds)} · 命中{' '}
                      {record.review.pointsHitCount}/{record.review.pointsTotal}
                    </p>
                  </div>
                  <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p>
            <span className="font-semibold text-slate-700">评分口径：</span>
            优先调用 DeepSeek；密钥缺失、超时或结构异常时自动切换本地规则，报告页会明确标注实际引擎，
            不会把本地规则包装成“AI 点评”。
          </p>
        </div>
        {stats.degradedCount > 0 && (
          <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-700">
            历史中有 {stats.degradedCount} 次本地规则评分
          </span>
        )}
      </section>
    </div>
  );
};
