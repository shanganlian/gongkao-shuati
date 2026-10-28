import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  HelpCircle, 
  FileText, 
  Bookmark, 
  Filter, 
  ChevronRight, 
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  Award,
  Brain,
  History
} from 'lucide-react';
import { Question, Paper, ExamCategory, ExamModule } from '../types';
import { MOCK_QUESTIONS, MOCK_PAPERS, EXAM_MODULE_NAMES, PROVINCE_LIST } from '../data/mockData';
import { NoteList } from './NoteList';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useAuthUI } from '../context/AuthUIContext';
import { useQuestions } from '../hooks/useQuestions';
import { useQuota } from '../hooks/useQuota';
import { addGuestMistake } from '../lib/guestStore';
import { QuotaBanner } from './QuotaBanner';
import { QuotaLimitDialog } from './QuotaLimitDialog';
import { AnswerHistory } from './AnswerHistory';
import { QuestionErrorBoundary } from './QuestionErrorBoundary';
import { filterValidQuestions, isValidQuestion, isMergedAbnormal } from '../lib/questionValidation';
import { AbnormalQuestionPlaceholder } from './AbnormalQuestionPlaceholder';

type TargetCategory = ExamCategory | 'all';

interface PracticeArenaProps {
  selectedCategory: TargetCategory;
  onRecordQuestionAnswered: () => void;
  reviewTrigger?: number; // 外部触发进入复习模式（点击首页卡片时递增）
  knowledgeFilter?: { module: string; cardIds: string[]; keywords: string[] } | null; // 从知识图谱跳转的筛选条件
}

