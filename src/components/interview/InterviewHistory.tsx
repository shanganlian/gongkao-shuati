/**
 * 面试大厅 v1.0 · 练习记录
 *
 * 统计口径与大厅完全一致（summarizeInterviewHistory）；删除/清空后由父级重新读 localStorage，
 * 页面自身不复制一份 records，避免两处数字对不上。
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  History,
  Play,
  Search,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import type {
  InterviewQuestionCategory,
  InterviewSessionRecord,
} from '../../types';
import {
  clearInterviewSessions,
  deleteInterviewSession,
  summarizeInterviewHistory,
} from '../../services/interviewReviewService';
import {
  INTERVIEW_CATEGORIES,
  formatDateTime,
  formatDuration,
  formatFullDateTime,
  scoreTone,
  truncateText,
} from './interviewUtils';
import {
  InterviewCategoryBadge,
  InterviewGradeBadge,
  InterviewProviderBadge,
} from './InterviewBadges';

interface InterviewHistoryProps {
  records: InterviewSessionRecord[];
  onBack: () => void;
  onOpenRecord: (recordId: string) => void;
  onRetry: (questionId: string) => void;
  onRecordsChanged: () => void;
}

type CategoryFilter = InterviewQuestionCategory | 'all';
type SortKey = 'latest' | 'score' | 'hit';

export const InterviewHistory: React.FC<InterviewHistoryProps> = ({
  records,
  onBack,
  onOpenRecord,
  onRetry,
  onRecordsChanged,
}) => {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortKey>('latest');
  const [onlyLocal, setOnlyLocal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = summarizeInterviewHistory(records);

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    const next = records.filter((record) => {
      if (category !== 'all' && record.category !== category) return false;
      if (onlyLocal && !(record.review.degraded || record.provider === 'local')) return false;
      if (!needle) return true;
      return [record.questionTitle, record.category, record.answerText]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });

    return [...next].sort((a, b) => {
      if (sort === 'score') return b.review.overallScore - a.review.overallScore;
      if (sort === 'hit') {
        const ratioA = a.review.pointsTotal ? a.review.pointsHitCount / a.review.pointsTotal : 0;
        const ratioB = b.review.pointsTotal ? b.review.pointsHitCount / b.review.pointsTotal : 0;
        return ratioB - ratioA;
      }
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
  }, [records, keyword, category, onlyLocal, sort]);

  const selected = filtered.find((record) => record.id === selectedId) || filtered[0] || null;
  const trend = [...records].slice(0, 12).reverse();

  const handleClear = () => {
    if (!window.confirm(`确定清空全部 ${records.length} 条练习记录？此操作不可恢复。`)) return;
    clearInterviewSessions();
    setSelectedId(null);
    onRecordsChanged();
  };

  const handleDelete = (record: InterviewSessionRecord) => {
    if (!window.confirm(`删除“${record.questionTitle}”这条件记录？`)) return;
    deleteInterviewSession(record.id);
    setSelectedId(null);
    onRecordsChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回大厅
          </button>
          <span className="h-4 w-px bg-slate-200" />
          <h1 className="inline-flex items-center gap-1.5 text-base font-bold text-slate-900">
            <History className="h-4 w-4 text-indigo-500" />
            练习记录
          </h1>
        </div>
        <button
          onClick={handleClear}
          disabled={records.length === 0}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空记录
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '累计练习', value: stats.total, unit: '次', icon: <History className="h-4 w-4" />, tone: 'text-indigo-600 bg-indigo-50' },
          { label: '最高分', value: stats.total ? stats.bestScore : '—', unit: stats.total ? '分' : '', icon: <Trophy className="h-4 w-4" />, tone: 'text-amber-600 bg-amber-50' },
          { label: '平均分', value: stats.total ? stats.averageScore : '—', unit: stats.total ? '分' : '', icon: <BarChart3 className="h-4 w-4" />, tone: 'text-sky-600 bg-sky-50' },
          { label: '最近练习', value: stats.lastPracticedAt ? formatDateTime(stats.lastPracticedAt) : '—', unit: '', icon: <Clock className="h-4 w-4" />, tone: 'text-emerald-600 bg-emerald-50' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.tone}`}>{item.icon}</span>
            </div>
            <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
              {item.value}
              {item.unit && <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{item.unit}</span>}
            </p>
          </div>
        ))}
      </section>

      {records.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
              最近 {trend.length} 次得分走势
            </p>
            <p className="text-[10px] text-slate-400">左旧右新 · 柱高为综合分</p>
          </div>
          <div className="mt-3 flex h-20 items-end gap-1">
            {trend.map((record) => (
              <button
                key={record.id}
                onClick={() => setSelectedId(record.id)}
                title={`${record.questionTitle} · ${record.review.overallScore} 分`}
                className="group relative flex h-full flex-1 items-end"
              >
                <span
                  className={`w-full rounded-t transition-all group-hover:opacity-80 ${
                    record.review.overallScore >= 70
                      ? 'bg-indigo-400'
                      : record.review.overallScore >= 60
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  } ${selected?.id === record.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                  style={{ height: `${Math.max(8, Math.min(100, record.review.overallScore))}%` }}
                />
              </button>
            ))}
          </div>
          {stats.degradedCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              其中 {stats.degradedCount} 次为本地规则评分，分数仅作骨架参考。
            </p>
          )}
        </section>
      )}
      {records.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索题目或作答内容"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300"
            >
              <option value="all">全部题型</option>
              {INTERVIEW_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300"
            >
              <option value="latest">按时间（最新）</option>
              <option value="score">按分数（最高）</option>
              <option value="hit">按采分点命中率</option>
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={onlyLocal}
                onChange={(event) => setOnlyLocal(event.target.checked)}
                className="h-3 w-3 accent-amber-500"
              />
              只看本地规则
            </label>
            <span className="text-[10px] text-slate-400">{filtered.length} 条</span>
          </div>
        </section>
      )}

      {records.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
          <History className="h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">还没有练习记录</p>
          <p className="mt-1 text-xs text-slate-500">完成第一道题后，这里会记录分数、采分点命中与改进建议。</p>
          <button
            onClick={onBack}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Play className="h-3.5 w-3.5" />
            去大厅练一道
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <Search className="h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">没有符合条件的记录</p>
          <button
            onClick={() => {
              setKeyword('');
              setCategory('all');
              setOnlyLocal(false);
            }}
            className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            重置筛选
          </button>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">记录列表</p>
              <p className="text-[10px] text-slate-400">点击查看摘要</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {filtered.map((record) => (
                <li key={record.id}>
                  <button
                    onClick={() => setSelectedId(record.id)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition-colors ${
                      selected?.id === record.id ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white ring-1 ring-slate-200">
                      <span className={`text-sm font-black tabular-nums ${scoreTone(record.review.overallScore)}`}>
                        {record.review.overallScore}
                      </span>
                      <span className="text-[8px] text-slate-400">分</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InterviewCategoryBadge category={record.category} />
                        <InterviewGradeBadge grade={record.review.grade} />
                        <InterviewProviderBadge
                          provider={record.provider}
                          degraded={record.review.degraded}
                          compact
                        />
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-800">{record.questionTitle}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDateTime(record.startedAt)} · 命中 {record.review.pointsHitCount}/
                        {record.review.pointsTotal} · {formatDuration(record.durationSeconds)}
                      </p>
                    </div>
                    <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected && (
            <aside className="space-y-3 lg:sticky lg:top-4">
              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">本次摘要</p>
                  <span className="text-[10px] text-slate-400">{formatFullDateTime(selected.startedAt)}</span>
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-end gap-1.5">
                        <span className={`text-3xl font-black tabular-nums ${scoreTone(selected.review.overallScore)}`}>
                          {selected.review.overallScore}
                        </span>
                        <span className="mb-1 text-[10px] text-slate-400">/ 100</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <InterviewGradeBadge grade={selected.review.grade} />
                        <InterviewCategoryBadge category={selected.category} />
                        <InterviewProviderBadge
                          provider={selected.provider}
                          degraded={selected.review.degraded}
                          compact
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Target className="h-3 w-3" />
                        采分点
                      </p>
                      <p className="text-lg font-black tabular-nums text-slate-800">
                        {selected.review.pointsHitCount}
                        <span className="text-[10px] font-semibold text-slate-400">
                          /{selected.review.pointsTotal}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs font-bold leading-5 text-slate-800">{selected.questionTitle}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {formatDuration(selected.durationSeconds)} · {selected.questionId}
                  </p>

                  <div className="mt-3 space-y-2">
                    {[
                      { label: '扣题度', score: selected.review.relevance.score },
                      { label: '逻辑结构', score: selected.review.structure.score },
                      { label: '表达', score: selected.review.expression.score },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-500">{item.label}</span>
                          <span className={`font-black tabular-nums ${scoreTone(item.score)}`}>{item.score}</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-400"
                            style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {selected.review.improvements.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-2.5">
                      <p className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        下轮优先改
                      </p>
                      <ul className="mt-1 space-y-1 text-[11px] leading-5 text-amber-900">
                        {selected.review.improvements.slice(0, 2).map((item, index) => (
                          <li key={`${item.dimension}-${index}`}>· {item.issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold text-slate-400">作答摘录</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      {selected.answerText?.trim()
                        ? truncateText(selected.answerText, 100)
                        : '本题没有留下作答文本。'}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => onOpenRecord(selected.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-[11px] font-bold text-white transition-colors hover:bg-indigo-700"
                    >
                      查看完整报告
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onRetry(selected.questionId)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      再练
                    </button>
                    <button
                      onClick={() => handleDelete(selected)}
                      title="删除这条记录"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
