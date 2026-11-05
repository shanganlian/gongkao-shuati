import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  CloudOff,
  Flame,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthUI } from '../context/AuthUIContext';
import { STUDY_PLAN_MODULES, diffDays, shanghaiDateKey } from '../../shared/study-plan';
import {
  generateStudyPlan,
  loadStudyPlan,
  loadTaskCompletions,
  migrateGuestPlan,
  setTaskCompleted,
  taskDateOf,
  type TaskCompletionMap,
} from '../services/studyPlanService';
import type { StudyPlanRecord, StudyPlanRequest, StudyPlanTask, StudyPlanTargetExam } from '../types';

interface StudyPlanProps {
  onNavigateTab: (tab: string) => void;
  /** 勾选任务：写入活动账本（+经验 / 首次勾选即当日打卡） */
  onPlanTaskCompleted: (taskKey?: string) => void;
  /** 跳转题库并锁定模块（速算等无独立子分类，按模块级跳转） */
  onStartPractice: (module: string) => void;
}

const DAILY_OPTIONS: { minutes: 30 | 60 | 120; label: string; hint: string }[] = [
  { minutes: 30, label: '30 分钟', hint: '通勤碎片 · 每天 2 条任务' },
  { minutes: 60, label: '1 小时', hint: '晚间专注 · 每天 3 条任务' },
  { minutes: 120, label: '2 小时及以上', hint: '全职冲刺 · 每天 4 条任务' },
];

const GENERATING_TIPS = [
  '正在按你的薄弱模块排每天的主攻方向…',
  '把真题与错题复盘排到每周固定位置…',
  'AI 卡住也没关系，会自动切到规则模板…',
];

function todayKey(): string {
  return shanghaiDateKey();
}

/** 计划内全部任务（含所属周/天），用于「待补」与进度统计 */
function flattenPlan(record: StudyPlanRecord) {
  return record.plan.weeks.flatMap(week =>
    week.days.map(day => ({ week: week.week, day, tasks: day.tasks }))
  );
}