export const PracticeArena: React.FC<PracticeArenaProps> = ({
  selectedCategory,
  onRecordQuestionAnswered,
  reviewTrigger,
  knowledgeFilter
}) => {
  const { user, mergeVersion } = useAuth();
  const { openAuth } = useAuthUI();
  const quota = useQuota();
  const [practiceMode, setPracticeMode] = useState<'drill' | 'papers' | 'mistakes' | 'review' | 'history'>('drill');
  const [activeModule, setActiveModule] = useState<string>('all');
  const [activeProvince, setActiveProvince] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('xingan_active_province');
      if (saved) return saved;
    } catch (e) { /* ignore */ }
    return 'all';
  });

  // 当目标考试为国考或全部时，省份筛选重置为"全部省份"
  useEffect(() => {
    if (selectedCategory === 'national' || selectedCategory === 'all') {
      setActiveProvince('all');
    }
    setCurrentQuestionIndex(0);
  }, [selectedCategory]);

  // 持久化省份选择
  useEffect(() => {
    try {
      localStorage.setItem('xingan_active_province', activeProvince);
    } catch (e) { /* ignore */ }
  }, [activeProvince]);
  
  // Drill mode state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, boolean>>({});
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<string[]>([]);
  const [mistakeList, setMistakeList] = useState<string[]>([]);

  // 复习模式状态
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [reviewLoading, setReviewLoading] = useState<boolean>(false);
  const [reviewIndex, setReviewIndex] = useState<number>(0);
  const [reviewSubmitted, setReviewSubmitted] = useState<Record<string, boolean>>({});
  const [reviewSelected, setReviewSelected] = useState<Record<string, string>>({});

  // 知识图谱跳转筛选
  const [currentKnowledgeFilter, setCurrentKnowledgeFilter] = useState<{ module: string; cardIds: string[]; keywords: string[] } | null>(null);

  const { questionsPool, filteredQuestions, isLoading, indexData } = useQuestions(
    selectedCategory,
    activeProvince,
    activeModule,
    practiceMode,
    mistakeList,
    currentKnowledgeFilter
  );

  // 响应外部 knowledgeFilter 变化
  useEffect(() => {
    if (knowledgeFilter) {
      setCurrentKnowledgeFilter(knowledgeFilter);
      setActiveModule(knowledgeFilter.module);
      setPracticeMode('drill');
      setCurrentQuestionIndex(0);
    }
  }, [knowledgeFilter]);

  // Paper simulation state
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [paperAnswers, setPaperAnswers] = useState<Record<string, string>>({});
  const [isPaperSubmitted, setIsPaperSubmitted] = useState<boolean>(false);
  const [paperScore, setPaperScore] = useState<number | null>(null);

  // Custom paper (mock exam by province) state
  const [showCustomPaper, setShowCustomPaper] = useState<boolean>(false);
  const [quotaBlockedOpen, setQuotaBlockedOpen] = useState<boolean>(false);
  const [customProvince, setCustomProvince] = useState<string>('联考');
  const [customCount, setCustomCount] = useState<number>(20);

  // 按目标省份+联考抽题组卷
  const handleGenerateCustomPaper = () => {
    // 目标省份的题目 + 联考题
    const pool = questionsPool.filter(q =>
      q.province === customProvince || q.province === '联考'
    );
    // 只抽客观题（有选项的）
    const objectivePool = pool.filter(q => q.options && q.options.length > 0);
    const count = Math.min(customCount, objectivePool.length);
    // 随机抽取
    const shuffled = [...objectivePool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    const paper: Paper = {
      id: 'custom-' + customProvince + '-' + Date.now(),
      title: customProvince === '联考' ? '多省联考《行测》全真模拟卷' : `${customProvince}省考《行测》全真模拟卷（含联考真题）`,
      category: 'provincial',
      year: new Date().getFullYear(),
      durationMinutes: count * 1.5,
      totalScore: 100,
      questionCount: count,
      questions: selected,
      difficulty: `${customProvince}定向卷 · 共${count}题`
    };
    setShowCustomPaper(false);
    handleStartPaper(paper);
  };

  // 筛选逻辑：目标考试 + 省份 + 模块 + 知识图谱，AND 关系
  // 注意：从知识图谱跳转时（currentKnowledgeFilter 存在），忽略 category/province/module 筛选，只按知识图谱条件筛选
  const isKnowledgeFilterActive = !!currentKnowledgeFilter;

  // 按模块统计题目数（估算）
  const moduleCounts = Object.fromEntries(
    Object.keys(EXAM_MODULE_NAMES).map(mod => {
      let count = 0;
      if (indexData) {
        Object.keys(indexData).forEach(key => {
          const [cat, prov, m] = key.split('-');
          const catMatch = selectedCategory === 'all' || cat === selectedCategory;
          const provMatch = activeProvince === 'all' || prov === activeProvince || (selectedCategory === 'national' && prov === 'none') || prov === '联考';
          if (catMatch && provMatch && m === mod) {
             count += indexData[key].length * 150;
          }
        });
      }
      return [mod, count];
    })
  );
  const totalFilteredCount = Object.values(moduleCounts).reduce((a, b) => a + b, 0);

  const currentQ = filteredQuestions[currentQuestionIndex] || filteredQuestions[0];

  const handleSelectOption = (qId: string, optKey: string) => {
    if (submittedQuestions[qId]) return;
    setSelectedAnswers(prev => ({ ...prev, [qId]: optKey }));
  };

  // 答错入队：写入 review_items（艾宾浩斯复习队列）
  const addToReviewQueue = async (q: Question) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('review_items')
        .select('id, wrong_count')
        .eq('user_id', user.id)
        .eq('question_id', q.id)
        .maybeSingle();

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      if (existing) {
        await supabase
          .from('review_items')
          .update({
            wrong_count: existing.wrong_count + 1,
            correct_streak: 0,
            interval_days: 1,
            next_review_at: tomorrow,
            mastered: false
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('review_items')
          .insert({
            user_id: user.id,
            question_id: q.id,
            wrong_count: 1,
            correct_streak: 0,
            interval_days: 1,
            next_review_at: tomorrow,
            mastered: false
          });
      }
    } catch (e) { /* ignore */ }
  };

  // 登录后把云端错题并入错题本（含游客数据合并结果）；游客态不展示错题本
  useEffect(() => {
    if (!user) {
      setMistakeList([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('review_items')
          .select('question_id')
          .eq('user_id', user.id);
        if (!alive || !data) return;
        const cloudIds = data.map(item => item.question_id).filter(Boolean);
        setMistakeList(prev => Array.from(new Set([...prev, ...cloudIds])));
      } catch (e) { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [user?.id, mergeVersion]);

  const handleUpgrade = () => {
    window.alert('会员体系随面试大厅上线开放，当前每日 50 题免费额度已足够完成一轮专项训练。');
  };

  const handleSubmitQuestion = async (q: Question) => {
    const isSubjective = !q.options || q.options.length === 0;
    const ans = selectedAnswers[q.id];
    if (!ans && !isSubjective) return;
    if (submittedQuestions[q.id]) return;

    const isCorrect = isSubjective ? null : ans === q.answer;
    const outcome = await quota.consume(q.id, {
      selectedKey: ans ?? null,
      isCorrect,
      source: 'drill',
    });

    if (!outcome.allowed) {
      if (!user || outcome.reason === 'guest_limit') {
        openAuth('guest_limit');
      } else {
        setQuotaBlockedOpen(true);
      }
      return;
    }

    setSubmittedQuestions(prev => ({ ...prev, [q.id]: true }));
    onRecordQuestionAnswered();

    if (isCorrect === false) {
      if (!mistakeList.includes(q.id)) {
        setMistakeList(prev => [...prev, q.id]);
      }
      if (user) {
        addToReviewQueue(q);
      } else {
        addGuestMistake(q.id);
      }
    }
  };

  const handleToggleBookmark = (qId: string) => {
    setBookmarkedQuestions(prev => 
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const handleStartPaper = (paper: Paper) => {
    setActivePaper(paper);
    setPaperAnswers({});
    setIsPaperSubmitted(false);
    setPaperScore(null);
  };

  const handleSubmitPaper = async () => {
    if (!activePaper) return;

    // 只对"已作答"的题目扣额度；空白题不计入额度消耗
    const answeredQuestions = activePaper.questions.filter(q => !!paperAnswers[q.id]);
    const batchResult = await quota.consumeBatch(
      answeredQuestions.map(q => ({
        question_id: q.id,
        selected_key: paperAnswers[q.id],
        is_correct: paperAnswers[q.id] === q.answer,
        source: 'paper',
      })),
      'paper'
    );
    const allowedSet = new Set(batchResult.allowedIds);

    let correctCount = 0;
    activePaper.questions.forEach(q => {
      if (paperAnswers[q.id] === q.answer) {
        correctCount++;
        return;
      }
      // 空白题或额度被拦截的题，不写入错题本，避免"没扣额度却产生错题"
      if (!paperAnswers[q.id] || !allowedSet.has(q.id)) return;

      if (!mistakeList.includes(q.id)) {
        setMistakeList(prev => [...prev, q.id]);
      }
      if (user) {
        addToReviewQueue(q);
      } else {
        addGuestMistake(q.id);
      }
    });

    const calculatedScore = Math.round((correctCount / activePaper.questions.length) * 100);
    setPaperScore(calculatedScore);
    setIsPaperSubmitted(true);

    for (let i = 0; i < allowedSet.size; i++) {
      onRecordQuestionAnswered();
    }

    if (batchResult.blocked > 0) {
      if (!user) {
        openAuth('guest_limit');
      } else {
        setQuotaBlockedOpen(true);
      }
    }
  };

  // ============================================
  // 复习模式：艾宾浩斯错题复习
  // ============================================
  const loadReviewQueue = async () => {
    if (!user) {
      setReviewItems([]);
      return;
    }
    setReviewLoading(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('review_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('mastered', false)
        .lte('next_review_at', now)
        .order('next_review_at', { ascending: true });
      if (error) throw error;

      // 从题库中匹配出题目对象
      const questions = (data || [])
        .map(item => {
          const q = questionsPool.find(mq => mq.id === item.question_id);
          return q ? { ...q, review: item } : null;
        })
        .filter(Boolean) as Question[];

      setReviewItems(questions);
      setReviewIndex(0);
      setReviewSubmitted({});
      setReviewSelected({});
    } catch (e) { /* ignore */ }
    setReviewLoading(false);
  };

  // 进入复习模式时加载队列
  useEffect(() => {
    if (practiceMode === 'review') {
      loadReviewQueue();
    }
  }, [practiceMode, user]);

  // 外部触发进入复习模式
  useEffect(() => {
    if (reviewTrigger && reviewTrigger > 0) {
      setPracticeMode('review');
      setActivePaper(null);
    }
  }, [reviewTrigger]);

  const currentReviewQ = reviewItems[reviewIndex];

  const handleReviewSelect = (qId: string, optKey: string) => {
    if (reviewSubmitted[qId]) return;
    setReviewSelected(prev => ({ ...prev, [qId]: optKey }));
  };

  const handleReviewSubmit = async (q: Question & { review?: any }) => {
    const ans = reviewSelected[q.id];
    if (!ans) return;
    if (!user || !q.review) return;

    const outcome = await quota.consume(q.id, {
      selectedKey: ans,
      isCorrect: ans === q.answer,
      source: 'review',
    });
    if (!outcome.allowed) {
      setQuotaBlockedOpen(true);
      return;
    }

    setReviewSubmitted(prev => ({ ...prev, [q.id]: true }));
    onRecordQuestionAnswered();

    const isCorrect = ans === q.answer;
    const item = q.review;
    const now = new Date();

    try {
      if (isCorrect) {
        const newStreak = (item.correct_streak || 0) + 1;
        const newInterval = (item.interval_days || 1) * 2;
        const mastered = newStreak >= 3;
        const nextReview = mastered
          ? null
          : new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000).toISOString();

        await supabase
          .from('review_items')
          .update({
            correct_streak: newStreak,
            interval_days: newInterval,
            next_review_at: nextReview,
            last_reviewed_at: now.toISOString(),
            mastered
          })
          .eq('id', item.id);
      } else {
        // 答错：重置 streak 和间隔
        const nextReview = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('review_items')
          .update({
            correct_streak: 0,
            interval_days: 1,
            next_review_at: nextReview,
            last_reviewed_at: now.toISOString(),
            wrong_count: (item.wrong_count || 0) + 1,
            mastered: false
          })
          .eq('id', item.id);
      }
    } catch (e) { /* ignore */ }
  };

  const handleNextReview = () => {
    if (reviewIndex < reviewItems.length - 1) {
      setReviewIndex(prev => prev + 1);
    } else {
      // 复习完成，重新加载队列
      loadReviewQueue();
    }
  };

  if (isLoading && questionsPool.length === 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Mode Navigation */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            初试研习题库与真题模拟
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            覆盖行测五大模块与申论思辨，真题真测，每题均配备【公职思维】深度剖析。
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setPracticeMode('drill'); setActivePaper(null); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              practiceMode === 'drill' && !activePaper ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            专项刷题
          </button>
          <button
            onClick={() => { setPracticeMode('papers'); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              practiceMode === 'papers' || activePaper ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            真题试卷 ({MOCK_PAPERS.length})
          </button>
          <button
            onClick={() => { setPracticeMode('mistakes'); setActivePaper(null); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              practiceMode === 'mistakes' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            错题本 ({mistakeList.length})
          </button>
          <button
            onClick={() => { setPracticeMode('review'); setActivePaper(null); }}
            className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              practiceMode === 'review' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            错题复习
          </button>
          <button
            onClick={() => { setPracticeMode('history'); setActivePaper(null); }}
            className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              practiceMode === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            答题历史
          </button>
        </div>
      </div>

      <QuotaBanner
        used={quota.used}
        limit={quota.limit}
        remaining={quota.remaining}
        isGuest={quota.isGuest}
        loading={quota.loading}
        degraded={quota.degraded}
        onLogin={() => openAuth('default')}
        onUpgrade={handleUpgrade}
      />

      {/* PAPER SIMULATION VIEW */}
      {activePaper ? (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 mb-1">
                {activePaper.difficulty}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{activePaper.title}</h3>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-mono text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>限时 {activePaper.durationMinutes} 分钟</span>
              </div>
              <button
                onClick={() => setActivePaper(null)}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                退出试卷
              </button>
            </div>
          </div>

          {/* Paper Result Banner */}
          {isPaperSubmitted && paperScore !== null && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-800 font-semibold">交卷测试结果</span>
                <div className="text-2xl font-black text-emerald-950 font-mono">
                  模拟折算得分：{paperScore} 分
                </div>
                <p className="text-xs text-emerald-700 mt-0.5">
                  按部就班就是伟大。错题已自动收录至错题本，稍后可针对性巩固！
                </p>
              </div>
              <button
                onClick={() => {
                  setPracticeMode('mistakes');
                  setActivePaper(null);
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
              >
                查看本次错题巩固
              </button>
            </div>
          )}

          {/* Question List in Paper */}
          <div className="space-y-6">
            {filterValidQuestions(activePaper.questions).map((q, idx) => (
              <QuestionErrorBoundary key={q.id} resetKey={`${activePaper.id}-${q.id}`}>
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">
                    第 {idx + 1} 题 · 【{EXAM_MODULE_NAMES[q.module] || q.module}】
                  </span>
                  <span>{q.difficulty}</span>
                </div>

                {isMergedAbnormal(q) ? (
                  <AbnormalQuestionPlaceholder questionId={q.id} />
                ) : (
                <>
                <p className="text-xs sm:text-sm text-slate-900 leading-relaxed font-medium">
                  {q.stem}
                </p>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.options?.map((opt) => {
                    const isSelected = paperAnswers[q.id] === opt.key;
                    const isCorrect = q.answer === opt.key;
                    let optClass = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';

                    if (isPaperSubmitted) {
                      if (isCorrect) {
                        optClass = 'bg-emerald-100/80 border-emerald-500 text-emerald-950 font-semibold';
                      } else if (isSelected && !isCorrect) {
                        optClass = 'bg-rose-100/80 border-rose-300 text-rose-900';
                      }
                    } else if (isSelected) {
                      optClass = 'bg-emerald-50 border-emerald-600 text-emerald-900 font-medium';
                    }

                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          if (!isPaperSubmitted) {
                            setPaperAnswers(prev => ({ ...prev, [q.id]: opt.key }));
                          }
                        }}
                        className={`text-left p-3 rounded-lg border text-xs transition-colors flex items-center gap-2 cursor-pointer ${optClass}`}
                      >
                        <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center font-bold text-[11px]">
                          {opt.key}
                        </span>
                        <span className="truncate">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>

                {isPaperSubmitted && (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                    <span className="font-semibold text-slate-900">【解析与思维迁移】：</span>
                    <p>{q.explanation}</p>
                    <p className="text-emerald-700 font-medium pt-1">{q.thinkingTip}</p>
                  </div>
                )}
                </>
                )}
              </div>
              </QuestionErrorBoundary>
            ))}
          </div>

          {!isPaperSubmitted && (
            <div className="flex justify-end pt-4">
              <button
                onClick={handleSubmitPaper}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                交卷并查看深度解析
              </button>
            </div>
          )}
        </div>
      ) : practiceMode === 'papers' ? (
        /* PAPERS LIST */
        <div className="space-y-5">
          {/* Custom Paper Generator */}
          <div className="bg-white rounded-2xl p-5 border border-emerald-200/60 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  按目标省份智能组卷
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  选择目标省份，系统从该省真题 + 联考真题中随机抽取客观题生成模拟卷
                </p>
              </div>
              <button
                onClick={() => setShowCustomPaper(prev => !prev)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                {showCustomPaper ? '收起配置' : '自定义组卷'}
              </button>
            </div>

            {showCustomPaper && (
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">目标省份</label>
                  <select
                    value={customProvince}
                    onChange={(e) => setCustomProvince(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer min-w-[120px]"
                  >
                    {PROVINCE_LIST.map(prov => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">题目数量</label>
                  <select
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                  >
                    <option value={10}>10 题（快测）</option>
                    <option value={20}>20 题</option>
                    <option value={40}>40 题</option>
                    <option value={60}>60 题</option>
                    <option value={100}>100 题</option>
                  </select>
                </div>
                <button
                  onClick={handleGenerateCustomPaper}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Layers className="w-3.5 h-3.5" />
                  生成模拟卷并开始
                </button>
              </div>
            )}
          </div>

          {/* Preset Papers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MOCK_PAPERS.map((paper) => (
            <div
              key={paper.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-emerald-700 font-mono">{paper.year}年真题</span>
                  <span>{paper.durationMinutes} 分钟</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                  {paper.title}
                </h3>
                <p className="text-xs text-slate-500 mt-2">
                  {paper.difficulty}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-4">
                <span className="text-xs text-slate-400">共 {paper.questions.length} 题精解</span>
                <button
                  onClick={() => handleStartPaper(paper)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  开启全真模拟
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : practiceMode === 'mistakes' ? (
        !user ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
            <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800">登录后查看错题本</h4>
            <p className="text-xs text-slate-500 mt-1">
              错题会云端保存，并自动进入艾宾浩斯复习队列。
            </p>
            <button
              onClick={() => openAuth('need_login')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              立即登录
            </button>
          </div>
        ) : (
        /* MISTAKES NOTEBOOK */
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900">
            <strong>错题管理哲学：</strong> “做对十道题，不如真正弄懂一道错题。”这里汇集了你在刷题和模拟中未能一次命中的考点。
          </div>

          {mistakeList.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
              <Award className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">暂无积压错题</h4>
              <p className="text-xs text-slate-500 mt-1">
                去“专项刷题”或“真题试卷”中实战演练，错题将自动归入此本。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filterValidQuestions(questionsPool.filter(q => mistakeList.includes(q.id))).map((q) => (
                <QuestionErrorBoundary key={q.id} resetKey={`mistake-${q.id}`}>
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      【{EXAM_MODULE_NAMES[q.module]}】{q.title}
                    </span>
                    <span className="text-rose-600 font-semibold">历史错题</span>
                  </div>
                  {isMergedAbnormal(q) ? (
                    <AbnormalQuestionPlaceholder questionId={q.id} compact />
                  ) : (
                  <>
                  <p className="text-xs sm:text-sm text-slate-800 font-medium">{q.stem}</p>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                    <strong className="text-slate-900">正确答案：{q.answer}</strong>
                    <p className="mt-1">{q.explanation}</p>
                    <p className="text-emerald-700 font-semibold mt-1">{q.thinkingTip}</p>
                  </div>
                  </>
                  )}
                </div>
                </QuestionErrorBoundary>
              ))}
            </div>
          )}
        </div>
        )
      ) : practiceMode === 'history' ? (
        <AnswerHistory
          questionsPool={questionsPool}
          onRequireLogin={() => openAuth('need_login')}
        />
      ) : practiceMode === 'review' ? (
        /* REVIEW MODE: 艾宾浩斯错题复习 */
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-900">
              <Brain className="w-4 h-4" />
              <span className="text-sm font-bold">艾宾浩斯错题复习</span>
            </div>
            <p className="text-xs text-emerald-700 mt-1">
              按遗忘曲线节奏（第1/3/7/15天）推送错题，先作答后看解析。连续 3 次答对即视为掌握。
            </p>
          </div>

          {reviewLoading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 text-slate-400 text-sm">
              加载复习队列中...
            </div>
          ) : !user ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
              <Brain className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">登录后即可使用错题复习</h4>
              <p className="text-xs text-slate-500 mt-1">
                复习记录将云端同步，换设备也不丢失。
              </p>
              <button
                onClick={() => openAuth('need_login')}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                立即登录
              </button>
            </div>
          ) : reviewItems.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">今日无待复习错题</h4>
              <p className="text-xs text-slate-500 mt-1">
                继续刷题，答错的题目会在次日自动进入复习队列。
              </p>
            </div>
          ) : currentReviewQ ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold">
                    {EXAM_MODULE_NAMES[currentReviewQ.module] || currentReviewQ.module}
                  </span>
                  <span className="text-slate-700 font-medium">{currentReviewQ.title}</span>
                </div>
                <span className="font-mono">{reviewIndex + 1} / {reviewItems.length}</span>
              </div>

              <p className="text-xs sm:text-sm text-slate-900 leading-relaxed font-medium">
                {currentReviewQ.stem}
              </p>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentReviewQ.options?.map((opt: {key: string; text: string}) => {
                  const isSelected = reviewSelected[currentReviewQ.id] === opt.key;
                  const isCorrect = currentReviewQ.answer === opt.key;
                  const submitted = reviewSubmitted[currentReviewQ.id];
                  let optClass = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';
                  if (submitted) {
                    if (isCorrect) optClass = 'bg-emerald-100/80 border-emerald-500 text-emerald-950 font-semibold';
                    else if (isSelected && !isCorrect) optClass = 'bg-rose-100/80 border-rose-300 text-rose-900';
                  } else if (isSelected) {
                    optClass = 'bg-emerald-50 border-emerald-600 text-emerald-900 font-medium';
                  }
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleReviewSelect(currentReviewQ.id, opt.key)}
                      disabled={submitted}
                      className={`p-3 rounded-xl border text-left text-xs transition-colors ${optClass} ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className="font-bold">{opt.key}.</span> {opt.text}
                    </button>
                  );
                })}
              </div>

              {/* Submit / Next */}
              {!reviewSubmitted[currentReviewQ.id] ? (
                <button
                  onClick={() => handleReviewSubmit(currentReviewQ)}
                  disabled={!reviewSelected[currentReviewQ.id]}
                  className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  确认作答
                </button>
              ) : (
                <>
                  {/* Result */}
                  <div className={`p-3 rounded-xl text-sm font-semibold ${
                    reviewSelected[currentReviewQ.id] === currentReviewQ.answer
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {reviewSelected[currentReviewQ.id] === currentReviewQ.answer
                      ? '✅ 回答正确！继续保持。'
                      : `❌ 回答错误，正确答案：${currentReviewQ.answer}`}
                  </div>

                  {/* Explanation */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                    <div>
                      <strong className="text-slate-900">【解析】</strong>
                      <p className="mt-1">{currentReviewQ.explanation}</p>
                    </div>
                    {currentReviewQ.thinkingTip && (
                      <p className="text-emerald-700 font-semibold">{currentReviewQ.thinkingTip}</p>
                    )}
                  </div>

                  <button
                    onClick={handleNextReview}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    {reviewIndex < reviewItems.length - 1 ? '下一题' : '完成本次复习'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        /* SPECIALIZED DRILL VIEW */
        <div className="space-y-5">
          {/* Module Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => { setActiveModule('all'); setCurrentQuestionIndex(0); }}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors cursor-pointer ${
                activeModule === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              全部模块 ({totalFilteredCount})
            </button>
            {Object.entries(EXAM_MODULE_NAMES).map(([modKey, modLabel]) => (
              <button
                key={modKey}
                onClick={() => { setActiveModule(modKey); setCurrentQuestionIndex(0); }}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors cursor-pointer ${
                  activeModule === modKey ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {modLabel} ({moduleCounts[modKey] || 0})
              </button>
            ))}
          </div>

          {/* Province Filter — 国考时隐藏 */}
          {selectedCategory !== 'national' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium shrink-0">省份筛选：</span>
              <select
                value={activeProvince}
                onChange={(e) => { setActiveProvince(e.target.value); setCurrentQuestionIndex(0); }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
              >
                <option value="all">全部省份</option>
                {PROVINCE_LIST.map(prov => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>
          )}

          {/* 知识图谱跳转筛选提示 */}
          {currentKnowledgeFilter && (
            <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-xs text-emerald-800">
                知识图谱筛选：{currentKnowledgeFilter.keywords.join('、')} · 共 {filteredQuestions.length} 题
              </span>
              <button
                onClick={() => setCurrentKnowledgeFilter(null)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
              >
                清除筛选
              </button>
            </div>
          )}

          {!currentQ && !isLoading && (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
              <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">当前筛选条件下暂无可用题目</h4>
              <p className="text-xs text-slate-500 mt-1">
                请切换模块或省份筛选，或稍候等待题库分片加载完成。
              </p>
            </div>
          )}

          {currentQ && (
            <QuestionErrorBoundary resetKey={`drill-${currentQ.id}`}>
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold">
                    {EXAM_MODULE_NAMES[currentQ.module]}
                  </span>
                  <span className="text-slate-700 font-medium">{currentQ.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleBookmark(currentQ.id)}
                    className="p-1 text-slate-400 hover:text-amber-500 cursor-pointer"
                    title="收藏题目"
                  >
                    <Bookmark className={`w-4 h-4 ${bookmarkedQuestions.includes(currentQ.id) ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                  <span className="font-mono">{currentQuestionIndex + 1} / {filteredQuestions.length}</span>
                </div>
              </div>

              {isMergedAbnormal(currentQ) ? (
                <AbnormalQuestionPlaceholder questionId={currentQ.id} />
              ) : (
              <>
              {/* Stem */}
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
                {currentQ.stem}
              </h3>

              {/* Options */}
              <div className="space-y-2.5 pt-2">
                {currentQ.options && currentQ.options.length > 0 ? currentQ.options.map((opt) => {
                  const isSelected = selectedAnswers[currentQ.id] === opt.key;
                  const isSubmitted = submittedQuestions[currentQ.id];
                  const isCorrect = currentQ.answer === opt.key;

                  let optClass = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';

                  if (isSubmitted) {
                    if (isCorrect) {
                      optClass = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold';
                    } else if (isSelected && !isCorrect) {
                      optClass = 'bg-rose-50 border-rose-300 text-rose-900';
                    } else {
                      optClass = 'bg-white border-slate-200 text-slate-400 opacity-60';
                    }
                  } else if (isSelected) {
                    optClass = 'bg-emerald-50/60 border-emerald-600 text-emerald-900 font-medium';
                  }

                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSelectOption(currentQ.id, opt.key)}
                      className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition-all cursor-pointer ${optClass}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center font-bold font-mono text-xs text-slate-800 shrink-0">
                          {opt.key}
                        </span>
                        <span>{opt.text}</span>
                      </div>

                      {isSubmitted && isCorrect && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                }) : currentQ.isImageQuestion ? (
                  <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-4 text-xs sm:text-sm text-sky-900 space-y-1">
                    <p className="font-semibold">本题为图片题（图形推理 / 图表类）</p>
                    <p className="text-sky-700">
                      原题选项为图片，文本化时未能保留。可先查看下方解析与标准答案
                      {currentQ.answer ? `（正确答案：${currentQ.answer}）` : ''}，或跳过本题继续练习。
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 text-xs sm:text-sm text-amber-900">
                    本题为主观题（申论/综应），无固定选项。请在下方查看参考答案要点后自行对照评分。
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3">
                <button
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                >
                  上一题
                </button>

                <div className="flex items-center gap-2">
                  {!submittedQuestions[currentQ.id] ? (
                    <button
                      onClick={() => handleSubmitQuestion(currentQ)}
                      disabled={!selectedAnswers[currentQ.id] && currentQ.options && currentQ.options.length > 0}
                      className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                        (!selectedAnswers[currentQ.id] && currentQ.options && currentQ.options.length > 0)
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      {currentQ.options && currentQ.options.length > 0 ? '确认作答' : '查看参考答案'}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (currentQuestionIndex < filteredQuestions.length - 1) {
                          setCurrentQuestionIndex(prev => prev + 1);
                        }
                      }}
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <span>下一题</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Instant Explanation Card */}
              {submittedQuestions[currentQ.id] && (
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        selectedAnswers[currentQ.id] === currentQ.answer
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {selectedAnswers[currentQ.id] === currentQ.answer ? '回答正确' : '回答错误'}
                      </span>
                      <span className="text-slate-600">
                        标准答案：<strong className="font-bold text-slate-900">{currentQ.answer}</strong>
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">{currentQ.source}</span>
                  </div>

                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                    <strong className="text-slate-900 block mb-1">【考点精解】：</strong>
                    {currentQ.explanation}
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-lg text-xs text-emerald-950 font-medium">
                    {currentQ.thinkingTip}
                  </div>

                  <NoteList
                    questionId={currentQ.id}
                    onRequireLogin={() => openAuth('need_login')}
                  />
                </div>
              )}
              </>
              )}
            </div>
            </QuestionErrorBoundary>
          )}
        </div>
      )}

      <QuotaLimitDialog
        open={quotaBlockedOpen}
        onClose={() => setQuotaBlockedOpen(false)}
        onUpgrade={handleUpgrade}
      />
    </div>
  );
};
