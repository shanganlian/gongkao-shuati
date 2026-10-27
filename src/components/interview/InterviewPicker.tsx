/**
 * 面试大厅 v1.0 · 题库抽题
 * 左侧筛选列表，右侧题目详情；只显示作答前可见信息，不提前泄露采分点原文。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Filter,
  Play,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  Target,
} from 'lucide-react';
import type {
  InterviewQuestion,
  InterviewQuestionCategory,
  InterviewQuestionDifficulty,
  InterviewSessionRecord,
} from '../../types';
import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_DIFFICULTIES,
  formatDateTime,
} from './interviewUtils';
import {
  InterviewCategoryBadge,
  InterviewDifficultyBadge,
  InterviewGradeBadge,
} from './InterviewBadges';

interface InterviewPickerProps {
  questions: InterviewQuestion[];
  records: InterviewSessionRecord[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onStartQuestion: (questionId: string) => void;
}

type CategoryFilter = InterviewQuestionCategory | 'all';
type DifficultyFilter = InterviewQuestionDifficulty | 'all';

export const InterviewPicker: React.FC<InterviewPickerProps> = ({
  questions,
  records,
  loading,
  error,
  onReload,
  onStartQuestion,
}) => {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [onlyUnpracticed, setOnlyUnpracticed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  const practicedMap = useMemo(() => {
    const map = new Map<string, InterviewSessionRecord>();
    records.forEach((record) => {
      if (!map.has(record.questionId)) map.set(record.questionId, record);
    });
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return questions.filter((question) => {
      if (category !== 'all' && question.category !== category) return false;
      if (difficulty !== 'all' && question.difficulty !== difficulty) return false;
      if (onlyUnpracticed && practicedMap.has(question.id)) return false;
      if (!needle) return true;
      const haystack = [question.title, question.task, question.subType, question.scene, ...question.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [questions, category, difficulty, onlyUnpracticed, keyword, practicedMap]);

  const selected = filtered.find((question) => question.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (selectedId && filtered.some((question) => question.id === selectedId)) return;
    setSelectedId(filtered[0]?.id || null);
  }, [filtered, selectedId]);

  useEffect(() => {
    setVisibleCount(20);
  }, [category, difficulty, onlyUnpracticed, keyword]);

  const visible = filtered.slice(0, visibleCount);
  const lastRecord = selected ? practicedMap.get(selected.id) : undefined;
  const criticalCount = selected ? selected.keyPoints.filter((point) => point.critical).length : 0;

  const handleRandom = () => {
    const pool = filtered.length ? filtered : questions;
    if (!pool.length) return;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    setSelectedId(picked.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">题库抽题</h2>
          <p className="mt-1 text-sm text-slate-500">
            100 题全部通过结构审计。先选一道题，进入后按“思考 — 作答 — 复盘”完整走一遍。
          </p>
        </div>
        <button
          onClick={handleRandom}
          disabled={!questions.length}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Shuffle className="h-4 w-4" />
          在当前筛选结果中随机
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            题型
          </span>
          <button
            onClick={() => setCategory('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              category === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部
          </button>
          {INTERVIEW_CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                category === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">难度</span>
            <button
              onClick={() => setDifficulty('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                difficulty === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              全部
            </button>
            {INTERVIEW_DIFFICULTIES.map((item) => (
              <button
                key={item}
                onClick={() => setDifficulty(item)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  difficulty === item
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={onlyUnpracticed}
                onChange={(event) => setOnlyUnpracticed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              只看未练
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索题干 / 场景 / 标签"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:bg-white sm:w-60"
              />
            </div>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600">
              筛选结果 <span className="tabular-nums text-slate-900">{filtered.length}</span> 题
              {filtered.length !== questions.length && (
                <button
                  onClick={() => {
                    setCategory('all');
                    setDifficulty('all');
                    setKeyword('');
                    setOnlyUnpracticed(false);
                  }}
                  className="ml-2 font-medium text-indigo-600 hover:text-indigo-700"
                >
                  清除筛选
                </button>
              )}
            </p>
            <span className="text-[11px] text-slate-400">点击题目查看详情</span>
          </div>

          {loading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <BookOpen className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">没有符合条件的题目</p>
              <p className="mt-1 text-xs text-slate-500">放宽题型或难度，也可以清空搜索词。</p>
            </div>
          ) : (
            <div className="max-h-[660px] space-y-2 overflow-y-auto p-3">
              {visible.map((question) => {
                const active = selected?.id === question.id;
                const practiced = practicedMap.get(question.id);
                return (
                  <button
                    key={question.id}
                    onClick={() => setSelectedId(question.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200'
                        : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 font-mono text-[10px] text-slate-400">{question.id}</span>
                      <InterviewCategoryBadge category={question.category} />
                      <InterviewDifficultyBadge difficulty={question.difficulty} />
                      {practiced && (
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          已练 {practiced.review.overallScore} 分
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-800">
                      {question.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">{question.task}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        思考 {question.thinkingSeconds}s / 作答 {question.answerSeconds}s
                      </span>
                      <span>·</span>
                      <span>{question.keyPoints.length} 个采分点</span>
                      {practiced && <span>· 上次 {formatDateTime(practiced.startedAt)}</span>}
                    </div>
                  </button>
                );
              })}

              {visibleCount < filtered.length && (
                <button
                  onClick={() => setVisibleCount((count) => count + 20)}
                  className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600"
                >
                  再显示 20 题（剩余 {filtered.length - visibleCount} 题）
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <>
              <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                <div className="border-b border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <InterviewCategoryBadge category={selected.category} />
                    <InterviewDifficultyBadge difficulty={selected.difficulty} />
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                      {selected.subType}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-slate-400">
                    {selected.id} · {selected.source}
                  </p>
                  <h3 className="mt-1.5 text-base font-bold leading-6 text-slate-900">{selected.title}</h3>
                </div>

                <div className="space-y-3.5 p-4">
                  {selected.scene && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                      <p className="mb-1 text-[10px] font-bold tracking-wide text-sky-700">场景设定</p>
                      <p className="text-xs leading-5 text-sky-900">{selected.scene}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-400">设问</p>
                    <p className="text-sm font-semibold leading-6 text-slate-800">{selected.task}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        思考
                      </div>
                      <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
                        {selected.thinkingSeconds}
                        <span className="ml-0.5 text-[10px] font-medium text-slate-400">秒</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Play className="h-3 w-3" />
                        作答
                      </div>
                      <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
                        {selected.answerSeconds}
                        <span className="ml-0.5 text-[10px] font-medium text-slate-400">秒</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Target className="h-3.5 w-3.5" />
                        采分点
                      </span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {selected.keyPoints.length} 个
                        {criticalCount > 0 && (
                          <span className="ml-1 text-[10px] font-semibold text-rose-600">
                            含 {criticalCount} 条主线
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">参考提纲</span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {selected.referenceOutline.length} 层
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">常见扣分点</span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {selected.pitfalls.length} 条
                      </span>
                    </div>
                  </div>
                  {selected.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-start gap-2 rounded-lg bg-indigo-50/70 p-2.5 text-[11px] leading-5 text-indigo-700">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    采分点原文与参考提纲将在作答结束后展示，作答时请按自己的语言组织。
                  </div>

                  <button
                    onClick={() => onStartQuestion(selected.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                  >
                    <Play className="h-4 w-4" />
                    开始本题（思考 + 作答）
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
              {lastRecord && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                  <p className="mb-2 text-[10px] font-bold tracking-wide text-emerald-700">本题上次成绩</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black tabular-nums text-emerald-700">
                        {lastRecord.review.overallScore}
                      </span>
                      <span className="text-[10px] text-emerald-600">分</span>
                      <InterviewGradeBadge grade={lastRecord.review.grade} />
                    </div>
                    <span className="text-[10px] text-emerald-700">
                      {formatDateTime(lastRecord.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-emerald-800">
                    命中 {lastRecord.review.pointsHitCount}/{lastRecord.review.pointsTotal} 个采分点
                    {lastRecord.review.criticalMissed.length > 0 &&
                      `，漏掉 ${lastRecord.review.criticalMissed.length} 条主线`}
                    。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
              <BookOpen className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">从左侧选一道题</p>
              <p className="mt-1 text-xs text-slate-500">这里会显示场景、设问和限时设置。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
