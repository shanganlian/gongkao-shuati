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

type TargetCategory = ExamCategory | 'all';

interface AnalyticsOverviewProps {
  onNavigate: (tab: string) => void;
  selectedCategory: TargetCategory;
  streakDays: number;
  onStartReview: () => void;
}

export const AnalyticsOverview: React.FC<AnalyticsOverviewProps> = ({
  onNavigate,
  selectedCategory,
  streakDays,
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
    public_institution: '2026年事业单位联考（事业编）'
  }[selectedCategory];

  // 7 Dimensions matching user screenshot radar chart
  const radarDimensions = [
    { id: 1, label: '政治站位与常识', value: 78, color: 'bg-emerald-500' },
    { id: 2, label: '言语理解与逻辑', value: 74, color: 'bg-emerald-500' },
    { id: 3, label: '数量关系与速解', value: 52, color: 'bg-amber-500' },
    { id: 4, label: '判断推理严谨度', value: 82, color: 'bg-emerald-500' },
    { id: 5, label: '资料分析准确率', value: 88, color: 'bg-emerald-500' },
    { id: 6, label: '申论大作文思维', value: 76, color: 'bg-emerald-500' },
    { id: 7, label: '面试对练从容度', value: 81, color: 'bg-emerald-500' }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner Quote */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>当前备考靶向：{categoryName}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            按部就班就是伟大 · 备战不焦虑
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            行测是速度与规范的较量，申论与面试是思维格局的重塑。每天坚持两道题磨砺思维，战线拉长，水滴石穿。
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {user && reviewStats.due > 0 && (
            <button
              onClick={onStartReview}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>今日待复习 {reviewStats.due} 题</span>
            </button>
          )}
          <button
            onClick={() => onNavigate('daily')}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-medium shadow-sm transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>进入今日两题晨练</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Inspired by user reference UXBooster layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Overview Radar & Green Mindset Card (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Radar Chart Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">综合公职能力全景</h3>
              <span className="text-xs text-slate-400">实时评估</span>
            </div>

            {/* SVG Radar Chart Visualization */}
            <div className="relative w-full aspect-square max-w-[260px] mx-auto flex items-center justify-center my-2">
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
                    stroke="#E2E8F0"
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
                      stroke="#E2E8F0"
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
                  fill="rgba(16, 185, 129, 0.15)"
                  stroke="#10B981"
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
                      fill="#10B981"
                      stroke="#FFFFFF"
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
            <div className="space-y-2 mt-4 pt-3 border-t border-slate-100">
              {radarDimensions.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 w-3">{item.id}</span>
                    <span className="text-slate-700">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-slate-800 w-8 text-right">
                      {item.value}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 错题复习进度卡片 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Brain className="w-4 h-4 text-emerald-600" />
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
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none" stroke="#10B981" strokeWidth="3"
                        strokeDasharray={`${((reviewStats.mastered || 0) / Math.max(1, (reviewStats.mastered || 0) + (reviewStats.queue || 0))) * 97.4} 97.4`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">
                      {Math.round(((reviewStats.mastered || 0) / Math.max(1, (reviewStats.mastered || 0) + (reviewStats.queue || 0))) * 100)}%
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 leading-relaxed">
                    <div><span className="text-slate-400">复习完成率</span></div>
                    <div className="font-bold text-slate-900">已掌握 {(reviewStats.mastered || 0)} 题</div>
                  </div>
                </div>

                {/* 三指标 */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <div className="text-lg font-black text-emerald-600">{reviewStats.mastered || 0}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">已掌握</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-amber-600">{reviewStats.queue || 0}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">队列中</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-rose-600">{reviewStats.due || 0}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">今日待复习</div>
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
          <div className="bg-emerald-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-sm">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-emerald-500/30 blur-xl pointer-events-none" />
            <h4 className="text-lg font-bold tracking-tight mb-1">
              按部就班就是伟大
            </h4>
            <p className="text-xs text-emerald-100/90 leading-relaxed mb-4">
              PK对战不显示对手分数，彻底摒弃焦虑。每天沉淀两道题，把思考内化为本能，上岸只是水到渠成的结果。
            </p>
            <button
              onClick={() => onNavigate('interview')}
              className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              开启沉浸面试对练
            </button>
          </div>
        </div>

        {/* MIDDLE COLUMN: Recent Focus & AI Reports (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Main Focus Card (Matching Screenshot "Recent project") */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">今日研习核心焦点</h3>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-medium text-slate-600">
                <button
                  onClick={() => setActiveViewMode('standard')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeViewMode === 'standard' ? 'bg-slate-900 text-white shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  核心视图
                </button>
                <button
                  onClick={() => setActiveViewMode('mindmap')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeViewMode === 'mindmap' ? 'bg-slate-900 text-white shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  思维导图
                </button>
              </div>
            </div>

            {/* Visual Banner container */}
            <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200/60 aspect-16/9 group">
              <img
                src="/src/assets/images/hangan_hero_banner_1790412435905.jpg"
                alt="行岸公考研习厅"
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
                    className="px-3 py-1 bg-white text-slate-900 rounded-md font-semibold text-xs hover:bg-slate-100 transition-colors"
                  >
                    立即精研
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Mindset takeaways */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>备考黄金理念：战线拉长，内化思维</span>
              </div>
              <p className="text-slate-500 leading-relaxed text-[11px]">
                面试不敢开口、申论下笔空洞，根源是平时缺少公职视角的素材沉淀。每天两道题，从现在开始积累官样语言与破题逻辑。
              </p>
            </div>
          </div>

          {/* AI Reports (Matching Screenshot 3 circular indicator cards) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">AI 备考深度评估</h3>
              <span className="text-xs text-slate-400">实时算法诊断</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => onNavigate('practice')}
                className="p-3 rounded-xl border border-slate-200/80 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800">对标考纲</div>
                <div className="text-[11px] text-slate-400 mt-0.5">覆盖率 91%</div>
              </button>

              <button
                onClick={() => onNavigate('daily')}
                className="p-3 rounded-xl border border-slate-200/80 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800">思维脉络</div>
                <div className="text-[11px] text-slate-400 mt-0.5">破题链完整</div>
              </button>

              <button
                onClick={() => onNavigate('interview')}
                className="p-3 rounded-xl border border-slate-200/80 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-center group cursor-pointer"
              >
                <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500 flex items-center justify-center mb-2 text-emerald-600 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800">临场心力</div>
                <div className="text-[11px] text-slate-400 mt-0.5">抗压稳健</div>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Transfer Flow & Passing Rate (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Transfer flow (Matching Screenshot top right card) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-xs font-medium text-slate-500">综合正答流速</span>
            <div className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums my-1">
              87%
            </div>
            <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              GOOD · 稳步上升
            </div>
          </div>

          {/* Attention Flow (Matching Screenshot middle card) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-xs font-medium text-slate-500">短板考点阻滞率</span>
            <div className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums my-1">
              52%
            </div>
            <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
              ATTENTION! · 数量工程问题
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              建议使用赋值法速解，无需死算方程。
            </p>
          </div>

          {/* Add custom study plan dashed box (Matching Screenshot dashed card) */}
          <button
            onClick={() => onNavigate('practice')}
            className="w-full py-4 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer group"
          >
            <Plus className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold">自选真题卷与专项刷题</span>
          </button>

          {/* Passing Rate Breakdown (Matching Screenshot bottom card) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900">考点掌握深度</span>
              <span className="text-[11px] text-slate-400">总计 420 考点</span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-center mb-3">
              <div>
                <span className="text-[10px] text-slate-400 block">完全掌握</span>
                <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  61%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">待攻克</span>
                <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  17%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">巩固中</span>
                <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  22%
                </span>
              </div>
            </div>

            {/* Tri-color progress bar */}
            <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-100">
              <div className="bg-emerald-500 h-full" style={{ width: '61%' }} title="完全掌握 61%" />
              <div className="bg-amber-500 h-full" style={{ width: '22%' }} title="巩固中 22%" />
              <div className="bg-rose-500 h-full" style={{ width: '17%' }} title="待攻克 17%" />
            </div>

            {/* Quick Action links */}
            <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onNavigate('plan')}
                className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-700 font-medium text-center transition-colors cursor-pointer"
              >
                📋 生成每日计划
              </button>
              <button
                onClick={() => onNavigate('growth')}
                className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-700 font-medium text-center transition-colors cursor-pointer"
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