export const StudyPlan: React.FC<StudyPlanProps> = ({
  onNavigateTab,
  onPlanTaskCompleted,
  onStartPractice,
}) => {
  const { user, mergeVersion } = useAuth();
  const { openAuth } = useAuthUI();
  const userId = user?.id || null;

  const [record, setRecord] = useState<StudyPlanRecord | null>(null);
  const [done, setDone] = useState<TaskCompletionMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [notice, setNotice] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [showOverdue, setShowOverdue] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  // 向导三步输入
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetExam, setTargetExam] = useState<StudyPlanTargetExam>('provincial');
  const [noExamDate, setNoExamDate] = useState<boolean>(true);
  const [examDate, setExamDate] = useState<string>('');
  const [dailyMinutes, setDailyMinutes] = useState<30 | 60 | 120>(60);
  const [weakModules, setWeakModules] = useState<string[]>(['ziliao', 'shenlun']);

  const today = todayKey();

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        if (userId) await migrateGuestPlan(userId);
        const loaded = await loadStudyPlan(userId);
        if (!alive) return;
        setRecord(loaded);
        if (loaded) {
          const map = await loadTaskCompletions(loaded, userId);
          if (!alive) return;
          setDone(map);
          const index = diffDays(loaded.startDate, todayKey()) + 1;
          const current = loaded.plan.weeks.find(w => w.days.some(d => d.day === index));
          setSelectedWeek(current?.week || 1);
        } else {
          setDone({});
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [userId, mergeVersion]);

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const dayIndex = record ? diffDays(record.startDate, today) + 1 : 0;
  const flat = useMemo(() => (record ? flattenPlan(record) : []), [record]);
  const todayEntry = flat.find(item => item.day.day === dayIndex) || null;
  const doneCount = Object.keys(done).length;
  const totalTasks = record?.plan.totalTasks || 0;

  const overdue = useMemo(() => {
    if (!record || dayIndex < 1) return [];
    return flat
      .filter(item => item.day.day < dayIndex)
      .flatMap(item => item.day.tasks
        .filter(task => !done[task.id])
        .map(task => ({ week: item.week, day: item.day, task })));
  }, [flat, done, dayIndex, record]);

  const currentWeek = useMemo(() => {
    if (!record) return null;
    return record.plan.weeks.find(w => w.days.some(d => d.day === dayIndex)) || record.plan.weeks[0] || null;
  }, [record, dayIndex]);

  const weekEntry = useMemo(() => {
    if (!record) return null;
    return record.plan.weeks.find(w => w.week === selectedWeek) || record.plan.weeks[0] || null;
  }, [record, selectedWeek]);

  const weekStats = (weekNumber: number) => {
    const week = record?.plan.weeks.find(w => w.week === weekNumber);
    if (!week) return { done: 0, total: 0 };
    const all = week.days.flatMap(day => day.tasks);
    return { done: all.filter(task => done[task.id]).length, total: all.length };
  };

  const todayDone = todayEntry ? todayEntry.day.tasks.filter(task => done[task.id]).length : 0;
  const todayTotal = todayEntry ? todayEntry.day.tasks.length : 0;

  const toggleModule = (module: string) => {
    setWeakModules(prev => (
      prev.includes(module) ? prev.filter(item => item !== module) : [...prev, module]
    ));
  };

  const validateStep1 = (): boolean => {
    if (noExamDate || !examDate) return true;
    if (diffDays(today, examDate) < 1) {
      setErrorText('笔试日期需要晚于今天；如果还没定，勾选「笔试日期未定」即可。');
      return false;
    }
    setErrorText('');
    return true;
  };

  const startGenerate = async (renew = false) => {
    if (!weakModules.length) {
      setErrorText('请至少选择一个薄弱模块，计划才有主攻方向。');
      setStep(3);
      return;
    }
    const request: StudyPlanRequest = renew && record
      ? {
        targetExam: record.targetExam,
        examDate: record.examDate,
        dailyMinutes: record.dailyMinutes === 30 || record.dailyMinutes === 120 ? record.dailyMinutes : 60,
        weakModules: record.weakModules.length ? record.weakModules : weakModules,
        startDate: todayKey(),
      }
      : {
        targetExam,
        examDate: noExamDate || !examDate ? null : examDate,
        dailyMinutes,
        weakModules,
        startDate: todayKey(),
      };

    setErrorText('');
    setGenerating(true);
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateStudyPlan(request, { userId, signal: controller.signal });
      setRecord(result.record);
      setDone({});
      setSelectedWeek(1);
      setStep(1);
      // 把本次参数回填到向导，方便「重新定制」时沿用
      setTargetExam(request.targetExam);
      setDailyMinutes(request.dailyMinutes);
      setWeakModules(request.weakModules);
      setNoExamDate(!request.examDate);
      setExamDate(request.examDate || '');
      if (!userId) {
        setNotice('计划已保存在本机（游客模式）。登录后会自动同步到云端，换设备也能继续。');
      } else if (!result.cloud) {
        setNotice('云端暂不可用（或数据表尚未创建），计划已保存在本机，勾选记录也会本地保留。');
      } else if (result.provider === 'template') {
        setNotice('AI 暂时不可用，已按规则模板生成同样可执行的计划，不影响使用。');
      } else {
        setNotice(renew ? '新计划已生成，旧计划已归档。' : '计划已生成，今天就开始第一条任务。');
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        setNotice('已取消生成。');
      } else {
        setErrorText(err?.message || '计划生成失败，请稍后重试。');
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const cancelGenerate = () => {
    abortRef.current?.abort();
  };

  const toggleTask = async (task: StudyPlanTask, completed: boolean) => {
    if (!record) return;
    setDone(prev => {
      const next = { ...prev };
      if (completed) next[task.id] = todayKey();
      else delete next[task.id];
      return next;
    });
    if (completed) onPlanTaskCompleted(task.id);
    const result = await setTaskCompleted(record, task.id, completed, userId);
    if (!result.cloud && userId) {
      setNotice('勾选已保存在本机，云端同步暂时失败，稍后会自动重试。');
    }
  };

  const openTask = (task: StudyPlanTask) => {
    if (!task.module) {
      setNotice('这条是复盘类任务，直接在本页打勾即可。');
      return;
    }
    if (task.module === 'shenlun') {
      onNavigateTab('daily');
      return;
    }
    onStartPractice(task.module);
  };

  const resetWizard = () => {
    if (record) {
      setTargetExam(record.targetExam);
      setDailyMinutes(record.dailyMinutes === 30 || record.dailyMinutes === 120 ? record.dailyMinutes : 60);
      setWeakModules(record.weakModules.length ? record.weakModules : weakModules);
      setNoExamDate(!record.examDate);
      setExamDate(record.examDate || '');
    }
    setRecord(null);
    setDone({});
    setStep(1);
    setErrorText('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在读取你的计划…
      </div>
    );
  }


  const renderTask = (task: StudyPlanTask, keyPrefix: string) => {
    const isDone = !!done[task.id];
    const moduleName = STUDY_PLAN_MODULES.find(item => item.module === task.module)?.name;
    return (
      <div
        key={`${keyPrefix}-${task.id}`}
        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors ${
          isDone ? 'bg-emerald-50/70 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <button
          type="button"
          onClick={() => void toggleTask(task, !isDone)}
          aria-label={isDone ? `取消完成：${task.title}` : `完成：${task.title}`}
          className="shrink-0 mt-0.5 cursor-pointer"
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            : <Circle className="w-5 h-5 text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold leading-snug ${isDone ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
            {task.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {moduleName && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">{moduleName}</span>
            )}
            {typeof task.count === 'number' && (
              <span>{task.count} {task.module === 'shenlun' ? '道' : '题'}</span>
            )}
            <span>{task.minutes} 分钟</span>
            {task.tip && <span className="text-slate-400 hidden sm:inline">· {task.tip}</span>}
          </div>
        </div>

        {task.module && (
          <button
            type="button"
            onClick={() => openTask(task)}
            className="shrink-0 mt-0.5 px-2 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-[11px] font-bold cursor-pointer"
          >
            去练
          </button>
        )}
      </div>
    );
  };


  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">定制计划</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            三步回答几个问题，生成 4 周可执行清单。勾任务即打卡，漏了自动顺延，不会凭空消失。
          </p>
        </div>
        {!user && (
          <button
            type="button"
            onClick={() => openAuth('default')}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <CloudOff className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            游客模式 · 登录后云端同步
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/40 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span className="leading-relaxed">{notice}</span>
        </div>
      )}

      {errorText && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
          <span className="leading-relaxed">{errorText}</span>
        </div>
      )}

      {!record && (
        <div className="space-y-4">
          {/* 步骤条 */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {[
              { n: 1, label: '目标与时间' },
              { n: 2, label: '每天可学' },
              { n: 3, label: '薄弱模块' },
            ].map((item, index) => (
              <React.Fragment key={item.n}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.n < step) {
                      setErrorText('');
                      setStep(item.n as 1 | 2 | 3);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    step === item.n
                      ? 'bg-slate-900 dark:bg-slate-700 text-white'
                      : step > item.n
                        ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                    step === item.n ? 'bg-emerald-500 text-white' : step > item.n ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {step > item.n ? '✓' : item.n}
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
                {index < 2 && (
                  <div className={`flex-1 h-0.5 rounded-full ${step > item.n ? 'bg-emerald-400 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </React.Fragment>
            ))}
          </div>


          {/* 第一步：目标与时间 */}
          {step === 1 && (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
                <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> 你要考哪一场？
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { id: 'national' as const, title: '国家公务员考试', desc: '国考 · 行政执法 / 市地综合' },
                  { id: 'provincial' as const, title: '省公务员联考', desc: '省考 · 乡镇 / 县级综合' },
                ].map(option => {
                  const active = targetExam === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTargetExam(option.id)}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                        active ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/40 shadow-xs' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">{option.title}</span>
                        {active ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-300" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{option.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noExamDate}
                    onChange={(e) => setNoExamDate(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  笔试日期未定（先按标准 28 天排）
                </label>

                {!noExamDate && (
                  <div className="flex flex-wrap items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={examDate}
                      min={today}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="text-sm font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {examDate && diffDays(today, examDate) > 0 && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        距笔试 {diffDays(today, examDate)} 天
                        {diffDays(today, examDate) < 28 ? '（计划会自动压缩）' : ''}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  笔试日不足 28 天时，计划压缩到剩余天数；不会把任务排到考试之后。
                </p>
              </div>
            </section>
          )}


          {/* 第二步：每天可学多久 */}
          {step === 2 && (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> 每天能稳定拿出多久？
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">按“最差的一天”来选，计划才不会第一天就崩。</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {DAILY_OPTIONS.map(option => {
                  const active = dailyMinutes === option.minutes;
                  return (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => setDailyMinutes(option.minutes)}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                        active ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/40 shadow-xs' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">{option.label}</span>
                        {active ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-300" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{option.hint}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}


          {/* 第三步：薄弱模块 */}
          {step === 3 && (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
                  <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> 哪些模块最拖后腿？
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">已选 {weakModules.length} 项</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">至少选 1 项。选中的模块成为每天的主攻方向，其余模块在周测里覆盖。</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STUDY_PLAN_MODULES.map(item => {
                  const active = weakModules.includes(item.module);
                  const hot = ['yanyu', 'panduan', 'ziliao'].includes(item.module);
                  return (
                    <button
                      key={item.module}
                      type="button"
                      onClick={() => toggleModule(item.module)}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {active ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300" />}
                        <span className="truncate">{item.name}</span>
                      </span>
                      {hot && (
                        <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded font-black ${
                          active ? 'bg-emerald-600 text-white' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          高频
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                申论任务会跳到「每日两题」晨练；行测任务直接跳到对应模块题库，题量与计划里的数字一致。
              </div>
            </section>
          )}

          {generating && (
            <div className="rounded-2xl bg-slate-900 dark:bg-slate-700 text-white p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> 正在生成计划（{elapsed}s）
                </span>
                <button
                  type="button"
                  onClick={cancelGenerate}
                  className="text-xs px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/10 cursor-pointer"
                >
                  取消
                </button>
              </div>
              <p className="text-xs text-slate-300">
                {GENERATING_TIPS[Math.min(GENERATING_TIPS.length - 1, Math.floor(elapsed / 10))]}
              </p>
              <p className="text-[11px] text-slate-400">
                若 AI 超时或不可用，会自动用规则模板生成，不会让你空手而归。
              </p>
            </div>
          )}

          {/* 向导底部操作 */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setErrorText('');
                setStep(prev => (prev > 1 ? (prev - 1) as 1 | 2 | 3 : prev));
              }}
              disabled={step === 1 || generating}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> 上一步
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !validateStep1()) return;
                  setErrorText('');
                  setStep(prev => (prev < 3 ? (prev + 1) as 1 | 2 | 3 : prev));
                }}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                下一步 <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startGenerate(false)}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? `生成中 ${elapsed}s` : '生成我的 4 周计划'}
              </button>
            )}
          </div>
        </div>
      )}


      {record && (
        <div className="space-y-4">
          {/* 计划摘要 */}
          <section className="rounded-2xl bg-slate-900 dark:bg-slate-700 text-white p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 dark:border-emerald-600/30 font-bold">
                    {record.provider === 'deepseek' ? 'AI 定制' : '规则模板'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                    {record.plan.goalLabel}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black mt-1.5 leading-snug">{record.plan.planTitle}</h2>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{record.plan.summary}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={resetWizard}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-[11px] font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 重新定制
                </button>
                <button
                  type="button"
                  onClick={() => void startGenerate(true)}
                  disabled={generating}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 dark:hover:bg-emerald-700 text-slate-950 dark:text-slate-100 text-[11px] font-black disabled:opacity-60 cursor-pointer"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  再续 4 周
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-300">
              <span className="px-2 py-0.5 rounded bg-white/10">起始 {record.startDate}</span>
              <span className="px-2 py-0.5 rounded bg-white/10">每日 {record.dailyMinutes} 分钟</span>
              <span className="px-2 py-0.5 rounded bg-white/10">{record.plan.totalDays} 天 · {totalTasks} 条任务</span>
              {record.examDate && <span className="px-2 py-0.5 rounded bg-white/10">笔试 {record.examDate}</span>}
            </div>
          </section>


          {/* 进度三连 */}
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 今日
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {todayDone}<span className="text-xs text-slate-400">/{todayTotal}</span>
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <CalendarDays className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 本周
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {weekStats(currentWeek?.week || 1).done}
                <span className="text-xs text-slate-400">/{weekStats(currentWeek?.week || 1).total}</span>
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <Flame className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 总进度
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {doneCount}<span className="text-xs text-slate-400">/{totalTasks}</span>
              </p>
            </div>
          </section>

          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round((doneCount / Math.max(1, totalTasks)) * 100)}%` }}
            />
          </div>

          {/* 今日任务 */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                {dayIndex > record.plan.totalDays ? '计划已走完' : `第 ${Math.max(1, dayIndex)} 天 · 今日任务`}
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {todayEntry ? `${todayEntry.day.weekdayLabel} · 共 ${todayTotal} 条` : `共 ${record.plan.totalDays} 天`}
              </span>
            </div>

            {dayIndex > record.plan.totalDays ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/40 p-3 space-y-2">
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">这一轮计划已经走完。</p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  建议按同样的薄弱模块再续 4 周，或重新定制调整节奏。旧计划会归档，勾选记录不会丢。
                </p>
                <button
                  type="button"
                  onClick={() => void startGenerate(true)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 再续 4 周
                </button>
              </div>
            ) : todayEntry ? (
              <div className="space-y-2">
                {todayEntry.day.tasks.map(task => renderTask(task, 'today'))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">计划尚未开始（起始日 {record.startDate}）。</p>
            )}
          </section>


          {/* 待补任务：不挤进今天，避免“越欠越多” */}
          {overdue.length > 0 && (
            <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/40 p-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowOverdue(prev => !prev)}
                className="w-full flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-sm font-black text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  待补 {overdue.length} 条（不会挤进今天）
                </span>
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">{showOverdue ? '收起' : '展开'}</span>
              </button>

              {showOverdue && (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {overdue.slice(0, 30).map(item => (
                    <div key={item.task.id} className="flex items-start gap-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-100 dark:border-amber-900 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void toggleTask(item.task, true)}
                        aria-label={`补做：${item.task.title}`}
                        className="shrink-0 mt-0.5 cursor-pointer"
                      >
                        <Circle className="w-4 h-4 text-amber-300 hover:text-emerald-500 dark:hover:text-emerald-400" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">{item.task.title}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          原定 第 {item.day.day} 天 · {taskDateOf(record, item.task.id)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {overdue.length > 30 && (
                    <p className="text-[10px] text-amber-800 dark:text-amber-300 px-1">还有 {overdue.length - 30} 条更早的任务，优先补最近的即可。</p>
                  )}
                </div>
              )}
            </section>
          )}


          {/* 分周看板 */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">完整 {record.plan.weeks.length} 周安排</h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">勾选会立即保存</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {record.plan.weeks.map(week => {
                const stats = weekStats(week.week);
                const active = selectedWeek === week.week;
                return (
                  <button
                    key={week.week}
                    type="button"
                    onClick={() => setSelectedWeek(week.week)}
                    className={`px-2 py-1.5 rounded-xl border-2 text-left transition-colors cursor-pointer ${
                      active ? 'border-slate-900 bg-slate-900 dark:bg-slate-700 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className="block text-[11px] font-black">第 {week.week} 周</span>
                    <span className={`block text-[10px] ${active ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      完成 {stats.done}/{stats.total}
                    </span>
                  </button>
                );
              })}
            </div>

            {weekEntry && (
              <div className="space-y-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-xs font-black text-slate-900 dark:text-slate-100">{weekEntry.theme}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{weekEntry.focus}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {weekEntry.days.map(day => {
                    const isToday = day.day === dayIndex;
                    const dayDone = day.tasks.filter(task => done[task.id]).length;
                    return (
                      <div
                        key={day.day}
                        className={`rounded-xl border p-2.5 space-y-1.5 ${
                          isToday ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-900/40' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                            第 {day.day} 天 <span className="text-slate-500 dark:text-slate-400 font-bold">{day.weekdayLabel}</span>
                          </span>
                          <span className={`text-[10px] font-bold ${isToday ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
                            {isToday ? '今天' : `${dayDone}/${day.tasks.length}`}
                          </span>
                        </div>

                        {day.tasks.map(task => {
                          const isDone = !!done[task.id];
                          return (
                            <div key={task.id} className="flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => void toggleTask(task, !isDone)}
                                aria-label={isDone ? `取消完成：${task.title}` : `完成：${task.title}`}
                                className="shrink-0 mt-0.5 cursor-pointer"
                              >
                                {isDone
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  : <Circle className="w-3.5 h-3.5 text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className={`text-[11px] font-bold leading-snug ${isDone ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                                  {task.title}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {task.count ? `${task.count} ${task.module === 'shenlun' ? '道' : '题'} · ` : ''}
                                  {task.minutes} 分钟
                                </p>
                              </div>
                              {task.module && (
                                <button
                                  type="button"
                                  onClick={() => openTask(task)}
                                  className="shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                                >
                                  去练
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {record.plan.coachNote}
          </div>
        </div>
      )}
    </div>
  );
};
