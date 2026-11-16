import React, { useLayoutEffect, useRef, useState } from 'react';
import { 
  Compass, 
  BookOpen, 
  Sparkles, 
  Mic, 
  Users, 
  BarChart3, 
  CheckCircle2, 
  Award,
  Calendar,
  ChevronDown,
  Info,
  X,
  Target,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  ShieldCheck,
  Flame,
  Menu,
  ArrowRight
} from 'lucide-react';
import { ExamCategory } from '../types';
// 事业编（事考）入口开关：题库暂无事业编数据时保持 false，只显示国考 / 省考
import { PUBLIC_INSTITUTION_ENABLED, COMMUNITY_ENABLED } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { useAuthUI } from '../context/AuthUIContext';
import { User, LogOut } from 'lucide-react';
import { streakBadgeDays } from '../lib/activityStats';
import { ThemeToggle } from './ThemeToggle';

type TargetCategory = ExamCategory | 'all';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedCategory: TargetCategory;
  setSelectedCategory: (category: TargetCategory) => void;
  streakDays: number;
  level: number;
  levelTitle: string;
  onOpenCheckIn: () => void;
  /** 点「板块 2」统一进入知识点体系页，并回到默认子视图（知识图谱），不再有独立的知识卡入口 */
  onOpenKnowledgeHub?: () => void;
  /** 手机端学情总览折叠状态（≤768px 生效，≥769px 始终展开；开关位于汉堡菜单） */
  overviewPanelExpanded?: boolean;
  onToggleOverviewPanel?: () => void;
  /** 点击「学情总览」Tab 时强制展开，确保手动收起后再选 Tab 仍能看到雷达图 */
  onExpandOverviewPanel?: () => void;
}

