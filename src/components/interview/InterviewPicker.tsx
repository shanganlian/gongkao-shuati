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
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">题库抽题</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            100 题全部通过结构审计。先选一道题，进入后按“思考 — 作答 — 复盘”完整走一遍。
          </p>
        </div>
        <button
          onClick={handleRandom}
          disabled={!questions.length}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Shuffle className="h-4 w-4" />
          在当前筛选结果中随机
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            题型
          </span>
          <button
            onClick={() => setCategory('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              category === 'all' ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            全部
          </button>
          {INTERVIEW_CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                category === item ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">难度</span>
            <button
              onClick={() => setDifficulty('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                difficulty === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
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
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlyUnpracticed}
                onChange={(event) => setOnlyUnpracticed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500"
              />
              只看未练
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索题干 / 场景 / 标签"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 py-2 pl-9 pr-3 text-xs text-slate-700 dark:text-slate-200 outline-none transition-colors focus:border-emerald-300 dark:focus:border-emerald-700 focus:bg-white dark:focus:bg-slate-700 sm:w-60"
              />
            </div>
          </div>
        </div>
      </section>
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/40 p-4 text-sm text-rose-700 dark:text-rose-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={onReload}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              筛选结果 <span className="tabular-nums text-slate-900 dark:text-slate-100">{filtered.length}</span> 题
              {filtered.length !== questions.length && (
                <button
                  onClick={() => {
                    setCategory('all');
                    setDifficulty('all');
                    setKeyword('');
                    setOnlyUnpracticed(false);
                  }}
                  className="ml-2 font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
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
                <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <BookOpen className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">没有符合条件的题目</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">放宽题型或难度，也可以清空搜索词。</p>
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
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-900/40 ring-1 ring-emerald-200 dark:ring-emerald-800'
                        : 'border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 font-mono text-[10px] text-slate-400">{question.id}</span>
                      <InterviewCategoryBadge category={question.category} />
                      <InterviewDifficultyBadge difficulty={question.difficulty} />
                      {practiced && (
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          已练 {practiced.review.overallScore} 分
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-800 dark:text-slate-200">
                      {question.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{question.task}</p>
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
                  className="w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400"
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
              <article className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-xs">
                <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <InterviewCategoryBadge category={selected.category} />
                    <InterviewDifficultyBadge difficulty={selected.difficulty} />
                    <span className="rounded-md bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                      {selected.subType}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-slate-400">
                    {selected.id} · {selected.source}
                  </p>
                  <h3 className="mt-1.5 text-base font-bold leading-6 text-slate-900 dark:text-slate-100">{selected.title}</h3>
                </div>

                <div className="space-y-3.5 p-4">
                  {selected.scene && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                      <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-500 dark:text-slate-400">场景设定</p>
                      <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">{selected.scene}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-400">设问</p>
                    <p className="text-sm font-semibold leading-6 text-slate-800 dark:text-slate-200">{selected.task}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-2.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3" />
                        思考
                      </div>
                      <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-slate-100">
                        {selected.thinkingSeconds}
                        <span className="ml-0.5 text-[10px] font-medium text-slate-400">秒</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-2.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <Play className="h-3 w-3" />
                        作答
                      </div>
                      <p className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-slate-100">
                        {selected.answerSeconds}
                        <span className="ml-0.5 text-[10px] font-medium text-slate-400">秒</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Target className="h-3.5 w-3.5" />
                        采分点
                      </span>
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {selected.keyPoints.length} 个
                        {criticalCount > 0 && (
                          <span className="ml-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            含 {criticalCount} 条主线
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">参考提纲</span>
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {selected.referenceOutline.length} 层
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">常见扣分点</span>
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {selected.pitfalls.length} 条
                      </span>
                    </div>
                  </div>
                  {selected.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-start gap-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-900/40 p-2.5 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    采分点原文与参考提纲将在作答结束后展示，作答时请按自己的语言组织。
                  </div>

                  <button
                    onClick={() => onStartQuestion(selected.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    <Play className="h-4 w-4" />
                    开始本题（思考 + 作答）
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
              {lastRecord && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/40 p-3.5">
                  <p className="mb-2 text-[10px] font-bold tracking-wide text-emerald-700 dark:text-emerald-300">本题上次成绩</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                        {lastRecord.review.overallScore}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">分</span>
                      <InterviewGradeBadge grade={lastRecord.review.grade} />
                    </div>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                      {formatDateTime(lastRecord.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                    命中 {lastRecord.review.pointsHitCount}/{lastRecord.review.pointsTotal} 个采分点
                    {lastRecord.review.criticalMissed.length > 0 &&
                      `，漏掉 ${lastRecord.review.criticalMissed.length} 条主线`}
                    。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-5 py-16 text-center">
              <BookOpen className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">从左侧选一道题</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">这里会显示场景、设问和限时设置。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
