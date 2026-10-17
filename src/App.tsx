import React, { useState, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { PracticeArena } from './components/PracticeArena';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DailyMindset } from './components/DailyMindset';
import { AuthModal } from './components/AuthModal';
import { AudioPlayerFloating } from './components/AudioPlayerFloating';
import { ExamCategory } from './types';
import { AuthProvider } from './context/AuthContext';
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
const InterviewArena = React.lazy(() => import('./components/InterviewArena').then(module => ({ default: module.InterviewArena })));
const CommunityCheckIn = React.lazy(() => import('./components/CommunityCheckIn').then(module => ({ default: module.CommunityCheckIn })));
const GrowthSystem = React.lazy(() => import('./components/GrowthSystem').then(module => ({ default: module.GrowthSystem })));
const DailyPlanGenerator = React.lazy(() => import('./components/DailyPlanGenerator').then(module => ({ default: module.DailyPlanGenerator })));


// 支持 'all' 表示全部考试类型
type TargetCategory = ExamCategory | 'all';

const STORAGE_KEY_CATEGORY = 'xingan_target_category';

function getInitialCategory(): TargetCategory {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CATEGORY);
    if (saved && ['all', 'national', 'provincial', 'public_institution'].includes(saved)) {
      return saved as TargetCategory;
    }
  } catch (e) {
    // ignore
  }
  return 'all';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory>(getInitialCategory);
  const [reviewTrigger, setReviewTrigger] = useState<number>(0);
  const [knowledgeView, setKnowledgeView] = useState<'base' | 'graph'>('graph');
  const [knowledgeFilter, setKnowledgeFilter] = useState<{ module: string; cardIds: string[]; keywords: string[] } | null>(null);
  const [authOpen, setAuthOpen] = useState<boolean>(false);

  const handleSetCategory = (cat: TargetCategory) => {
    setSelectedCategory(cat);
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORY, cat);
    } catch (e) {
      // ignore
    }
  };

  // Global Growth & Dark-line RPG State (Serious, non-cartoon executive style)
  const [level, setLevel] = useState<number>(6);
  const [levelTitle, setLevelTitle] = useState<string>('基层实干主事');
  const [currentExp, setCurrentExp] = useState<number>(3420);
  const [nextLevelExp, setNextLevelExp] = useState<number>(5000);
  const [streakDays, setStreakDays] = useState<number>(48);
  const [mindsetCombo, setMindsetCombo] = useState<number>(24);
  const [totalQuestionsAnswered, setTotalQuestionsAnswered] = useState<number>(1420);
  const [totalInterviewMins, setTotalInterviewMins] = useState<number>(185);

  // Audio track state
  const [currentAudioTrack, setCurrentAudioTrack] = useState<{
    id: string;
    title: string;
    subtitle: string;
    textToRead: string;
  } | null>(null);

  const addExp = (amount: number) => {
    setCurrentExp(prev => {
      const next = prev + amount;
      if (next >= nextLevelExp) {
        setLevel(lvl => lvl + 1);
        if (level === 6) setLevelTitle('破局研判骨干');
        else if (level >= 10) setLevelTitle('案头策论大家');
        return next - nextLevelExp;
      }
      return next;
    });
  };

  const handlePlayAudio = (track: {
    id: string;
    title: string;
    subtitle: string;
    textToRead: string;
  }) => {
    setCurrentAudioTrack(track);
    addExp(15);
  };

  const handleFinishDailyTask = () => {
    setStreakDays(prev => prev + 1);
    setMindsetCombo(prev => prev + 1);
    setTotalQuestionsAnswered(prev => prev + 2);
    addExp(100);
  };

  const handleRecordQuestionAnswered = () => {
    setTotalQuestionsAnswered(prev => prev + 1);
    addExp(20);
  };

  const handleRecordInterviewPractice = () => {
    setTotalInterviewMins(prev => prev + 15);
    addExp(150);
  };

  const mobileNavItems = [
    { id: 'overview', label: '总览', icon: BarChart3 },
    { id: 'practice', label: '笔试', icon: BookOpen },
    { id: 'interview', label: '面试', icon: Mic },
    { id: 'plan', label: '计划', icon: Calendar },
    { id: 'growth', label: '成长', icon: Award },
    { id: 'community', label: '社区', icon: Users }
  ];

  return (
    <AuthProvider>
    <div className="min-h-screen bg-[#F3F4F6] text-slate-800 flex flex-col font-sans pb-20 md:pb-8">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedCategory={selectedCategory}
        setSelectedCategory={handleSetCategory}
        streakDays={streakDays}
        level={level}
        levelTitle={levelTitle}
        onOpenCheckIn={() => setActiveTab('community')}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>}>
        {activeTab === 'overview' && (
          <AnalyticsOverview
            onNavigate={(tab) => setActiveTab(tab)}
            selectedCategory={selectedCategory}
            streakDays={streakDays}
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
            />
          </ErrorBoundary>
        )}

        {/* 笔试专区: 知识点体系、通关秘籍与语音播放 */}
        {activeTab === 'knowledge' && (
          <div className="space-y-4">
            {/* 子视图切换 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setKnowledgeView('graph')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  knowledgeView === 'graph' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                知识图谱
              </button>
              <button
                onClick={() => setKnowledgeView('base')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  knowledgeView === 'base' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                通关秘籍
              </button>
            </div>
            {knowledgeView === 'graph' ? (
              <KnowledgeGraph
                onRequireLogin={() => setAuthOpen(true)}
                onJumpToPractice={(module, questionIds, keywords) => {
                  setKnowledgeFilter({ module, cardIds: questionIds, keywords });
                  setActiveTab('practice');
                }}
              />
            ) : (
              <KnowledgeBase onPlayAudio={handlePlayAudio} />
            )}
          </div>
        )}

        {/* 面试专区: 结构化 & 无领导小组讨论 (自练与组队、语音与自录视频) */}
        {activeTab === 'interview' && (
          <InterviewArena
            onRecordPractice={handleRecordInterviewPractice}
            streakDays={streakDays}
          />
        )}

        {/* 定制学习计划: 根据个人情况描述AI自动生成每日计划 */}
        {activeTab === 'plan' && (
          <DailyPlanGenerator
            onNavigateTab={(tab) => setActiveTab(tab)}
            onPlanTaskCompleted={() => addExp(50)}
          />
        )}

        {/* 全局成长系统: 等级、勋章、连击 (严肃暗线，绝不卡通) */}
        {activeTab === 'growth' && (
          <GrowthSystem
            level={level}
            levelTitle={levelTitle}
            currentExp={currentExp}
            nextLevelExp={nextLevelExp}
            streakDays={streakDays}
            mindsetCombo={mindsetCombo}
            totalQuestionsAnswered={totalQuestionsAnswered}
            totalInterviewMins={totalInterviewMins}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* 备考打卡社区: 互勉轨迹，不显对手高分 */}
        {activeTab === 'community' && (
          <CommunityCheckIn
            streakDays={streakDays}
            totalQuestions={totalQuestionsAnswered}
            onCheckInSuccess={() => {
              setStreakDays(prev => prev + 1);
              addExp(60);
            }}
          />
        )}
        </Suspense>
      </main>

      {/* 登录弹窗（知识图谱未登录引导） */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* Floating Audio Player for background voice summaries */}
      <AudioPlayerFloating
        currentTrack={currentAudioTrack}
        onClose={() => setCurrentAudioTrack(null)}
      />

      {/* Mobile Bottom Navigation Bar (optimized for mobile fragmented time) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = (item.id === 'practice' && ['practice', 'knowledge', 'daily'].includes(activeTab)) || activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 min-w-[50px] rounded-lg transition-colors cursor-pointer ${
                isActive ? 'text-emerald-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
    </AuthProvider>
  );
}
