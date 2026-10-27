/**
 * 面试大厅 v1.0 · 单题复盘报告
 *
 * 评分来源完全以 review.provider / review.degraded 为准：本地规则会显式标注，
 * 不与 AI 评分混写。采分点原文从题库按 1 基序号映射，题库找不到时降级为“第 N 条”。
 */
import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  History,
  Lightbulb,
  MessageSquare,
  Mic,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type {
  InterviewQuestion,
  InterviewReview,
  InterviewSessionRecord,
} from '../../types';
import {
  formatDuration,
  formatFullDateTime,
  providerDescription,
  scoreTone,
} from './interviewUtils';
import {
  InterviewCategoryBadge,
  InterviewDifficultyBadge,
  InterviewGradeBadge,
  InterviewProviderBadge,
} from './InterviewBadges';

interface InterviewReportProps {
  record: InterviewSessionRecord;
  question?: InterviewQuestion;
  onBack: () => void;
  onRetry: () => void;
  onOpenHistory: () => void;
}

function ringColor(score: number): string {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#0ea5e9';
  if (score >= 60) return '#f59e0b';
  return '#f43f5e';
}

const ScoreRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const safe = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div
      className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${ringColor(safe)} ${safe * 3.6}deg, #e2e8f0 0deg)` }}
    >
      <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-white">
        <span className={`text-4xl font-black tabular-nums ${scoreTone(safe)}`}>{safe}</span>
        <span className="mt-0.5 text-[10px] font-semibold text-slate-400">综合得分 · {grade}</span>
      </div>
    </div>
  );
};

const DimensionBar: React.FC<{
  label: string;
  score: number;
  comment: string;
  icon: React.ReactNode;
}> = ({ label, score, comment, icon }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
        <span className="text-indigo-500">{icon}</span>
        {label}
      </span>
      <span className={`text-sm font-black tabular-nums ${scoreTone(score)}`}>{score}</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: ringColor(score) }}
      />
    </div>
    <p className="mt-2 text-[11px] leading-5 text-slate-500">{comment}</p>
  </div>
);

