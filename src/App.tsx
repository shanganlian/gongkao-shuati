import React, { useEffect, useState, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { PracticeArena } from './components/PracticeArena';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DailyMindset } from './components/DailyMindset';
import { AudioPlayerFloating } from './components/AudioPlayerFloating';
import { SiteFooter } from './components/SiteFooter';
import { ExamCategory } from './types';
import { COMMUNITY_ENABLED } from './data/mockData';
import { KNOWLEDGE_MODULE_ENABLED } from './lib/featureFlags';
import { useAuthUI } from './context/AuthUIContext';
import { useActivityStats } from './hooks/useActivityStats';
import type { MindsetCompletionInput, RecordedQuestionInput } from './lib/activityStats';
import { isInterviewHash } from './components/interview/interviewRoutes';
import {
  BarChart3,
  Sparkles,
  BookOpen,
  Compass,
  Mic,
  Users,
  Award,
  Calendar
} from 'lucide-react';

const AnalyticsOverview = React.lazy(() => import('./components/AnalyticsOverview').then(module => ({ default: module.AnalyticsOverview })));
const KnowledgeBase = React.lazy(() => import('./components/KnowledgeBase').then(module => ({ default: module.KnowledgeBase })));
const KnowledgeGraph = React.lazy(() => import('./components/KnowledgeGraph').then(module => ({ default: module.KnowledgeGraph })));
// 知识点体系通关（资料分析卡片）：入口与组件都受 KNOWLEDGE_MODULE_ENABLED 控制
const KnowledgeCards = React.lazy(() => import('./components/KnowledgeCards').then(module => ({ default: module.KnowledgeCards })));
const InterviewHall = React.lazy(() => import('./components/interview/InterviewHall').then(module => ({ default: module.InterviewHall })));
const CommunityCheckIn = React.lazy(() => import('./components/CommunityCheckIn').then(module => ({ default: module.CommunityCheckIn })));
const GrowthSystem = React.lazy(() => import('./components/GrowthSystem').then(module => ({ default: module.GrowthSystem })));
const StudyPlan = React.lazy(() => import('./components/StudyPlan').then(module => ({ default: module.StudyPlan })));


// 支持 'all' 表示全部考试类型
type TargetCategory = ExamCategory | 'all';

const STORAGE_KEY_CATEGORY = 'xingan_target_category';

function getInitialCategory(): TargetCategory {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CATEGORY);
    // 只恢复仍有入口的考试类型。public_institution（事业编）题库暂无数据、下拉入口已隐藏，
    // 老用户本地残留的该值不再恢复，统一落到「全部考试」，避免停在一个无法再次选中的分类。
    if (saved && ['all', 'national', 'provincial'].includes(saved)) {
      return saved as TargetCategory;
    }
  } catch (e) {
    // ignore
  }
  return 'all';
}

