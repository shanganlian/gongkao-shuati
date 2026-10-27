/**
 * 面试大厅 v1.0 · 题库加载
 * 只做最小结构校验，避免一条脏数据把整个面试页打崩。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InterviewQuestion } from '../types';

const QUESTIONS_URL = '/data/interview/questions.json';

function isQuestion(value: any): value is InterviewQuestion {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.category === 'string' &&
    typeof value.difficulty === 'string' &&
    typeof value.title === 'string' &&
    typeof value.task === 'string' &&
    Array.isArray(value.keyPoints) &&
    value.keyPoints.length > 0
  );
}

export interface UseInterviewQuestionsReturn {
  questions: InterviewQuestion[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useInterviewQuestions(): UseInterviewQuestionsReturn {
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(QUESTIONS_URL, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`题库加载失败（HTTP ${res.status}）`);
        const data = await res.json();
        if (!data || !Array.isArray(data.questions)) {
          throw new Error('题库结构异常：缺少 questions 数组');
        }
        const valid = data.questions.filter(isQuestion);
        if (valid.length === 0) throw new Error('题库为空或缺少有效题目');
        setQuestions(valid);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setQuestions([]);
        setError(err instanceof Error ? err.message : '题库加载失败，请稍后重试');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { questions, loading, error, reload };
}
