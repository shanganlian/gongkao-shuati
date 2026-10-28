import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, History, LogIn, RotateCcw, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Question } from '../types';

interface AnswerHistoryProps {
  questionsPool: Question[];
  onRequireLogin: () => void;
}

type Filter = 'all' | 'wrong' | 'correct';

interface AnswerRow {
  id: number;
  question_id: string;
  selected_key: string | null;
  is_correct: boolean | null;
  source: string;
  answered_on: string;
  answered_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  drill: '专项刷题',
  paper: '真题试卷',
  review: '错题复习',
  merged: '游客记录合并',
};

const PAGE_SIZE = 100;

/**
 * 第五个 tab：答题历史。
 * 数据源 answer_records（RLS 仅本人可读），游客态不展示明细，只引导登录。
 */
export const AnswerHistory: React.FC<AnswerHistoryProps> = ({ questionsPool, onRequireLogin }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = async () => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('answer_records')
      .select('id, question_id, selected_key, is_correct, source, answered_on, answered_at')
      .eq('user_id', user.id)
      .order('answered_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (queryError) {
      setError(
        queryError.message.includes('relation')
          ? '答题历史表尚未初始化，请先在 Supabase 执行 supabase/migrations/create_answer_records.sql'
          : queryError.message
      );
      setRows([]);
    } else {
      setRows((data || []) as AnswerRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const questionMap = useMemo(() => {
    const map = new Map<string, Question>();
    questionsPool.forEach(q => map.set(q.id, q));
    return map;
  }, [questionsPool]);

  const filtered = useMemo(() => {
    if (filter === 'wrong') return rows.filter(row => row.is_correct === false);
    if (filter === 'correct') return rows.filter(row => row.is_correct === true);
    return rows;
  }, [rows, filter]);

  const stats = useMemo(() => {
    const objective = rows.filter(row => typeof row.is_correct === 'boolean');
    const correct = objective.filter(row => row.is_correct).length;
    const accuracy = objective.length > 0 ? Math.round((correct / objective.length) * 100) : 0;
    const days = new Set(rows.map(row => row.answered_on));
    return { total: rows.length, accuracy, days: days.size };
  }, [rows]);

  if (!user) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
        <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-800">登录后查看答题历史</h4>
        <p className="text-xs text-slate-500 mt-1">每一道题的对错与作答时间都会云端留存，换设备不丢失。</p>
        <button
          onClick={onRequireLogin}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          立即登录
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3">
          <p className="text-[11px] text-slate-500">累计作答</p>
          <p className="text-lg font-black text-slate-900 font-mono">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-3">
          <p className="text-[11px] text-slate-500">客观题正确率</p>
          <p className="text-lg font-black text-emerald-700 font-mono">{stats.accuracy}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-3">
          <p className="text-[11px] text-slate-500">有记录天数</p>
          <p className="text-lg font-black text-slate-900 font-mono">{stats.days}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {([
              ['all', '全部'],
              ['wrong', '只看错题'],
              ['correct', '只看答对'],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  filter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {error && (
          <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
            {error}
          </p>
        )}

        {loading && rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">加载答题历史中...</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <History className="w-9 h-9 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              {rows.length === 0 ? '还没有答题记录，去专项刷题开个好头。' : '当前筛选条件下没有记录。'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(row => {
              const question = questionMap.get(row.question_id);
              const title = question ? question.title : row.question_id;
              return (
                <li key={row.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {row.answered_on} · {new Date(row.answered_at).toLocaleTimeString('zh-CN', { hour12: false })}
                      </span>
                      <span>{SOURCE_LABELS[row.source] || row.source}</span>
                      {row.selected_key && <span>作答：{row.selected_key}</span>}
                      {question && row.is_correct === false && <span>正确答案：{question.answer}</span>}
                    </div>
                  </div>
                  {row.is_correct === true ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 答对
                    </span>
                  ) : row.is_correct === false ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 shrink-0">
                      <XCircle className="w-3.5 h-3.5" /> 答错
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 shrink-0">主观题</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {rows.length >= PAGE_SIZE && (
          <p className="text-[10px] text-slate-400 text-center">仅展示最近 {PAGE_SIZE} 条记录</p>
        )}
      </div>
    </div>
  );
};