/** 刷新 / 分享链接时，只要 hash 指向面试子路由，就直接回到面试 Tab */
function getInitialTab(): string {
  if (typeof window !== 'undefined' && isInterviewHash(window.location.hash)) {
    return 'interview';
  }
  return 'overview';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory>(getInitialCategory);
  const [reviewTrigger, setReviewTrigger] = useState<number>(0);
  const [knowledgeView, setKnowledgeView] = useState<'base' | 'graph' | 'cards'>('graph');
  const [knowledgeFilter, setKnowledgeFilter] = useState<{ module: string; cardIds: string[]; keywords: string[] } | null>(null);
  // 定制计划「去练」：锁定题库模块并进入刷题模式（nonce 保证重复点击同一模块也能触发）
  const [practiceLaunch, setPracticeLaunch] = useState<{ module: string; nonce: number } | null>(null);
  const { openAuth } = useAuthUI();

  // 离开面试模块时清掉面试子路由，避免 URL 仍停在 #/interview/report/... 导致刷新又跳回面试
  useEffect(() => {
    if (activeTab === 'interview') return;
    if (typeof window === 'undefined' || !isInterviewHash(window.location.hash)) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [activeTab]);

  // 备考社区下线期间：任何残留入口、旧链接、历史状态统一回到学情总览
  useEffect(() => {
    if (!COMMUNITY_ENABLED && activeTab === 'community') {
      setActiveTab('overview');
    }
  }, [activeTab]);

  const handleSetCategory = (cat: TargetCategory) => {
    setSelectedCategory(cat);
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORY, cat);
    } catch (e) {
      // ignore
    }
  };

  // 成长线全部来自真实活动：答题 / 每日两题 / 打卡 / 计划 / 面试练习
  const {
    stats: activityStats,
    refresh: refreshActivityStats,
    recordQuestions,
    recordMindset,
    recordCheckIn,
    recordPlanTask,
  } = useActivityStats();

  const totalExp =
    activityStats.totalAnswered * 10 +
    activityStats.mindsetDays * 100 +
    activityStats.checkInDays * 30 +
    activityStats.interviewSessions * 150 +
    activityStats.planTasks * 50;
  const nextLevelExp = 500;
  const level = Math.min(99, Math.floor(totalExp / nextLevelExp) + 1);
  const currentExp = totalExp % nextLevelExp;
  const levelTitle =
    level >= 12 ? '案头策论大家' :
    level >= 8 ? '破局研判骨干' :
    level >= 4 ? '基层实干主事' :
    '备考新锐';
  const streakDays = activityStats.streakDays;

  // Audio track state
  const [currentAudioTrack, setCurrentAudioTrack] = useState<{
    id: string;
    title: string;
    subtitle: string;
    textToRead: string;
  } | null>(null);

  const handlePlayAudio = (track: {
    id: string;
    title: string;
    subtitle: string;
    textToRead: string;
  }) => {
    setCurrentAudioTrack(track);
  };

  const handleFinishDailyTask = (input?: MindsetCompletionInput) => {
    recordMindset(input);
  };

  const handleRecordQuestionAnswered = (records: RecordedQuestionInput[]) => {
    recordQuestions(records);
  };

  const handleRecordInterviewPractice = () => {
    // 面试记录先写入本地，再由统计层重新聚合真实场次 / 时长 / 得分
    void refreshActivityStats();
  };

  const mobileNavItems = [
    { id: 'overview', label: '总览', icon: BarChart3 },
    { id: 'practice', label: '笔试', icon: BookOpen },
    { id: 'interview', label: '面试', icon: Mic },
    { id: 'plan', label: '计划', icon: Calendar },
    { id: 'growth', label: '成长', icon: Award },
    // 备考社区：COMMUNITY_ENABLED=false 时整块下线（代码保留，改 flag 即恢复）
    ...(COMMUNITY_ENABLED ? [{ id: 'community', label: '社区', icon: Users }] : [])
  ];

  return (
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col font-sans pb-20 md:pb-8">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedCategory={selectedCategory}
        setSelectedCategory={handleSetCategory}
        streakDays={streakDays}
        level={level}
        levelTitle={levelTitle}
        onOpenCheckIn={() => setActiveTab('plan')}
        onOpenKnowledgeHub={() => setKnowledgeView('graph')}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>}>
        {activeTab === 'overview' && (
          <AnalyticsOverview
            onNavigate={(tab) => setActiveTab(tab)}
            selectedCategory={selectedCategory}
            activityStats={activityStats}
            onStartReview={() => { setReviewTrigger(prev => prev + 1); setActiveTab('practice'); }}
          />
        )}

        {/* 笔试专区: 每日两题长线思维晨练 */}
        {activeTab === 'daily' && (
          <DailyMindset
            onPlayAudio={handlePlayAudio}
            onFinishDailyTask={handleFinishDailyTask}
          />
        )}

        {/* 笔试专区: 题库刷题与真题卷 */}
        {activeTab === 'practice' && (
          <ErrorBoundary>
            <PracticeArena
              selectedCategory={selectedCategory}
              onRecordQuestionAnswered={handleRecordQuestionAnswered}
              reviewTrigger={reviewTrigger}
              knowledgeFilter={knowledgeFilter}
              launchFilter={practiceLaunch}
            />
          </ErrorBoundary>
        )}

        {/* 笔试专区: 知识点体系、通关秘籍与语音播放 */}
        {activeTab === 'knowledge' && (
          <div className="space-y-4">
            {/* 子视图切换 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setKnowledgeView('graph')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  knowledgeView === 'graph' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                知识图谱
              </button>
              <button
                onClick={() => setKnowledgeView('base')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  knowledgeView === 'base' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                通关秘籍
              </button>
              {/* 知识点体系通关：KNOWLEDGE_MODULE_ENABLED 为 false 时整块不渲染 */}
              {KNOWLEDGE_MODULE_ENABLED && (
                <button
                  onClick={() => setKnowledgeView('cards')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    knowledgeView === 'cards' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  知识点体系通关
                </button>
              )}
            </div>
            {knowledgeView === 'cards' && KNOWLEDGE_MODULE_ENABLED ? (
              <KnowledgeCards />
            ) : knowledgeView === 'base' ? (
              <KnowledgeBase onPlayAudio={handlePlayAudio} />
            ) : (
              <KnowledgeGraph
                onRequireLogin={() => openAuth('need_login')}
                onJumpToPractice={(module, questionIds, keywords) => {
                  setKnowledgeFilter({ module, cardIds: questionIds, keywords });
                  setActiveTab('practice');
                }}
              />
            )}
          </div>
        )}

        {/* 面试专区: 结构化题库 → 抽题作答 → AI 报告 → 练习记录 */}
        {activeTab === 'interview' && (
          <ErrorBoundary fallbackMessage="面试模块加载异常，请刷新后重试">
            <InterviewHall onRecordPractice={handleRecordInterviewPractice} />
          </ErrorBoundary>
        )}

        {/* 定制计划 v1: 3 步向导 → 4 周计划看板（勾选任务即打卡） */}
        {activeTab === 'plan' && (
          <StudyPlan
            onNavigateTab={(tab) => setActiveTab(tab)}
            onPlanTaskCompleted={(taskKey) => {
              recordPlanTask(taskKey);
              // 首次勾选即当日打卡；activityStats 按 date|key 去重，重复勾选不会重复加经验
              recordCheckIn();
            }}
            onStartPractice={(module) => {
              setKnowledgeFilter(null);
              setPracticeLaunch({ module, nonce: Date.now() });
              setActiveTab('practice');
            }}
          />
        )}

        {/* 全局成长系统: 等级、勋章、连击 (严肃暗线，绝不卡通) */}
        {activeTab === 'growth' && (
          <GrowthSystem
            level={level}
            levelTitle={levelTitle}
            currentExp={currentExp}
            nextLevelExp={nextLevelExp}
            activityStats={activityStats}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* 备考打卡社区: 互勉轨迹，不显对手高分 */}
        {activeTab === 'community' && (
          <CommunityCheckIn
            activityStats={activityStats}
            onCheckInSuccess={() => recordCheckIn()}
          />
        )}
        </Suspense>
      </main>

      <SiteFooter />

      {/* Floating Audio Player for background voice summaries */}
      <AudioPlayerFloating
        currentTrack={currentAudioTrack}
        onClose={() => setCurrentAudioTrack(null)}
      />

      {/* Mobile Bottom Navigation Bar (optimized for mobile fragmented time) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-700/80 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = (item.id === 'practice' && ['practice', 'knowledge', 'daily'].includes(activeTab)) || activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 min-w-[50px] rounded-lg transition-colors cursor-pointer ${
                isActive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