const MetricTile: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon: React.ReactNode;
}> = ({ label, value, unit, hint, icon }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
      {icon}
      {label}
    </div>
    <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
      {value}
      {unit && <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{unit}</span>}
    </p>
    {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
  </div>
);

export const InterviewReport: React.FC<InterviewReportProps> = ({
  record,
  question,
  onBack,
  onRetry,
  onOpenHistory,
}) => {
  const review: InterviewReview = record.review;
  const metrics =
    record.metrics ||
    review.metrics || {
      charCount: 0,
      durationSeconds: record.durationSeconds,
      speechRateWpm: 0,
      fillerCount: 0,
      fillerWords: [],
    };
  const keyPoints = question?.keyPoints || [];
  const hitCount = review.pointHits.filter((point) => point.hit).length;
  const criticalMissedText = review.criticalMissed.map((index) => {
    const point = keyPoints[index - 1];
    return point ? `${index}. ${point.text}` : `第 ${index} 条采分点`;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回面试大厅
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <History className="h-3.5 w-3.5" />
            练习记录
          </button>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            再练这道题
          </button>
        </div>
      </div>
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <ScoreRing score={review.overallScore} grade={review.grade} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <InterviewCategoryBadge category={record.category} />
              <InterviewDifficultyBadge difficulty={record.difficulty} />
              <InterviewProviderBadge provider={review.provider} degraded={review.degraded} />
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {record.inputMode === 'voice' ? <Mic className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                {record.inputMode === 'voice' ? '语音作答' : '打字作答'}
              </span>
            </div>
            <h1 className="mt-2 text-lg font-bold leading-7 text-slate-900 sm:text-xl">
              {review.grade} · {record.questionTitle}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatFullDateTime(record.startedAt)}
              </span>
              <span>作答 {formatDuration(record.durationSeconds)}</span>
              <span className="font-mono">{record.questionId}</span>
            </p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              {providerDescription(review.provider, review.degraded)}
            </p>
            {review.grade && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <InterviewGradeBadge grade={review.grade} />
                <span className="text-[11px] text-slate-400">
                  综合分由扣题度 45% + 逻辑 30% + 表达 25% 加权
                </span>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 lg:w-52">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">采分点命中</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-800">
              {hitCount}
              <span className="text-sm font-semibold text-slate-400"> / {review.pointsTotal}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{
                  width: `${review.pointsTotal ? Math.round((hitCount / review.pointsTotal) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {review.criticalMissed.length > 0
                ? `漏掉 ${review.criticalMissed.length} 条主线采分点`
                : '主线采分点已全部覆盖'}
            </p>
          </div>
        </div>

        {review.degraded && (
          <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-5 py-3 text-[11px] leading-5 text-amber-800 sm:px-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-bold">本次为本地规则评分，不是 AI 点评。</span>
              {review.reason ? ` ${review.reason}` : ' AI 服务不可用，报告仅按关键词与结构规则生成。'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 sm:grid-cols-4 sm:px-6">
          <MetricTile
            label="有效字数"
            value={metrics.charCount}
            unit="字"
            hint={`去空白统计`}
            icon={<FileText className="h-3 w-3" />}
          />
          <MetricTile
            label="语速"
            value={metrics.speechRateWpm}
            unit="字/分"
            hint="正常 160–240"
            icon={<Gauge className="h-3 w-3" />}
          />
          <MetricTile
            label="口头禅"
            value={metrics.fillerCount}
            unit="次"
            hint={metrics.fillerWords.length ? metrics.fillerWords.slice(0, 3).join('、') : '未检出高频填充词'}
            icon={<MessageSquare className="h-3 w-3" />}
          />
          <MetricTile
            label="作答时长"
            value={record.durationSeconds}
            unit="秒"
            hint={`思考后实际开口`}
            icon={<Clock className="h-3 w-3" />}
          />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.25fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Target className="h-4 w-4 text-indigo-500" />
              三维评分
            </h2>
            <span className="text-[10px] text-slate-400">单项 0–100</span>
          </div>
          <div className="mt-3 space-y-2.5">
            <DimensionBar
              label="扣题度"
              score={review.relevance.score}
              comment={review.relevance.comment}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <DimensionBar
              label="逻辑结构"
              score={review.structure.score}
              comment={review.structure.comment}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
            <DimensionBar
              label="表达"
              score={review.expression.score}
              comment={review.expression.comment}
              icon={<Mic className="h-3.5 w-3.5" />}
            />
          </div>

          {criticalMissedText.length > 0 ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3">
              <p className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                主线采分点漏答（会被考官直接扣分）
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-rose-800">
                {criticalMissedText.map((text) => (
                  <li key={text}>· {text}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] font-semibold leading-5 text-emerald-700">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              本题所有主线采分点均已出现，结构基本完整。
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              采分点逐条对照
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                已覆盖
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                未覆盖
              </span>
              <span className="text-amber-600">★ 主线</span>
            </div>
          </div>

          <ol className="mt-3 space-y-2">
            {review.pointHits.map((point) => {
              const source = keyPoints[point.index - 1];
              const text = source?.text || `采分点 ${point.index}（题库原文缺失，仅保留判定序号）`;
              return (
                <li
                  key={point.index}
                  className={`rounded-xl border p-3 ${
                    point.hit ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-100 bg-rose-50/30'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                        point.hit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                      }`}
                    >
                      {point.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-5 text-slate-800">
                        {source?.critical && <span className="mr-0.5 text-amber-500">★</span>}
                        {text}
                      </p>
                      {point.hit ? (
                        <p className="mt-1 rounded-lg bg-white/80 px-2 py-1 text-[11px] leading-5 text-emerald-800">
                          <span className="font-bold">命中依据：</span>
                          {point.evidence || '作答中出现了该采分点的核心表述'}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] leading-5 text-rose-700">
                          未在转写中找到对应表述，下轮把它补成“对象 + 动作 + 结果”。
                        </p>
                      )}
                    </div>
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        point.hit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                      }`}
                    >
                      {point.hit ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {point.hit ? '已覆盖' : '未覆盖'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            下一次只改这 {review.improvements.length} 点
          </h2>
          <span className="text-[10px] text-slate-400">按优先级排序，不需要一次全改</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {review.improvements.map((item, index) => (
            <article key={`${item.dimension}-${index}`} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  {item.dimension}
                </span>
                <span className="font-mono text-[10px] text-slate-400">0{index + 1}</span>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-800">{item.issue}</p>
              <p className="mt-1.5 inline-flex items-start gap-1 text-[11px] leading-5 text-slate-600">
                <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-indigo-400" />
                {item.action}
              </p>
              <p className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-2 py-1.5 text-[11px] leading-5 text-indigo-800">
                <span className="font-bold">示范句：</span>
                {item.example}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 sm:p-5">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800">
            <Sparkles className="h-4 w-4" />
            本题亮点
          </h2>
          {review.highlights.length > 0 ? (
            <ul className="mt-2.5 space-y-2">
              {review.highlights.map((text) => (
                <li key={text} className="flex items-start gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-[11px] leading-5 text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-emerald-800/70">本轮没有检测到特别突出的亮点，先把主线说全。</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <BookOpen className="h-4 w-4 text-indigo-500" />
            可直接背的提纲
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {review.provider === 'deepseek' && !review.degraded
              ? '由 AI 根据本题采分点压缩'
              : '本地规则按采分点顺序给出，建议自己再改写成口语'}
          </p>
          {review.modelOutline.length > 0 ? (
            <ol className="mt-2.5 space-y-1.5">
              {review.modelOutline.map((text, index) => (
                <li key={`${text}-${index}`} className="flex gap-2 text-[11px] leading-5 text-slate-600">
                  <span className="font-mono text-[10px] font-bold text-indigo-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">本次没有生成提纲。</p>
          )}
        </section>
      </div>
      <details className="group rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-slate-400" />
            查看原始作答转写
          </span>
          <span className="text-[10px] font-semibold text-slate-400 group-open:hidden">展开</span>
          <span className="hidden text-[10px] font-semibold text-slate-400 group-open:inline">收起</span>
        </summary>
        <p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[12px] leading-6 text-slate-600">
          {record.answerText?.trim() || '本题没有留下作答文本（可能未识别到语音，或选择了跳过）。'}
        </p>
        <p className="mt-2 text-[10px] text-slate-400">
          转写由浏览器语音识别生成，可能存在错字；评分以该文本与可测量指标为准。
        </p>
      </details>

      <section className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Sparkles className="h-4 w-4 text-amber-300" />
          </div>
          <div>
            <p className="text-sm font-bold">下一遍，只盯一个改进点</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-300">
              {review.encouragement || '先稳住结构，再补细节。每一次开口都会比上一次更顺。'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            <History className="h-3.5 w-3.5" />
            看进步曲线
          </button>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            再练一遍
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
