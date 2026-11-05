import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  BookOpen, 
  Compass, 
  Mic, 
  TrendingUp, 
  ShieldCheck, 
  Clock,
  Layers,
  ChevronRight,
  Plus,
  Brain,
  RefreshCw
} from 'lucide-react';
import { ExamCategory } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatStreakDays, OBJECTIVE_MODULES } from '../lib/activityStats';
import type { ActivityStats } from '../lib/activityStats';

type TargetCategory = ExamCategory | 'all';

interface AnalyticsOverviewProps {
  onNavigate: (tab: string) => void;
  selectedCategory: TargetCategory;
  activityStats: ActivityStats;
  onStartReview: () => void;
}

export const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({
  onNavigate,
  selectedCategory,
  activityStats,
  onStartReview
}) => {
  const { user } = useAuth();
  const [activeViewMode, setActiveViewMode] = useState<string>('standard');
  const [reviewStats, setReviewStats] = useState<{ due: number; queue: number; mastered: number }>({ due: 0, queue: 0, mastered: 0 });

  // 惰性加载复习统计
  useEffect(() => {
    if (!user) {
      setReviewStats({ due: 0, queue: 0, mastered: 0 });
      return;
    }
    (async () => {
      try {
        const now = new Date().toISOString();
        // 待复习数
        const { data: dueData } = await supabase
          .from('review_items')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('mastered', false)
          .lte('next_review_at', now);
        // 队列总数
        const { data: queueData } = await supabase
          .from('review_items')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('mastered', false);
        // 已掌握数
        const { data: masteredData } = await supabase
          .from('review_items')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('mastered', true);

        setReviewStats({
          due: dueData?.length || 0,
          queue: queueData?.length || 0,
          mastered: masteredData?.length || 0
        });
      } catch (e) { /* ignore */ }
    })();
  }, [user]);

  const categoryName = {
    all: '全部考试类型',
    national: '2026年国家公务员考试（国考）',
    provincial: '2026年省公务员统考（省考）',
    // 事业编（事考）：题库暂无数据、入口已隐藏；保留映射供数据源接入后（PUBLIC_INSTITUTION_ENABLED = true）直接启用
    public_institution: '2026年事业单位联考（事业编）'
  }[selectedCategory];

  const moduleStats = new Map(activityStats.moduleStats.map(item => [item.module, item]));
  const weakestModule = activityStats.moduleStats
    .filter(item => item.answered > 0)
    .sort((a, b) => a.accuracy - b.accuracy)[0] || null;

  // 7 个维度全部来自真实记录；无数据时显式显示“暂无数据”，不再给演示百分比
  const radarDimensions = [
    ...OBJECTIVE_MODULES.map((item, index) => {
      const stat = moduleStats.get(item.module);
      const answered = stat?.answered || 0;
      const value = stat?.accuracy || 0;
      return {
        id: index + 1,
        label: item.radarLabel,
        value,
        color: value >= 60 ? 'bg-emerald-500' : answered > 0 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700',
        available: answered > 0,
        note: answered > 0 ? `${answered} 题` : '暂无数据',
      };
    }),
    {
      id: 6,
      label: '申论大作文思维',
      value: 0,
      color: 'bg-slate-200 dark:bg-slate-700',
      available: false,
      note: activityStats.mindsetDays > 0 ? `晨练 ${activityStats.mindsetDays} 天` : '暂无数据',
    },
    {
      id: 7,
      label: '面试对练从容度',
      value: activityStats.interviewScore,
      color: activityStats.interviewScore >= 60 ? 'bg-emerald-500' : activityStats.interviewSessions > 0 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700',
      available: activityStats.interviewSessions > 0,
      note: activityStats.interviewSessions > 0 ? `${activityStats.interviewSessions} 场` : '暂无数据',
    },
  ];

  const reviewTotal = reviewStats.mastered + reviewStats.queue;
  const masteredPct = reviewTotal > 0 ? Math.round((reviewStats.mastered / reviewTotal) * 100) : 0;
  const duePct = reviewTotal > 0 ? Math.round((reviewStats.due / reviewTotal) * 100) : 0;
  const consolidatingPct = reviewTotal > 0 ? Math.max(0, 100 - masteredPct - duePct) : 0;
  const consolidatingCount = Math.max(0, reviewStats.queue - reviewStats.due);
  const weakestRate = weakestModule ? 100 - weakestModule.accuracy : 0;

  // 近 7 日答题趋势完全取自真实活动账本 / answer_records
  const trendMax = Math.max(1, ...activityStats.trend.map(point => point.count));
  const weekAnswered = activityStats.trend.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome Banner Quote */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>当前备考靶向：{categoryName}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            按部就班就是伟大 · 备战不焦虑
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            行测是速度与规范的较量，申论与面试是思维格局的重塑。每天坚持两道题磨砺思维，战线拉长，水滴石穿。
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">累计研习 {activityStats.totalAnswered} 题</span>
            <span>{formatStreakDays(activityStats.streakDays)}</span>
            <span>
              {activityStats.objectiveCount > 0
                ? `客观题正确率 ${activityStats.accuracy}%`
                : '完成首题后生成正确率'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
          {user && reviewStats.due > 0 && (
            <button
              onClick={onStartReview}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-800 hover:to-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all cursor-pointer w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>今日待复习 {reviewStats.due} 题</span>
            </button>
          )}
          <button
            onClick={() => onNavigate('daily')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-xl text-xs sm:text-sm font-medium shadow-sm transition-all cursor-pointer w-full sm:w-auto"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>进入今日两题晨练</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Inspired by user reference UXBooster layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        
        {/* LEFT COLUMN: Overview Radar & Green Mindset Card (4 cols) */}
        <div className="lg:col-span-4 space-y-4 lg:space-y-6">
          {/* Radar Chart Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex items-center justify-between mb-2 sm:mb-4 gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">综合公职能力全景</h3>
              <span className="text-[11px] sm:text-xs text-slate-400 shrink-0">实时评估</span>
            </div>

            {/* SVG Radar Chart Visualization */}
            <div className="relative w-full aspect-square max-w-[210px] sm:max-w-[260px] mx-auto flex items-center justify-center my-2">
              <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                {/* Background Web Grid Rings */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((ring, idx) => (
                  <polygon
                    key={idx}
                    points={Array.from({ length: 7 }).map((_, i) => {
                      const angle = (Math.PI * 2 / 7) * i - Math.PI / 2;
                      const r = 80 * ring;
                      return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                    }).join(' ')}
                    fill="none"
                    className="stroke-slate-200 dark:stroke-slate-500"
                    strokeWidth="1"
                    strokeDasharray={idx < 4 ? "3 3" : "0"}
                  />
                ))}

                {/* Spokes */}
                {Array.from({ length: 7 }).map((_, i) => {
                  const angle = (Math.PI * 2 / 7) * i - Math.PI / 2;
                  return (
                    <line
                      key={i}
                      x1="100"
                      y1="100"
                      x2={100 + 80 * Math.cos(angle)}
                      y2={100 + 80 * Math.sin(angle)}
                      className="stroke-slate-200 dark:stroke-slate-500"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Data Polygon */}
                <polygon
                  points={radarDimensions.map((dim, i) => {
                    const angle = (Math.PI * 2 / 7) * i - Math.PI / 2;
                    const r = 80 * (dim.value / 100);
                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                  }).join(' ')}
                  className="fill-emerald-500/15 dark:fill-emerald-400/15 stroke-emerald-500 dark:stroke-emerald-400"
                  strokeWidth="2.5"
                />

                {/* Data Points */}
                {radarDimensions.map((dim, i) => {
                  const angle = (Math.PI * 2 / 7) * i - Math.PI / 2;
                  const r = 80 * (dim.value / 100);
                  const x = 100 + r * Math.cos(angle);
                  const y = 100 + r * Math.sin(angle);
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="3.5"
                      className="fill-emerald-500 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                      strokeWidth="1.5"
                    />
                  );
                })}

                {/* Axis Labels (Numbers 1-7) */}
                {Array.from({ length: 7 }).map((_, i) => {
                  const angle = (Math.PI * 2 / 7) * i - Math.PI / 2;
                  const x = 100 + 94 * Math.cos(angle);
                  const y = 100 + 94 * Math.sin(angle) + 4;
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      className="text-[10px] font-mono fill-slate-400 font-semibold"
                    >
                      {i + 1}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* List of 7 Dimensions with percentage bars */}
            <div className="space-y-1.5 sm:space-y-2 mt-3 sm:mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              {radarDimensions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 w-3 shrink-0">{item.id}</span>
                      <span className="text-slate-700 dark:text-slate-200 truncate">{item.label}</span>
                    </div>
                    <div className="pl-5 text-[10px] text-slate-400">{item.note}</div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                    <div className="w-12 sm:w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${item.available ? item.value : 0}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200 w-10 text-right">
                      {item.available ? `${item.value}%` : '暂无'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 错题复习进度卡片 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Brain className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                错题复习进度
              </h3>
              <span className="text-xs text-slate-400">艾宾浩斯曲线</span>
            </div>

            {!user ? (
              <p className="text-xs text-slate-400">登录后查看复习统计</p>
            ) : (
              <div className="space-y-4">
                {/* 进度环 */}
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-slate-200 dark:stroke-slate-600" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none" className="stroke-emerald-500 dark:stroke-emerald-400" strokeWidth="3"
                        strokeDasharray={`${((reviewStats.mastered || 0) / Math.max(1, (reviewStats.mastered || 0) + (reviewStats.queue || 0))) * 97.4} 97.4`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900 dark:text-slate-100">
                      {Math.round(((reviewStats.mastered || 0) / Math.max(1, (reviewStats.mastered || 0) + (reviewStats.queue || 0))) * 100)}%
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    <div><span className="text-slate-400">复习完成率</span></div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">已掌握 {(reviewStats.mastered || 0)} 题</div>
                  </div>
                </div>

                {/* 三指标 */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-center">
                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{reviewStats.mastered || 0}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">已掌握</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-slate-500 dark:text-slate-400">{reviewStats.queue || 0}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">队列中</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-rose-600 dark:text-rose-400">{reviewStats.due || 0}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">今日待复习</div>
                  </div>
                </div>

                {reviewStats.due > 0 && (
                  <button
                    onClick={onStartReview}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    立即复习 {reviewStats.due} 题
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Green Mindset Affirmation Card (matching screenshot Upgrade block) */}
          <div className="bg-emerald-600 rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden shadow-sm">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-emerald-500/30 blur-xl pointer-events-none" />
            <h4 className="text-base sm:text-lg font-bold tracking-tight mb-1">
              按部就班就是伟大
            </h4>
            <p className="text-xs text-emerald-100/90 leading-relaxed mb-4">
              PK对战不显示对手分数，彻底摒弃焦虑。每天沉淀两道题，把思考内化为本能，上岸只是水到渠成的结果。
            </p>
            <button
              onClick={() => onNavigate('interview')}
              className="px-4 py-2 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              开启沉浸面试对练
            </button>
          </div>
        </div>

        {/* MIDDLE COLUMN: Recent Focus & AI Reports (5 cols) */}
        <div className="lg:col-span-5 space-y-4 lg:space-y-6">
          {/* Main Focus Card (Matching Screenshot "Recent project") */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">今日研习核心焦点</h3>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <button
                  onClick={() => setActiveViewMode('standard')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeViewMode === 'standard' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs' : 'hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  核心视图
                </button>
                <button
                  onClick={() => setActiveViewMode('mindmap')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeViewMode === 'mindmap' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs' : 'hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  思维导图
                </button>
              </div>
            </div>

            {/* Visual Banner container */}
            <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 aspect-16/9 group">
              <img
                src="/src/assets/images/hangan_hero_banner_1790412435905.jpg"
                alt="必得题库研习厅"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex flex-col justify-end p-4 text-white">
                <span className="text-[11px] font-semibold text-emerald-300">
                  今日思维晨练精选
                </span>
                <h4 className="text-sm sm:text-base font-bold mt-0.5 line-clamp-1">
                  基层减负的辩证法：做减法更要做服务加法
                </h4>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20 text-xs">
                  <span className="text-slate-200">申论立论 · 面试结构化贯通</span>
                  <button
                    onClick={() => onNavigate('daily')}
                    className="px-3 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    立即精研
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Mindset takeaways */}
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>备考黄金理念：战线拉长，内化思维</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                面试不敢开口、申论下笔空洞，根源是平时缺少公职视角的素材沉淀。每天两道题，从现在开始积累官样语言与破题逻辑。
              </p>
            </div>
          </div>

          {/* AI Reports (Matching Screenshot 3 circular indicator cards) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">AI 备考深度评估</h3>
              <span className="text-xs text-slate-400">实时算法诊断</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                onClick={() => onNavigate('practice')}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/40 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">行测模块覆盖</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {activityStats.moduleCoverage}% · {activityStats.objectiveCount} 题
                </div>
              </button>

              <button
                onClick={() => onNavigate('daily')}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/40 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">思维脉络</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {activityStats.mindsetDays > 0 ? `晨练 ${activityStats.mindsetDays} 天` : '完成每日两题后点亮'}
                </div>
              </button>

              <button
                onClick={() => onNavigate('interview')}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/40 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">临场心力</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {activityStats.interviewSessions > 0
                    ? `${activityStats.interviewSessions} 场 · ${activityStats.interviewScore} 分`
                    : '完成一次开口练习后评估'}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Transfer Flow & Passing Rate (3 cols) */}
        <div className="lg:col-span-3 space-y-4 lg:space-y-6">
          {/* Transfer flow (Matching Screenshot top right card) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">综合正确率</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums my-1">
              {activityStats.objectiveCount > 0 ? `${activityStats.accuracy}%` : '—'}
            </div>
            <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
              activityStats.objectiveCount > 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {activityStats.objectiveCount > 0
                ? `已作答 ${activityStats.objectiveCount} 题 · 答对 ${activityStats.correctCount} 题`
                : '完成首题后生成'}
            </div>
          </div>

          {/* 近 7 日答题趋势（真实活动数据） */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">近 7 日答题趋势</span>
              <span className={`text-[11px] font-semibold ${activityStats.todayAnswered > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
                {activityStats.todayAnswered > 0 ? `今日 ${activityStats.todayAnswered} 题` : '今日未答题'}
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-1.5 h-24">
              {activityStats.trend.map((point, index) => {
                const isToday = index === activityStats.trend.length - 1;
                const heightPct = point.count > 0 ? Math.max(10, Math.round((point.count / trendMax) * 100)) : 0;
                return (
                  <div
                    key={point.date}
                    className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0"
                    title={`${point.date} ${point.label}：${point.count} 题`}
                  >
                    <span className={`text-[10px] font-mono tabular-nums ${point.count > 0 ? 'text-slate-600 dark:text-slate-300' : 'text-slate-300'}`}>
                      {point.count > 0 ? point.count : '·'}
                    </span>
                    <div className="w-full max-w-6 h-14 flex items-end">
                      <div
                        className={`w-full rounded-t-md transition-all ${point.count > 0 ? 'bg-emerald-500' : 'bg-slate-100 dark:bg-slate-800'}`}
                        style={{ height: point.count > 0 ? `${heightPct}%` : '4px' }}
                      />
                    </div>
                    <span className={`text-[10px] ${isToday ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
                      {isToday ? '今天' : point.label.replace('周', '')}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
              近 7 日累计 <span className="font-semibold text-slate-700 dark:text-slate-200">{weekAnswered}</span> 题 · 连续 <span className="font-semibold text-slate-700 dark:text-slate-200">{activityStats.streakDays}</span> 天
            </div>
          </div>

          {/* Attention Flow (Matching Screenshot middle card) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">短板模块失分率</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums my-1">
              {weakestModule ? `${weakestRate}%` : '—'}
            </div>
            <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
              weakestModule ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {weakestModule ? `ATTENTION! · ${weakestModule.name}` : 'ATTENTION! · 暂无数据'}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {weakestModule
                ? `${weakestModule.name}已答 ${weakestModule.answered} 题、答对 ${weakestModule.correct} 题，建议优先回看该模块错题。`
                : '完成一次专项练习后，将按模块正确率自动定位短板。'}
            </p>
          </div>

          {/* Add custom study plan dashed box (Matching Screenshot dashed card) */}
          <button
            onClick={() => onNavigate('practice')}
            className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer group"
          >
            <Plus className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">自选真题卷与专项刷题</span>
          </button>

          {/* Passing Rate Breakdown (Matching Screenshot bottom card) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">错题掌握深度</span>
              <span className="text-[11px] text-slate-400">总计 {reviewTotal} 道错题</span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-center mb-3">
              <div>
                <span className="text-[10px] text-slate-400 block">已掌握</span>
                <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                  {masteredPct}%
                </span>
                <span className="block text-[10px] text-slate-400">{reviewStats.mastered} 题</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">今日待复习</span>
                <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                  {duePct}%
                </span>
                <span className="block text-[10px] text-slate-400">{reviewStats.due} 题</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">巩固中</span>
                <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                  {consolidatingPct}%
                </span>
                <span className="block text-[10px] text-slate-400">{consolidatingCount} 题</span>
              </div>
            </div>

            {/* Tri-color progress bar */}
            <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
              <div className="bg-emerald-500 h-full" style={{ width: `${masteredPct}%` }} title={`已掌握 ${masteredPct}%`} />
              <div className="bg-emerald-400 dark:bg-emerald-700 h-full" style={{ width: `${consolidatingPct}%` }} title={`巩固中 ${consolidatingPct}%`} />
              <div className="bg-rose-500 h-full" style={{ width: `${duePct}%` }} title={`今日待复习 ${duePct}%`} />
            </div>

            {/* Quick Action links */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
              <button
                onClick={() => onNavigate('plan')}
                className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 font-medium text-center transition-colors cursor-pointer"
              >
                📋 生成每日计划
              </button>
              <button
                onClick={() => onNavigate('growth')}
                className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 font-medium text-center transition-colors cursor-pointer"
              >
                🏅 查看沉淀勋章
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