interface MobileCollapsePanelProps {
  id: string;
  open: boolean;
  className?: string;
  innerClassName?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

/**
 * 手机端卷帘面板：
 * - 面板本身始终 absolute，不参与文档流，展开/收起不会让 header、main 或页面滚动位置发生位移；
 * - 用 ResizeObserver 实测内容高度，再让 max-height 在 0 与真实高度之间过渡，
 *   避免 grid-template-rows 在部分移动端 WebView 中不生效导致的“瞬间弹开”；
 * - 内容层额外做一次轻微上滑 + 淡入，收起时反向播放，观感更接近手风琴。
 */
const MobileCollapsePanel: React.FC<MobileCollapsePanelProps> = ({
  id,
  open,
  className = '',
  innerClassName = '',
  ariaLabel,
  children
}) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => {
      const next = Math.ceil(inner.scrollHeight);
      setContentHeight((prev) => (prev === next ? prev : next));
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(inner);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  const panelStyle = {
    '--app-collapse-h': `${contentHeight}px`
  } as React.CSSProperties;

  return (
    <div
      id={id}
      role={ariaLabel ? 'navigation' : undefined}
      aria-label={ariaLabel}
      data-state={open ? 'open' : 'closed'}
      style={panelStyle}
      className={`app-header__collapse-panel ${open ? 'is-open' : ''} ${className}`}
    >
      <div ref={innerRef} className={`app-header__collapse-panel-inner ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  selectedCategory,
  setSelectedCategory,
  streakDays,
  level,
  levelTitle,
  onOpenCheckIn,
  onOpenKnowledgeHub,
  overviewPanelExpanded = true,
  onToggleOverviewPanel,
  onExpandOverviewPanel
}) => {
  const [showModuleGuide, setShowModuleGuide] = useState<boolean>(false);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  // ≤1024px 折叠条：备考模块 pills 与笔试专区三大核心板块合并进同一个 32px 面板，默认收起
  const [showCompactNav, setShowCompactNav] = useState<boolean>(false);
  const { user, signOut } = useAuth();
  const { openAuth } = useAuthUI();
  const isWrittenTab = ['practice', 'knowledge', 'daily'].includes(activeTab);

  // 主模块切换：保留原选中逻辑；进入「学情总览」时顺带展开内容
  const handleSelectMainNav = (tabId: string) => {
    setActiveTab(tabId);
    setShowMobileMenu(false);
    setShowCompactNav(false);
    if (tabId === 'overview') onExpandOverviewPanel?.();
  };

  const toggleCompactNav = () => {
    setShowCompactNav((prev) => !prev);
  };

  // 选择核心板块后收起悬浮面板，桌面端不受影响（桌面始终常显）
  const handleSelectWrittenSection = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === 'knowledge') onOpenKnowledgeHub?.();
    setShowCompactNav(false);
  };

  // 窄屏汉堡菜单与模块导览互斥，避免两个面板同时展开
  const toggleMobileMenu = () => {
    setShowMobileMenu((prev) => !prev);
    setShowModuleGuide(false);
  };

  // 5 Primary Navigation Sections（备考社区按 COMMUNITY_ENABLED 条件展开，关闭时 5 卡）
  const mainNavItems = [
    { 
      id: 'practice', 
      label: '笔试专区', 
      desc: '刷题/真题/秘籍语音/晨练',
      icon: BookOpen, 
      tag: '三大支柱',
      keyFeatures: ['题库与全真卷', '考点秘籍随身听', '申论每日晨练']
    },
    { 
      id: 'interview', 
      label: '面试专区', 
      desc: '百题结构化/开口/逐点复盘',
      icon: Mic, 
      tag: '严肃实战',
      keyFeatures: ['100题结构化真题', '语音或打字作答', 'AI评分与逐点复盘']
    },
    { 
      id: 'plan', 
      label: '定制计划', 
      desc: '按个人情况AI定制清单',
      icon: Calendar, 
      tag: '动态排期',
      keyFeatures: ['在职/全职作息', '薄弱考点突破', '每日任务清单（勾选即打卡）']
    },
    { 
      id: 'overview', 
      label: '学情总览', 
      desc: '7维能力雷达与深度诊断',
      icon: BarChart3,
      tag: '数据分析',
      keyFeatures: ['7维能力全景雷达', '做题流速监控', '弱项阻滞率分析']
    },
    { 
      id: 'growth', 
      label: '全局成长', 
      desc: `位阶晋级 · Lv.${level} ${levelTitle}`,
      icon: Award, 
      tag: '勋章暗线',
      keyFeatures: ['行政位阶晋级', '青玉/金纹勋章墙', '不显高分拒绝焦虑']
    },
    // 备考社区：COMMUNITY_ENABLED=false 时整块下线（代码保留，改 flag 即恢复）
    ...(COMMUNITY_ENABLED ? [{
      id: 'community',
      label: '备考社区',
      desc: '28天坚持轨迹与互勉',
      icon: Users,
      tag: '同舟共济',
      keyFeatures: ['备考轨迹热力图', '每日心得体会', '互勉花束打卡']
    }] : [])
  ];

  // 笔试专区三大核心板块：桌面绿色子导航与 ≤1024px 折叠面板共用同一份配置
  const writtenSections = [
    {
      id: 'practice',
      label: '板块 1：题库刷题与全真试卷',
      fullLabel: '板块 1：题库刷题与全真试卷 (专项/真题/错题本)',
      icon: FileText
    },
    {
      id: 'knowledge',
      label: '板块 2：通关秘籍与语音听学',
      fullLabel: '板块 2：知识点体系 · 通关秘籍与语音随身听',
      icon: Headphones
    },
    {
      id: 'daily',
      label: '板块 3：申论每日两题晨练',
      fullLabel: '板块 3：申论初试 · 每日思维两题晨练',
      icon: Sparkles
    }
  ];

  // 面试专区训练流程：桌面绿色子导航与 ≤1024px 折叠面板共用同一份配置
  const interviewFlowChips = [
    { text: '📚 100题结构化真题库', emphasis: false },
    { text: '🎙️ 语音/打字双模式作答', emphasis: false },
    { text: '📊 AI采分点逐条核对', emphasis: false },
    { text: '📁 本机练习记录复盘', emphasis: false },
    { text: '🛡️ 拒绝焦虑：不显对手高分', emphasis: true }
  ];

  // Detailed definitions of each module for users
  const moduleDefinitions = [
    {
      badge: '笔试专区 (三大支柱)',
      icon: BookOpen,
      title: '笔试专区：基础夯实与思维长线沉淀',
      color: 'bg-brand-ink text-white',
      parts: [
        { name: '1. 刷题与真题卷', text: '国考/省考历年全真试卷与五大专项题库（常识、言语、数量、判断、资料），支持错题归纳与专项攻坚。' },
        { name: '2. 知识点体系与秘籍语音', text: '考点思维导图与速算口诀，搭配专业语音朗读功能，随时利用碎片化通勤时间闭眼“磨耳朵”。' },
        { name: '3. 申论与初试每日两题晨练', text: '战线拉长，每天清晨练两题（申论宏观站位+行测严密因果辨析），从早培养成年人公职思考习惯。' }
      ]
    },
    {
      badge: '面试专区 (结构化实战)',
      icon: Mic,
      title: '面试专区：百题结构化题库 · 开口作答 · 逐点复盘',
      color: 'bg-brand-ink text-white',
      parts: [
        { name: '1. 100题结构化真题库', text: '覆盖综合分析、应急处突、基层治理、人际沟通等常考题型，按分类与难度检索，也可一键随机抽题。' },
        { name: '2. 语音或打字双模式作答', text: '支持语音实时转写与打字输入，思考时间、作答倒计时与作答字数按题设定，先把观点完整说出口。' },
        { name: '3. AI采分点逐条核对', text: '对照本题采分点逐条判断是否命中，给出表达指标、致命遗漏与改进建议，拒绝万能套话。' },
        { name: '4. 本机练习记录复盘', text: '作答报告自动留存在本机，可按题目与得分回看历史作答，围绕同一道题反复打磨表达。' }
      ]
    },
    {
      badge: '定制计划 (专属日程)',
      icon: Calendar,
      title: '定制计划：个性化AI智能每日备考清单',
      color: 'bg-brand-ink text-white',
      parts: [
        { name: '1. 个人情况精准输入', text: '根据在职/全职状态、每天可用小时、申论动笔难或面试不敢开口等痛点量身打造。' },
        { name: '2. 科学作息时间块', text: '早晨晨练两题、碎片听学磨耳朵、晚间笔试专项、睡前开口自录，每日按部就班打勾执行。' },
        { name: '3. 长期培养哲学', text: '拒绝贩卖焦虑，坚信“按部就班就是伟大，日拱一卒，功不唐捐”。' }
      ]
    },
    {
      badge: '学情总览 (数据中枢)',
      icon: BarChart3,
      title: '学情总览：全维公职能力雷达与深度诊断',
      color: 'bg-brand-ink text-white',
      parts: [
        { name: '1. 7维公职能力全景雷达', text: '政治常识、言语逻辑、数量速算、推理判断、资料分析、申论思维、面试临场深度可视化。' },
        { name: '2. 刷题正答流速与弱点阻滞', text: '实时统计解题速度与薄弱考点阻滞率，精准定位失分黑洞。' },
        { name: '3. 近期研习AI诊断报告', text: '输出针对个人备考短板的提分策略，直观反映各阶段知识掌握深度。' }
      ]
    },
    {
      badge: '全局成长 (严肃暗线)',
      icon: Award,
      title: '全局成长：严肃行政位阶与沉淀勋章墙',
      color: 'bg-brand-ink text-brand-gold-soft ring-1 ring-brand-gold/60',
      parts: [
        { name: '1. 庄严位阶暗线阶梯', text: '从研习行者、笃行书办、基层实干主事到登岸正印先锋，沉稳庄重大气，视觉非卡通化。' },
        { name: '2. 纯粹实干勋章库', text: '青玉、金纹、朱漆实务勋章，记录长线思考、按部就班、破局沉着每一次突破。' },
        { name: '3. 防焦虑设计原则', text: '系统绝不展示他人高分，不让高分打击信心，见自己之精进，保持自我的成长节律。' }
      ]
    },
    // 备考社区：COMMUNITY_ENABLED=false 时整块下线（代码保留，改 flag 即恢复）
    ...(COMMUNITY_ENABLED ? [{
      badge: '备考社区 (同行互勉)',
      icon: Users,
      title: '备考社区：28天坚持轨迹与同舟共济',
      color: 'bg-brand-ink text-white',
      parts: [
        { name: '1. 坚持轨迹打卡热力图', text: '记录每天刷题、听学与开口演练的坚持点滴，形成看得见的努力印记。' },
        { name: '2. 每日两题心得分享流', text: '考友交流真实思考体会，互赠“按部就班”花束，构建阳光互勉环境。' }
      ]
    }] : [])
  ];

  // Active module description mapping
  const getActiveModuleSummary = () => {
    if (activeTab === 'practice' || activeTab === 'knowledge' || activeTab === 'daily') {
      return {
        tag: '✍️ 当前模块：【笔试专区】',
        title: '三大核心板块：① 刷题与真题卷 ② 知识点秘籍与语音听学 ③ 申论每日晨练',
        hint: '战线拉长，把公职常识与大作文五段三分法融入日常，按部就班就是伟大。'
      };
    }
    if (activeTab === 'interview') {
      return {
        tag: '🎙️ 当前模块：【面试专区】',
        title: '100题结构化面试题库 · 语音/打字作答 · AI逐点点评 · 练习记录复盘',
        hint: '考官考的从来不是套话，而是“体察民情、解决复杂问题、从容担当”；先完整开口，再逐点打磨。'
      };
    }
    if (activeTab === 'plan') {
      return {
        tag: '📋 当前模块：【定制计划】',
        title: 'AI智能专属备考排期：根据在职/全职状态及可用时间定制每日清单',
        hint: '将初试积累与面试开口细化为每日小任务，稳扎稳打，告别无序备考。'
      };
    }
    if (activeTab === 'growth') {
      return {
        tag: '🎖️ 当前模块：【全局成长】',
        title: `严肃行政位阶暗线系统（Lv.${level} ${levelTitle}）与公职素养勋章墙`,
        hint: '不攀比他人高分，专注自身思维精进，见己之成长，笃定前行。'
      };
    }
    if (activeTab === 'community') {
      return {
        tag: '🤝 当前模块：【备考社区】',
        title: '28天坚持轨迹打卡与同舟共济心得动态',
        hint: '记录备考点滴，互勉同行，在温暖包容的环境中保持积极备战状态。'
      };
    }
    return {
      tag: '📊 当前模块：【学情总览】',
      title: '7维公职能力全景雷达 · 刷题正答流速 · 薄弱考点阻滞率AI诊断',
      hint: '全面审视宏观站位、言语逻辑、计算推理等各维度掌握深度，精准补强。'
    };
  };

  const currentSummary = getActiveModuleSummary();

  return (
    <header className="app-header sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-brand-line transition-colors">
      {/* 手机/平板横向留白收紧，lg 起恢复桌面 32px */}
      <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8">
        
        {/* ROW 1: Brand Wordmark, Exam Selector & Quick Actions */}
        <div className="app-header__row app-header__row--main flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          
          {/* Brand Logo：窄屏单行化，logo + 名称禁止换行；徽标降级为 PRO */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              onClick={() => { setActiveTab('overview'); setShowMobileMenu(false); }}
              className="flex items-center gap-1.5 sm:gap-2.5 text-left cursor-pointer group focus:outline-none min-w-0"
              title="点击返回学情总览"
            >
              {/* 尺寸/字号由 .app-header__logo 按断点控制，桌面仍为 36px / 18px */}
              <div className="app-header__logo shrink-0 rounded-xl bg-slate-900 dark:bg-slate-700 group-hover:bg-emerald-600 flex items-center justify-center text-white font-black shadow-sm transition-colors">
                必
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="app-header__brand-name font-black tracking-tight text-slate-900 dark:text-slate-100 font-sans whitespace-nowrap">
                    必得题库
                  </span>
                  <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 dark:bg-slate-700 text-white font-bold tracking-wide whitespace-nowrap">
                    官方专业版
                  </span>
                  <span className="sm:hidden text-[9px] px-1.5 py-0.5 rounded-full bg-slate-900 dark:bg-slate-700 text-white font-bold tracking-wider whitespace-nowrap">
                    PRO
                  </span>
                </div>
                <p className="app-header__tagline text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5 hidden sm:block whitespace-nowrap">
                  I go, I get · 踏上征程，势在必得
                </p>
              </div>
            </button>

            {/* Target Exam Switcher：桌面常驻；窄屏收进汉堡菜单 */}
            <div className="hidden lg:flex items-center ml-2 pl-3 border-l border-slate-200 dark:border-slate-700 shrink-0">
              <span className="text-[11px] font-bold text-slate-400 mr-1.5 hidden xl:inline">当前目标:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TargetCategory)}
                className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition-colors"
              >
                <option value="all">🌐 全部考试</option>
                <option value="national">🎯 国家公务员考试 (国考)</option>
                <option value="provincial">🏛️ 省公务员联考 (省考)</option>
                {/* 事业编（事考）：题库暂无数据，入口隐藏；待数据源接入后 PUBLIC_INSTITUTION_ENABLED = true 即恢复 */}
                {PUBLIC_INSTITUTION_ENABLED && (
                  <option value="public_institution">📚 全国事业单位招聘 (事考)</option>
                )}
              </select>
            </div>
          </div>

          {/* Top Right Quick CTAs：lg 及以上常驻；窄屏收进汉堡菜单 */}
          <div className="app-header__actions hidden lg:flex items-center gap-2 shrink-0">
            {/* Explainer Button */}
            <button
              onClick={() => setShowModuleGuide(!showModuleGuide)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                showModuleGuide
                  ? 'bg-slate-900 dark:bg-slate-700 border-slate-900 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
              title={`查看${COMMUNITY_ENABLED ? '六' : '五'}大核心模块详细功能说明`}
            >
              <Info className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>全站模块功能透视</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModuleGuide ? 'rotate-180' : ''}`} />
            </button>

            {/* 外观主题开关：桌面端常显，位于「今日计划」左侧 */}
            <ThemeToggle variant="desktop" />

            {/* 今日计划 CTA：进入定制计划勾任务，勾选即打卡 */}
            <button
              onClick={onOpenCheckIn}
              title="进入定制计划，勾选今日任务即完成打卡"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>今日计划 ({streakBadgeDays(streakDays)}天)</span>
            </button>

            {/* 用户认证 */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="app-header__user-chip flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="app-header__user-email text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">{user.email}</span>
                </div>
                <button
                  onClick={signOut}
                  className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => openAuth('default')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>登录</span>
              </button>
            )}
          </div>

          {/* 窄屏汉堡按钮：lg 以下收起目标选择与功能入口 */}
          <button
            type="button"
            data-testid="mobile-menu-button"
            aria-label={showMobileMenu ? '收起功能菜单' : '展开功能菜单'}
            aria-expanded={showMobileMenu}
            aria-controls="mobile-header-menu"
            onClick={toggleMobileMenu}
            className="app-header__menu-btn lg:hidden shrink-0 flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer"
          >
            {showMobileMenu ? <X /> : <Menu />}
          </button>
        </div>

        {/* 窄屏功能菜单：当前目标下拉 + 右侧功能入口 */}
        {showMobileMenu && (
          <div
            id="mobile-header-menu"
            className="app-header__mobile-menu lg:hidden border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 pt-1.5 pb-2.5 space-y-1.5 sm:pt-2 sm:pb-3 sm:space-y-2 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {/* 当前模块摘要：≤1024px 从主页面迁移到这里，只在打开菜单时显示 */}
            <div
              data-testid="mobile-current-module"
              className="rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-2 dark:border-emerald-800/60 dark:bg-emerald-950/20"
            >
              <p className="text-[11px] sm:text-xs font-black text-emerald-950 dark:text-emerald-100">
                {currentSummary.tag}
              </p>
              <p className="mt-0.5 text-[10px] sm:text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {currentSummary.hint}
              </p>
              {activeTab === 'overview' && onToggleOverviewPanel && (
                <button
                  type="button"
                  data-testid="mobile-overview-toggle"
                  onClick={() => {
                    onToggleOverviewPanel();
                    setShowMobileMenu(false);
                  }}
                  aria-expanded={overviewPanelExpanded}
                  aria-controls="overview-module-panel"
                  title={overviewPanelExpanded ? '收起学情总览内容' : '展开学情总览内容'}
                  className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-white/70 px-2 py-1 text-[10px] font-bold text-emerald-800 transition-colors hover:bg-white dark:border-emerald-800/60 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-slate-900"
                >
                  <span>{overviewPanelExpanded ? '收起学情总览内容' : '展开学情总览内容'}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 transition-transform ${overviewPanelExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 sm:p-3">
              <label htmlFor="mobile-target-category" className="block text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 sm:mb-1.5">
                当前目标
              </label>
              <select
                id="mobile-target-category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TargetCategory)}
                className="w-full text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">🌐 全部考试</option>
                <option value="national">🎯 国家公务员考试 (国考)</option>
                <option value="provincial">🏛️ 省公务员联考 (省考)</option>
                {/* 事业编（事考）：题库暂无数据，入口隐藏；待数据源接入后 PUBLIC_INSTITUTION_ENABLED = true 即恢复 */}
                {PUBLIC_INSTITUTION_ENABLED && (
                  <option value="public_institution">📚 全国事业单位招聘 (事考)</option>
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => { setShowMobileMenu(false); setShowModuleGuide(true); }}
              className="w-full flex items-center justify-between px-3 py-2 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                全站模块功能透视
              </span>
              <ChevronDown className="w-4 h-4 -rotate-90 text-slate-400" />
            </button>

            {/* 外观主题开关：窄屏收进汉堡菜单（点击后自动收起菜单） */}
            <ThemeToggle variant="menu" onSelect={() => setShowMobileMenu(false)} />

            <button
              type="button"
              onClick={() => { setShowMobileMenu(false); onOpenCheckIn(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[11px] sm:text-xs font-bold rounded-xl cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              今日计划 ({streakBadgeDays(streakDays)}天)
            </button>

            {user ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer shrink-0"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); openAuth('default'); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 sm:py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-[11px] sm:text-xs font-bold rounded-xl cursor-pointer"
              >
                <User className="w-4 h-4" />
                登录 / 注册
              </button>
            )}
          </div>
        )}

        {/* ROW 2 (≤1024px 手机 / 平板): 合并为一条 32px 折叠条
            ① 备考模块切换 pills（横向滚动）
            ② 笔试专区三大核心板块（仅笔试专区显示）
            面板 absolute 悬浮、不占文档流，展开不会顶起页面 */}
        <div className="app-header__collapse-group app-header__collapse-group--main lg:hidden">
          <button
            type="button"
            onClick={toggleCompactNav}
            aria-expanded={showCompactNav}
            aria-controls="compact-nav-panel"
            title={showCompactNav ? '收起模块导航' : '展开模块导航'}
            className="app-header__collapse-title text-[12px] font-extrabold text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <span className="truncate">
              {isWrittenTab
                ? '📚 笔试专区 · 模块与核心板块'
                : activeTab === 'interview'
                  ? '🎤 面试专区 · 模块与训练流程'
                  : '📌 展开备考模块'}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`app-header__collapse-arrow ${showCompactNav ? 'is-open' : ''}`}
            />
          </button>

          <MobileCollapsePanel
            id="compact-nav-panel"
            open={showCompactNav}
            ariaLabel="手机与平板模块导航"
          >
            <div className="rounded-xl border border-slate-200/90 bg-white/95 p-2 shadow-xl space-y-2 dark:border-slate-700/80 dark:bg-slate-900/95">
              {/* ① 模块切换 pills：横向滚动，避免 5 个模块挤成等分小方块 */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {mainNavItems.map((item) => {
                  const isActive = (item.id === 'practice' && isWrittenTab) || activeTab === item.id;

                  return (
                    <button
                      key={`compact-${item.id}`}
                      type="button"
                      onClick={() => handleSelectMainNav(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* ② 笔试专区三大核心板块：与模块 pills 同一个面板，不再单独占一条固定栏 */}
              {isWrittenTab && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-2 pb-0.5">
                  {writtenSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeTab === section.id;

                    return (
                      <button
                        key={`compact-section-${section.id}`}
                        type="button"
                        onClick={() => handleSelectWrittenSection(section.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-brand-ink text-white shadow-xs ring-1 ring-brand-gold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ③ 面试专区训练流程：原来那条绿色子导航在 ≤1024px 收进本面板，省掉一整条固定栏 */}
              {activeTab === 'interview' && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-2 pb-0.5">
                  {interviewFlowChips.map((chip) => (
                    <span
                      key={`compact-interview-${chip.text}`}
                      className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs whitespace-nowrap ${
                        chip.emphasis
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold'
                      }`}
                    >
                      {chip.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </MobileCollapsePanel>
        </div>

        {/* ROW 3 (DESKTOP ≥1025px): PRIMARY HIGH-VISIBILITY NAVIGATION CARDS（保持原布局） */}
        <div className="app-header__nav hidden lg:block">
          <nav className="app-header__nav-grid flex gap-1.5 overflow-x-auto pb-0.5 sm:gap-2 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = (item.id === 'practice' && isWrittenTab) || activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectMainNav(item.id)}
                  className={`app-header__nav-card group relative text-left w-[7rem] sm:w-[9.5rem] lg:w-auto shrink-0 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'bg-slate-900 dark:bg-slate-700 border-slate-900 text-white shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-700/90 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs'
                  }`}
                >
                  {/* Top Bar: Icon + Title + Tag */}
                  <div className="flex items-center justify-between w-full gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`app-header__nav-icon rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isActive 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                      }`}>
                        <Icon />
                      </div>
                      <span className={`app-header__nav-label font-black tracking-tight whitespace-nowrap ${
                        isActive ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                      }`}>
                        {item.label}
                      </span>
                    </div>

                    <span className={`app-header__nav-tag hidden sm:inline-block px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                      isActive 
                        ? 'bg-emerald-400/20 dark:bg-emerald-700/20 text-emerald-300 border border-emerald-400/30 dark:border-emerald-600/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}>
                      {item.tag}
                    </span>
                  </div>

                  {/* Subtitle / Explanatory text */}
                  <p className={`app-header__nav-desc hidden sm:block mt-1.5 leading-snug line-clamp-1 font-medium ${
                    isActive ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {item.desc}
                  </p>

                  {/* Active Indicator Bar */}
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-3 right-3 h-0.5 bg-emerald-400 dark:bg-emerald-700 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* SECONDARY SUB-NAV (仅桌面 ≥1025px)：≤1024px 已并入顶部 32px 折叠条，不再单独占一条绿栏 */}
      {isWrittenTab && (
        <div className="app-header__subnav bg-brand-ink text-white border-t border-white/10 px-3 sm:px-4 hidden lg:block">
          <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 lg:flex-wrap lg:overflow-visible lg:pb-0">
              <span className="font-extrabold text-white flex items-center gap-1.5 mr-1 text-xs shrink-0 whitespace-nowrap">
                <BookOpen className="w-3.5 h-3.5 text-emerald-200" />
                笔试专区三大核心板块：
              </span>

              {writtenSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeTab === section.id;

                return (
                  <button
                    key={`subnav-${section.id}`}
                    onClick={() => handleSelectWrittenSection(section.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`app-header__subnav-item flex items-center gap-1.5 rounded-lg transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-brand-ink font-black shadow-xs ring-1 ring-brand-gold'
                        : 'bg-transparent text-emerald-50 ring-1 ring-brand-gold/60 hover:bg-brand-ink-soft hover:ring-brand-gold'
                    }`}
                  >
                    <Icon className={isActive ? 'text-brand-ink' : 'text-emerald-200'} />
                    <span>{section.fullLabel}</span>
                  </button>
                );
              })}
            </div>

            <span className="text-[11px] text-emerald-100/80 font-medium hidden xl:inline-block shrink-0">
              💡 战线拉长 · 每日浸润公职逻辑与行测解题模型
            </span>
          </div>
        </div>
      )}

      {/* SECONDARY SUB-NAV: When inside 面试专区（仅桌面 ≥1025px；≤1024px 已并入顶部 32px 折叠条） */}
      {activeTab === 'interview' && (
        <div className="app-header__subnav bg-brand-ink text-white border-t border-white/10 px-3 sm:px-4 hidden lg:block">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 lg:flex-wrap lg:overflow-visible lg:pb-0">
              <span className="font-extrabold text-white flex items-center gap-1.5 mr-1 text-[11px] sm:text-xs shrink-0 whitespace-nowrap">
                <Mic className="w-3.5 h-3.5 text-emerald-200" />
                面试训练流程：
              </span>
              {interviewFlowChips.map((chip) => (
                <span
                  key={`subnav-interview-${chip.text}`}
                  className={`px-2.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                    chip.emphasis
                      ? 'bg-brand-ink text-emerald-200 border-emerald-400/40 dark:border-emerald-600/40 font-bold'
                      : 'bg-brand-ink-soft text-emerald-50 border-white/15 font-medium'
                  }`}
                >
                  {chip.text}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-emerald-100/75 font-medium hidden lg:inline-block">
              ⚡ 早点开始开口模拟，消弭怯场，练成肌肉记忆！
            </span>
          </div>
        </div>
      )}

      {/* CURRENT ACTIVE MODULE CONTEXT BANNER
          ≤1024px 整行隐藏（当前模块摘要与学情总览折叠操作在右上角汉堡菜单里）；
          ≥1025px 继续显示完整说明，进一步压缩手机/平板的固定高度。 */}
      <div className="app-header__context hidden lg:block bg-slate-50 dark:bg-slate-800 border-t border-slate-200/80 dark:border-slate-700/80 px-3 sm:px-4 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-1">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 dark:text-slate-100">
              {currentSummary.tag}
            </span>
            <span className="text-slate-700 dark:text-slate-200 font-medium hidden sm:inline">
              — {currentSummary.title}
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-400 italic">
            {currentSummary.hint}
          </span>
        </div>
      </div>

      {/* EXPANDABLE MODULE GUIDE DRAWER (全站模块功能透视) */}
      {showModuleGuide && (
        <div className="bg-white dark:bg-slate-900 shadow-xl p-3 sm:p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center font-bold text-xs">
                  透
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                    必得题库 · 全站{COMMUNITY_ENABLED ? '六' : '五'}大核心模块架构与功能导览
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    一目了然看懂每个模块包含什么、解决什么备考痛点、如何协同使用
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModuleGuide(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Module Cards：社区关闭时 5 张，开启时 6 张 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {moduleDefinitions.map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <div 
                    key={i} 
                    className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" />
                        <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                          {mod.title}
                        </h4>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${mod.color}`}>
                        {mod.badge}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {mod.parts.map((p, idx) => (
                        <div key={idx} className="text-[11px] leading-relaxed">
                          <strong className="text-slate-900 dark:text-slate-100 font-bold block">{p.name}</strong>
                          <span className="text-slate-600 dark:text-slate-300">{p.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 dark:text-slate-300 gap-2">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                ✨ 核心备考认知：初试与面试都是“成年人公职执政思维”的培养。早点开始开口，把机关实务感变成肌肉记忆！
              </span>
              <button
                onClick={() => setShowModuleGuide(false)}
                className="px-4 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
              >
                收起导览
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
