/**
 * 面试大厅 v1.0 · 限时作答
 *
 * 状态机：ready → thinking → answering → reviewing
 * 约束：
 *  - 思考/作答都按 deadline 计算，切后台回来不会“多送时间”
 *  - 结束录音后先合并最后一段转写，再请求评分，避免最后一句话丢失
 *  - 评分请求永远 resolve；保存失败会生成临时报告（persisted=false）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Keyboard,
  Loader2,
  Mic,
  Play,
  Send,
  ShieldCheck,
  Square,
  Timer,
} from 'lucide-react';
import type { InterviewQuestion, InterviewReview, InterviewSessionRecord } from '../../types';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import {
  requestInterviewReview,
  saveInterviewSession,
} from '../../services/interviewReviewService';
import {
  buildLocalInterviewReview,
  computeExpressionMetrics,
} from '../../lib/interviewScoring';
import { ANSWER_MAX_CHARS } from '../../../shared/interview-review';
import { effectiveCharCount, formatCountdown, formatDuration } from './interviewUtils';
import {
  InterviewCategoryBadge,
  InterviewDifficultyBadge,
} from './InterviewBadges';

type Phase = 'ready' | 'thinking' | 'answering' | 'reviewing';
type InputMode = 'voice' | 'typing';

interface InterviewSessionProps {
  question: InterviewQuestion;
  onCancel: () => void;
  onCompleted: (record: InterviewSessionRecord, persisted: boolean) => void;
}

export const InterviewSession: React.FC<InterviewSessionProps> = ({
  question,
  onCancel,
  onCompleted,
}) => {
  const speech = useSpeechRecognition({ lang: 'zh-CN', continuous: true, interimResults: true });
  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    start: startSpeech,
    stop: stopSpeech,
    reset: resetSpeech,
    getTranscript,
  } = speech;

  const [phase, setPhase] = useState<Phase>('ready');
  const [inputMode, setInputMode] = useState<InputMode>(isSupported ? 'voice' : 'typing');
  const [answerText, setAnswerText] = useState('');
  const [thinkingDeadline, setThinkingDeadline] = useState(0);
  const [answerDeadline, setAnswerDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());

  const phaseRef = useRef<Phase>('ready');
  const finishingRef = useRef(false);
  const answerTextRef = useRef('');
  const answerStartedAtRef = useRef(0);
  const sessionStartedAtRef = useRef(new Date().toISOString());
  const speechSeenRef = useRef('');

  const updateAnswerText = useCallback((value: string) => {
    const clipped = value.slice(0, ANSWER_MAX_CHARS);
    answerTextRef.current = clipped;
    setAnswerText(clipped);
  }, []);

  /** 把新确认的语音片段追加到已有文字；用户手动改过也只会追加增量 */
  const appendSpeech = useCallback(
    (nextTranscript: string) => {
      if (!nextTranscript) return;
      const seen = speechSeenRef.current;
      if (nextTranscript === seen) return;
      const delta = nextTranscript.startsWith(seen)
        ? nextTranscript.slice(seen.length)
        : nextTranscript;
      speechSeenRef.current = nextTranscript;
      if (!delta) return;
      updateAnswerText(answerTextRef.current + delta);
    },
    [updateAnswerText]
  );

  useEffect(() => {
    appendSpeech(transcript);
  }, [transcript, appendSpeech]);

  const beginThinking = useCallback(() => {
    if (phaseRef.current !== 'ready') return;
    phaseRef.current = 'thinking';
    setPhase('thinking');
    sessionStartedAtRef.current = new Date().toISOString();
    setThinkingDeadline(Date.now() + question.thinkingSeconds * 1000);
    setNow(Date.now());
  }, [question.thinkingSeconds]);

  const beginAnswering = useCallback(() => {
    const current = phaseRef.current;
    if (current !== 'thinking' && current !== 'ready') return;
    if (current === 'ready') sessionStartedAtRef.current = new Date().toISOString();
    const startedAt = Date.now();
    phaseRef.current = 'answering';
    setPhase('answering');
    answerStartedAtRef.current = startedAt;
    setAnswerDeadline(startedAt + question.answerSeconds * 1000);
    setNow(startedAt);
    if (inputMode === 'voice' && isSupported) startSpeech();
  }, [inputMode, isSupported, question.answerSeconds, startSpeech]);

  const finishAnswer = useCallback(async () => {
    if (phaseRef.current !== 'answering' || finishingRef.current) return;
    finishingRef.current = true;

    appendSpeech(getTranscript());
    stopSpeech();
    const finalText = answerTextRef.current.slice(0, ANSWER_MAX_CHARS);
    const startedAt = answerStartedAtRef.current || Date.now();
    const durationSeconds = Math.max(
      1,
      Math.min(question.answerSeconds, Math.round((Date.now() - startedAt) / 1000))
    );

    phaseRef.current = 'reviewing';
    setPhase('reviewing');

    let review: InterviewReview;
    try {
      review = await requestInterviewReview({
        question,
        answerText: finalText,
        durationSeconds,
        inputMode,
      });
    } catch (err) {
      const metrics = computeExpressionMetrics(finalText, durationSeconds);
      review = buildLocalInterviewReview({
        question,
        answerText: finalText,
        metrics,
        reason: `评分请求异常：${err instanceof Error ? err.message : '未知错误'}，已改用本地规则`,
      });
    }

    const saved = await saveInterviewSession({
      question,
      answerText: finalText,
      durationSeconds,
      inputMode,
      review,
      startedAt: sessionStartedAtRef.current,
    });

    const record: InterviewSessionRecord =
      saved || {
        id: `local-${Date.now()}`,
        questionId: question.id,
        questionTitle: question.title,
        category: question.category,
        difficulty: question.difficulty,
        startedAt: sessionStartedAtRef.current,
        durationSeconds,
        answerText: finalText,
        inputMode,
        metrics: review.metrics || computeExpressionMetrics(finalText, durationSeconds),
        review,
        provider: review.provider,
      };

    onCompleted(record, !!saved);
  }, [appendSpeech, getTranscript, inputMode, onCompleted, question, stopSpeech]);

  const thinkingLeft =
    phase === 'thinking' ? Math.max(0, Math.ceil((thinkingDeadline - now) / 1000)) : 0;
  const answerLeft =
    phase === 'answering' ? Math.max(0, Math.ceil((answerDeadline - now) / 1000)) : 0;

  useEffect(() => {
    if (phase !== 'thinking' && phase !== 'answering') return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    if (phase === 'thinking' && thinkingLeft <= 0) beginAnswering();
  }, [phase, thinkingLeft, beginAnswering]);

  useEffect(() => {
    if (phase === 'answering' && answerLeft <= 0) void finishAnswer();
  }, [phase, answerLeft, finishAnswer]);

  useEffect(() => {
    if (phase !== 'thinking' && phase !== 'answering' && phase !== 'reviewing') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const changeInputMode = (mode: InputMode) => {
    setInputMode(mode);
    if (phaseRef.current !== 'answering') return;
    if (mode === 'typing') stopSpeech();
    else if (isSupported) startSpeech();
  };

  const handleFinish = () => {
    if (!answerTextRef.current.trim()) {
      const ok = window.confirm('还没有识别到作答文字，仍要结束并生成报告吗？');
      if (!ok) return;
    }
    void finishAnswer();
  };

  const handleAbandon = () => {
    if (phaseRef.current === 'reviewing') return;
    const ok = window.confirm('放弃本题？已转写但未提交的文字会丢失。');
    if (!ok) return;
    resetSpeech();
    onCancel();
  };

  const totalSeconds = phase === 'thinking' ? question.thinkingSeconds : question.answerSeconds;
  const leftSeconds = phase === 'thinking' ? thinkingLeft : answerLeft;
  const progress =
    phase === 'thinking' || phase === 'answering'
      ? Math.max(0, Math.min(100, (leftSeconds / Math.max(1, totalSeconds)) * 100))
      : 0;
  const charCount = effectiveCharCount(answerText);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={handleAbandon}
            disabled={phase === 'reviewing'}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            退出
          </button>
          <div className="min-w-0 border-l border-slate-200 pl-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <InterviewCategoryBadge category={question.category} />
              <InterviewDifficultyBadge difficulty={question.difficulty} />
              <span className="font-mono text-[10px] text-slate-400">{question.id}</span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-bold text-slate-800">{question.title}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {phase === 'ready' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              <Clock className="h-3.5 w-3.5" />
              思考 {question.thinkingSeconds}s · 作答 {question.answerSeconds}s
            </span>
          )}
          {phase === 'thinking' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-black tabular-nums text-amber-700 ring-1 ring-amber-200">
              <Timer className="h-4 w-4" />
              {formatCountdown(thinkingLeft)}
            </span>
          )}
          {phase === 'answering' && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-black tabular-nums ring-1 ${
                answerLeft <= 30
                  ? 'animate-pulse bg-rose-50 text-rose-700 ring-rose-200'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              }`}
            >
              <Mic className="h-4 w-4" />
              {formatCountdown(answerLeft)}
            </span>
          )}
          {phase === 'reviewing' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              评分中
            </span>
          )}
        </div>
      </header>

      {phase === 'ready' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          <div className="border-b border-slate-100 bg-slate-50/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <InterviewCategoryBadge category={question.category} />
              <InterviewDifficultyBadge difficulty={question.difficulty} />
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                {question.subType}
              </span>
            </div>
            <h1 className="mt-3 text-lg font-bold leading-7 text-slate-900 sm:text-xl">{question.title}</h1>
            {question.scene && (
              <p className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                <span className="font-bold text-slate-700">场景：</span>
                {question.scene}
              </p>
            )}
            <p className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 text-sm font-semibold leading-6 text-indigo-900">
              {question.task}
            </p>
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { step: '01', title: '先审题', text: '圈出对象、矛盾与你的身份，别急着展开。' },
                { step: '02', title: '搭三层', text: '观点 / 原因 / 做法，每层先用一句话点明。' },
                { step: '03', title: '再开口', text: '录音会自动转写，说错不用停，继续往下说。' },
              ].map((item) => (
                <div key={item.step} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <span className="font-mono text-[10px] font-bold text-indigo-500">{item.step}</span>
                  <p className="mt-1 text-xs font-bold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-slate-700">作答方式</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {isSupported
                    ? '推荐语音作答并自动转写；也可随时切换手动输入。'
                    : '当前浏览器不支持语音识别，已切换为手动输入（推荐 Chrome / Edge）。'}
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  onClick={() => changeInputMode('voice')}
                  disabled={!isSupported}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    inputMode === 'voice' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  语音
                </button>
                <button
                  onClick={() => changeInputMode('typing')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    inputMode === 'typing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  打字
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={beginAnswering}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Play className="h-4 w-4" />
                跳过思考，直接作答
              </button>
              <button
                onClick={beginThinking}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                <Timer className="h-4 w-4" />
                开始思考（{question.thinkingSeconds} 秒）
              </button>
            </div>
          </div>
        </section>
      )}
      {phase === 'thinking' && (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <section className="flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 text-white shadow-lg shadow-indigo-900/15">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white/90">
                  <Timer className="h-3.5 w-3.5" />
                  思考时间
                </span>
                <span className="font-mono text-[11px] text-white/60">{question.id}</span>
              </div>
              <p className="mt-6 text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                {formatCountdown(thinkingLeft)}
              </p>
              <p className="mt-1 text-xs text-white/60">倒计时结束自动进入作答</p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-amber-300 transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-7 space-y-3 border-t border-white/10 pt-5">
              <p className="text-sm font-bold leading-6">{question.task}</p>
              {question.scene && (
                <p className="rounded-lg bg-black/15 p-2.5 text-[11px] leading-5 text-white/75">
                  场景：{question.scene}
                </p>
              )}
            </div>
          </section>

          <aside className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">快速搭骨架</p>
              <div className="mt-3 space-y-2.5">
                {[
                  { icon: '01', title: '对象与身份', text: '我是谁？要对谁负责？先把关系说清。' },
                  { icon: '02', title: '核心矛盾', text: '一句话概括问题本质，别念题干。' },
                  { icon: '03', title: '三层结构', text: '态度 / 分析 / 措施，各留一个具体例子。' },
                ].map((item) => (
                  <div key={item.icon} className="flex gap-2.5 rounded-xl bg-slate-50 p-3">
                    <span className="mt-0.5 font-mono text-[10px] font-bold text-indigo-400">{item.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.title}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                提示：思考阶段不录音、不计入表达统计。想好开头一句，就可以开始。
              </p>
            </div>
            <button
              onClick={beginAnswering}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
            >
              <Mic className="h-4 w-4" />
              我准备好了，开始作答
            </button>
          </aside>
        </div>
      )}
      {phase === 'answering' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">当前题目</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <Clock className="h-3 w-3" />
                  已用 {formatDuration(question.answerSeconds - answerLeft)} / {formatDuration(question.answerSeconds)}
                </span>
              </div>
              <h2 className="mt-2 text-base font-bold leading-6 text-slate-900">{question.title}</h2>
              {question.scene && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-5 text-slate-500">
                  场景：{question.scene}
                </p>
              )}
              <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs font-semibold leading-5 text-indigo-900">
                {question.task}
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    answerLeft <= 30 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">临场提醒</p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
                <li>· 先给结论，再解释原因，最后落到具体动作。</li>
                <li>· 出现“然后”太多时，停半秒，换成“第一 / 第二”。</li>
                <li>· 时间只剩 30 秒时，用一句话收束，不要硬开新点。</li>
              </ul>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                录音仅用于本题转写与评分，不会上传音频文件。
              </div>
            </div>
          </section>

          <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      inputMode === 'voice' && isListening ? 'animate-pulse bg-rose-500' : 'bg-slate-300'
                    }`}
                  />
                  {inputMode === 'typing'
                    ? '手动输入'
                    : isListening
                      ? '正在聆听'
                      : '语音已暂停'}
                </span>
                {inputMode === 'voice' && isSupported && (
                  <button
                    onClick={() => (isListening ? stopSpeech() : startSpeech())}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  >
                    {isListening ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {isListening ? '暂停' : '继续'}
                  </button>
                )}
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  onClick={() => changeInputMode('voice')}
                  disabled={!isSupported}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    inputMode === 'voice' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <Mic className="h-3 w-3" />
                  语音
                </button>
                <button
                  onClick={() => changeInputMode('typing')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    inputMode === 'typing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Keyboard className="h-3 w-3" />
                  打字
                </button>
              </div>
            </div>

            {speechError && inputMode === 'voice' && (
              <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <p>{speechError}</p>
                  <button
                    onClick={() => changeInputMode('typing')}
                    className="mt-1 font-bold underline decoration-amber-400 underline-offset-2"
                  >
                    改用手动输入继续作答
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-1 flex-col p-3 sm:p-4">
              <textarea
                value={answerText}
                onChange={(event) => updateAnswerText(event.target.value)}
                placeholder={
                  inputMode === 'voice'
                    ? '开始说话后，识别到的内容会实时出现在这里；也可以直接在此基础上修改。'
                    : '在这里输入你的作答内容……建议先写结论，再补原因和做法。'
                }
                className="min-h-[220px] w-full flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm leading-7 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
              <div className="mt-2 min-h-[22px] rounded-lg bg-indigo-50/60 px-2.5 py-1 text-[11px] leading-5 text-indigo-600">
                {interimTranscript ? (
                  <span>
                    <span className="font-bold">识别中：</span>
                    {interimTranscript}
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {inputMode === 'voice'
                      ? isListening
                        ? '听到的内容将自动上屏，无需手动确认。'
                        : '语音已暂停，点上方“继续”接着录。'
                      : '手动输入模式：内容会与语音转写共用同一份文本。'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-500">
                <span className={`font-bold tabular-nums ${charCount > ANSWER_MAX_CHARS * 0.9 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {charCount}
                </span>
                <span className="text-slate-400"> / {ANSWER_MAX_CHARS} 字</span>
                <span className="ml-2 text-slate-400">· 语音转写受浏览器影响，可能有错字</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFinish}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  <Send className="h-4 w-4" />
                  结束作答并评分
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {phase === 'reviewing' && (
        <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-8 text-center text-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h2 className="mt-3 text-lg font-bold">正在生成你的面试报告</h2>
            <p className="mt-1 text-xs text-white/65">正在对照本题采分点逐条核对，请稍候…</p>
          </div>
          <div className="space-y-2.5 p-5 sm:p-6">
            {[
              '整理语音转写与表达数据',
              '按采分点逐条对照作答内容',
              '生成总分、亮点与改进建议',
            ].map((text, index) => (
              <div key={text} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                {index === 2 ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
                <span className="text-xs font-semibold text-slate-600">{text}</span>
              </div>
            ))}
            <p className="pt-1 text-center text-[11px] leading-5 text-slate-400">
              通常 5–15 秒完成。若 AI 服务不可用，会自动切换为本地规则评分，并在报告中明确标注。
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
