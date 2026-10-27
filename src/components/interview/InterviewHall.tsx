/**
 * 面试大厅 v1.0 · 页面外壳
 *
 * 职责：
 *  - 持有题库、练习记录与 hash 路由，保证大厅 / 抽题 / 作答 / 报告 / 记录五页数据同源
 *  - 作答完成统一写回：持久化成功则重读 localStorage，失败则只在内存里保留临时报告
 *  - 从哪个页面进入作答，取消后就回到哪个页面，避免“从记录页点重练却被丢回大厅”
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  History as HistoryIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { InterviewSessionRecord } from '../../types';
import { useInterviewQuestions } from '../../hooks/useInterviewQuestions';
import { loadInterviewSessions } from '../../services/interviewReviewService';
import { InterviewLobby } from './InterviewLobby';
import { InterviewPicker } from './InterviewPicker';
import { InterviewSession } from './InterviewSession';
import { InterviewReport } from './InterviewReport';
import { InterviewHistory } from './InterviewHistory';
import { useInterviewRoute } from './useInterviewRoute';
import type { InterviewRoute } from './interviewRoutes';

interface InterviewHallProps {
  /** 完成一次作答后回调，用于累计成长体系的面试训练时长 / 经验 */
  onRecordPractice: () => void;
}

const RouteLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white">
    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
    <p className="text-sm font-semibold text-slate-500">{label}</p>
  </div>
);

const EmptyRoute: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, icon, children }) => (
  <div className="mx-auto max-w-xl rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-sm sm:p-8">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
      {icon || <AlertCircle className="h-6 w-6" />}
    </div>
    <h2 className="mt-3 text-lg font-black text-slate-900">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>
  </div>
);

export const InterviewHall: React.FC<InterviewHallProps> = ({ onRecordPractice }) => {
  const { questions, loading, error, reload } = useInterviewQuestions();
  const [records, setRecords] = useState<InterviewSessionRecord[]>(() => loadInterviewSessions());
  /** 保存失败（如无痕模式 / 配额满）时只存在内存里，刷新即失，报告中仍需可看 */
  const [pendingRecord, setPendingRecord] = useState<InterviewSessionRecord | null>(null);
  const { route, navigate } = useInterviewRoute();
  const sessionOriginRef = useRef<InterviewRoute>({ name: 'lobby' });

  const refreshRecords = useCallback(() => {
    setRecords(loadInterviewSessions());
  }, []);

  const startQuestion = useCallback(
    (questionId: string, origin: InterviewRoute = { name: 'lobby' }) => {
      if (!questionId) return;
      sessionOriginRef.current = origin;
      navigate({ name: 'session', questionId });
    },
    [navigate]
  );

  const handleCompleted = useCallback(
    (record: InterviewSessionRecord, persisted: boolean) => {
      if (persisted) {
        setRecords(loadInterviewSessions());
        setPendingRecord(null);
      } else {
        // 持久化失败也要让大厅/记录页看到本次数据（内存版），但不写入 localStorage
        setPendingRecord(record);
        setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)].slice(0, 50));
      }
      onRecordPractice();
      navigate({ name: 'report', recordId: record.id });
    },
    [navigate, onRecordPractice]
  );

  const activeRecord = useMemo(() => {
    if (route.name !== 'report') return null;
    return (
      records.find((record) => record.id === route.recordId) ||
      (pendingRecord?.id === route.recordId ? pendingRecord : null)
    );
  }, [pendingRecord, records, route]);

  const activeQuestion = useMemo(() => {
    if (route.name === 'session') {
      return questions.find((question) => question.id === route.questionId);
    }
    if (route.name === 'report' && activeRecord) {
      return questions.find((question) => question.id === activeRecord.questionId);
    }
    return undefined;
  }, [activeRecord, questions, route]);

  if (route.name === 'lobby') {
    return (
      <InterviewLobby
        questions={questions}
        records={records}
        loading={loading}
        error={error}
        onReload={reload}
        onOpenPicker={() => navigate({ name: 'picker' })}
        onStartQuestion={(questionId) => startQuestion(questionId, { name: 'lobby' })}
        onOpenHistory={() => navigate({ name: 'history' })}
        onOpenRecord={(recordId) => navigate({ name: 'report', recordId })}
      />
    );
  }

  if (route.name === 'picker') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate({ name: 'lobby' })}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回大厅
        </button>
        <InterviewPicker
          questions={questions}
          records={records}
          loading={loading}
          error={error}
          onReload={reload}
          onStartQuestion={(questionId) => startQuestion(questionId, { name: 'picker' })}
        />
      </div>
    );
  }

  if (route.name === 'session') {
    if (loading) return <RouteLoading label="正在加载题目与采分点…" />;
    if (error) {
      return (
        <EmptyRoute
          title="题库加载失败，无法开始本题"
          description={error}
          icon={<AlertCircle className="h-6 w-6" />}
        >
          <button
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载题库
          </button>
          <button
            onClick={() => navigate({ name: 'lobby' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回大厅
          </button>
        </EmptyRoute>
      );
    }
    if (!activeQuestion) {
      return (
        <EmptyRoute
          title="没有找到这道题"
          description={
            route.questionId
              ? '题目可能已从题库中移除，或链接不完整。可以回大厅重新随机抽题。'
              : '链接缺少题目编号，请回大厅重新选择。'
          }
          icon={<BookOpen className="h-6 w-6" />}
        >
          <button
            onClick={() => navigate({ name: 'lobby' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回大厅
          </button>
          <button
            onClick={() => navigate({ name: 'picker' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <BookOpen className="h-3.5 w-3.5" />
            去题库抽题
          </button>
        </EmptyRoute>
      );
    }
    return (
      <InterviewSession
        key={activeQuestion.id}
        question={activeQuestion}
        onCancel={() => navigate(sessionOriginRef.current)}
        onCompleted={handleCompleted}
      />
    );
  }

  if (route.name === 'report') {
    if (!activeRecord) {
      return (
        <EmptyRoute
          title="找不到这条练习记录"
          description="记录可能已被删除，或这个链接来自另一台设备。回记录页看看其他练习，或重新抽一道题。"
          icon={<HistoryIcon className="h-6 w-6" />}
        >
          <button
            onClick={() => navigate({ name: 'lobby' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回大厅
          </button>
          <button
            onClick={() => navigate({ name: 'history' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            查看练习记录
          </button>
        </EmptyRoute>
      );
    }
    return (
      <InterviewReport
        record={activeRecord}
        question={activeQuestion}
        onBack={() => navigate({ name: 'lobby' })}
        onRetry={() =>
          startQuestion(activeRecord.questionId, {
            name: 'report',
            recordId: activeRecord.id,
          })
        }
        onOpenHistory={() => navigate({ name: 'history' })}
      />
    );
  }

  return (
    <InterviewHistory
      records={records}
      onBack={() => navigate({ name: 'lobby' })}
      onOpenRecord={(recordId) => navigate({ name: 'report', recordId })}
      onRetry={(questionId) => startQuestion(questionId, { name: 'history' })}
      onRecordsChanged={refreshRecords}
    />
  );
};
