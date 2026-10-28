import React, { useState } from 'react';
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
  Layers,
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
  ArrowRight
} from 'lucide-react';
import { ExamCategory } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAuthUI } from '../context/AuthUIContext';
import { User, LogOut } from 'lucide-react';

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
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  selectedCategory,
  setSelectedCategory,
  streakDays,
  level,
  levelTitle,
  onOpenCheckIn
}) => {
  const [showModuleGuide, setShowModuleGuide] = useState<boolean>(false);
  const { user, signOut } = useAuth();
  const { openAuth } = useAuthUI();
  const isWrittenTab = ['practice', 'knowledge', 'daily'].includes(activeTab);

  // 6 Primary Navigation Sections with explicit badges & descriptions
  const mainNavItems = [
    { 
      id: 'practice', 
      label: '笔试专区', 
      desc: '刷题/真题/秘籍语音/晨练',
      icon: BookOpen, 
      tag: '三大支柱',
      color: 'amber',
      keyFeatures: ['题库与全真卷', '考点秘籍随身听', '申论每日晨练']
    },
    { 
      id: 'interview', 
      label: '面试专区', 
      desc: '百题结构化/开口/逐点复盘',
      icon: Mic, 
      tag: '严肃实战',
      color: 'indigo',
      keyFeatures: ['100题结构化真题', '语音或打字作答', 'AI评分与逐点复盘']
    },
    { 
      id: 'plan', 
      label: '定制计划', 
      desc: '按个人情况AI定制清单',
      icon: Calendar, 
      tag: '动态排期',
      color: 'emerald',
      keyFeatures: ['在职/全职作息', '薄弱考点突破', '每日打卡清单']
    },
    { 
      id: 'overview', 
      label: '学情总览', 
      desc: '7维能力雷达与深度诊断',
      icon: BarChart3,
      tag: '数据分析',
      color: 'blue',
      keyFeatures: ['7维能力全景雷达', '做题流速监控', '弱项阻滞率分析']
    },
    { 
      id: 'growth', 
      label: '全局成长', 
      desc: `位阶晋级 · Lv.${level} ${levelTitle}`,
      icon: Award, 
      tag: '勋章暗线',
      color: 'purple',
      keyFeatures: ['行政位阶晋级', '青玉/金纹勋章墙', '不显高分拒绝焦虑']
    },
    { 
      id: 'community', 
      label: '备考社区', 
      desc: '28天坚持轨迹与互勉',
      icon: Users,
      tag: '同舟共济',
      color: 'rose',
      keyFeatures: ['备考轨迹热力图', '每日心得体会', '互勉花束打卡']
    }
  ];

  // Detailed definitions of each module for users
  const moduleDefinitions = [
    {
      badge: '笔试专区 (三大支柱)',
      icon: BookOpen,
      title: '笔试专区：基础夯实与思维长线沉淀',
      color: 'bg-amber-500 text-white',
      parts: [
        { name: '1. 刷题与真题卷', text: '国考/省考/事考历年全真试卷与五大专项题库（常识、言语、数量、判断、资料），支持错题归纳与专项攻坚。' },
        { name: '2. 知识点体系与秘籍语音', text: '考点思维导图与速算口诀，搭配专业语音朗读功能，随时利用碎片化通勤时间闭眼“磨耳朵”。' },
        { name: '3. 申论与初试每日两题晨练', text: '战线拉长，每天清晨练两题（申论宏观站位+行测严密因果辨析），从早培养成年人公职思考习惯。' }
      ]
    },
    {
      badge: '面试专区 (结构化实战)',
      icon: Mic,
      title: '面试专区：百题结构化题库 · 开口作答 · 逐点复盘',
      color: 'bg-indigo-600 text-white',
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
      color: 'bg-emerald-600 text-white',
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
      color: 'bg-blue-600 text-white',
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
      color: 'bg-purple-600 text-white',
      parts: [
        { name: '1. 庄严位阶暗线阶梯', text: '从研习行者、笃行书办、基层实干主事到登岸正印先锋，沉稳庄重大气，视觉非卡通化。' },
        { name: '2. 纯粹实干勋章库', text: '青玉、金纹、朱漆实务勋章，记录长线思考、按部就班、破局沉着每一次突破。' },
        { name: '3. 防焦虑设计原则', text: '系统绝不展示他人高分，不让高分打击信心，见自己之精进，保持自我的成长节律。' }
      ]
    },
    {
      badge: '备考社区 (同行互勉)',
      icon: Users,
      title: '备考社区：28天坚持轨迹与同舟共济',
      color: 'bg-rose-600 text-white',
      parts: [
        { name: '1. 坚持轨迹打卡热力图', text: '记录每天刷题、听学与开口演练的坚持点滴，形成看得见的努力印记。' },
        { name: '2. 每日两题心得分享流', text: '考友交流真实思考体会，互赠“按部就班”花束，构建阳光互勉环境。' }
      ]
    }
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
    <header className="sticky top-0 z-40 bg-white border-b-2 border-slate-200 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ROW 1: Brand Wordmark, Exam Selector & Quick Actions */}
        <div className="flex items-center justify-between h-16 border-b border-slate-100">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('overview')}
              className="flex items-center gap-2.5 text-left cursor-pointer group focus:outline-none"
              title="点击返回学情总览"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-900 group-hover:bg-emerald-600 flex items-center justify-center text-white font-black text-lg shadow-sm transition-colors">
                岸
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-black tracking-tight text-slate-900 font-sans">
                    行岸公考
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-white font-bold tracking-wide">
                    官方专业版
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5 hidden sm:block">
                  国考 · 省考 · 事业编 ｜ 笔试刷题 · 秘籍听学 · 严肃面试
                </p>
              </div>
            </button>

            {/* Target Exam Switcher */}
            <div className="flex items-center ml-2 pl-3 border-l border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 mr-1.5 hidden md:inline">当前目标:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TargetCategory)}
                className="text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition-colors"
              >
                <option value="all">🌐 全部考试</option>
                <option value="national">🎯 国家公务员考试 (国考)</option>
                <option value="provincial">🏛️ 省公务员联考 (省考)</option>
                <option value="public_institution">📚 全国事业单位招聘 (事考)</option>
              </select>
            </div>
          </div>

          {/* Top Right Quick CTAs */}
          <div className="flex items-center gap-2">
            {/* Explainer Button */}
            <button
              onClick={() => setShowModuleGuide(!showModuleGuide)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                showModuleGuide
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 hover:border-slate-400'
              }`}
              title="查看六大核心模块详细功能说明"
            >
              <Info className="w-3.5 h-3.5 text-emerald-500" />
              <span>全站模块功能透视</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModuleGuide ? 'rotate-180' : ''}`} />
            </button>

            {/* Today Check-in CTA */}
            <button
              onClick={onOpenCheckIn}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>每日打卡 ({streakDays}天)</span>
            </button>

            {/* 用户认证 */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-xl">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-700 max-w-[100px] truncate">{user.email}</span>
                </div>
                <button
                  onClick={signOut}
                  className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => openAuth('default')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>登录</span>
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: PRIMARY HIGH-VISIBILITY NAVIGATION CARDS */}
        <div className="py-2.5">
          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = (item.id === 'practice' && isWrittenTab) || activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`group relative text-left p-2.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-400 hover:bg-slate-50 shadow-2xs'
                  }`}
                >
                  {/* Top Bar: Icon + Title + Tag */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isActive 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className={`text-xs sm:text-sm font-black tracking-tight ${
                        isActive ? 'text-white' : 'text-slate-900'
                      }`}>
                        {item.label}
                      </span>
                    </div>

                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                      isActive 
                        ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' 
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {item.tag}
                    </span>
                  </div>

                  {/* Subtitle / Explanatory text */}
                  <p className={`text-[10px] mt-1.5 leading-snug line-clamp-1 font-medium ${
                    isActive ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {item.desc}
                  </p>

                  {/* Active Indicator Bar */}
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-3 right-3 h-0.5 bg-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* SECONDARY SUB-NAV: When inside 笔试专区 */}
      {isWrittenTab && (
        <div className="bg-amber-950 text-white border-t border-amber-900/80 px-4 py-2 shadow-inner">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-amber-300 flex items-center gap-1.5 mr-1 text-xs">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                笔试专区三大核心板块：
              </span>

              <button
                onClick={() => setActiveTab('practice')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'practice'
                    ? 'bg-white text-slate-950 font-black shadow-xs ring-1 ring-white'
                    : 'bg-amber-900/70 text-amber-100 hover:bg-amber-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>板块 1：题库刷题与全真试卷 (专项/真题/错题本)</span>
              </button>

              <button
                onClick={() => setActiveTab('knowledge')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'knowledge'
                    ? 'bg-white text-slate-950 font-black shadow-xs ring-1 ring-white'
                    : 'bg-amber-900/70 text-amber-100 hover:bg-amber-800'
                }`}
              >
                <Headphones className="w-3.5 h-3.5 text-amber-400" />
                <span>板块 2：知识点体系 · 通关秘籍与语音随身听</span>
              </button>

              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'daily'
                    ? 'bg-white text-slate-950 font-black shadow-xs ring-1 ring-white'
                    : 'bg-amber-900/70 text-amber-100 hover:bg-amber-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>板块 3：申论初试 · 每日思维两题晨练</span>
              </button>
            </div>

            <span className="text-[11px] text-amber-200/90 font-medium hidden lg:inline-block">
              💡 战线拉长 · 每日浸润公职逻辑与行测解题模型
            </span>
          </div>
        </div>
      )}

      {/* SECONDARY SUB-NAV: When inside 面试专区 */}
      {activeTab === 'interview' && (
        <div className="bg-slate-950 text-white border-t border-slate-800 px-4 py-2 shadow-inner">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-indigo-400 flex items-center gap-1.5 mr-1 text-xs">
                <Mic className="w-3.5 h-3.5 text-indigo-400" />
                面试训练流程：
              </span>
              <span className="px-2.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700/80 font-bold">
                📚 100题结构化真题库
              </span>
              <span className="px-2.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700/80 font-medium">
                🎙️ 语音/打字双模式作答
              </span>
              <span className="px-2.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700/80 font-medium">
                📊 AI采分点逐条核对
              </span>
              <span className="px-2.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700/80 font-medium">
                📁 本机练习记录复盘
              </span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                🛡️ 拒绝焦虑：不显对手高分
              </span>
            </div>
            <span className="text-[11px] text-indigo-300/80 font-medium hidden lg:inline-block">
              ⚡ 早点开始开口模拟，消弭怯场，练成肌肉记忆！
            </span>
          </div>
        </div>
      )}

      {/* CURRENT ACTIVE MODULE CONTEXT BANNER */}
      <div className="bg-slate-50 border-t border-slate-200/80 px-4 py-1.5 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900">
              {currentSummary.tag}
            </span>
            <span className="text-slate-700 font-medium hidden sm:inline">
              — {currentSummary.title}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            {currentSummary.hint}
          </span>
        </div>
      </div>

      {/* EXPANDABLE MODULE GUIDE DRAWER (全站模块功能透视) */}
      {showModuleGuide && (
        <div className="bg-white border-b-2 border-slate-300 shadow-xl p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                  透
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    行岸公考 · 全站六大核心模块架构与功能导览
                  </h3>
                  <p className="text-xs text-slate-500">
                    一目了然看懂每个模块包含什么、解决什么备考痛点、如何协同使用
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModuleGuide(false)}
                className="text-slate-400 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 6 Module Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {moduleDefinitions.map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <div 
                    key={i} 
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 hover:border-slate-400 hover:bg-white hover:shadow-xs transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-800" />
                        <h4 className="text-xs font-black text-slate-900">
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
                          <strong className="text-slate-900 font-bold block">{p.name}</strong>
                          <span className="text-slate-600">{p.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
              <span className="font-semibold text-emerald-800">
                ✨ 核心备考认知：初试与面试都是“成年人公职执政思维”的培养。早点开始开口，把机关实务感变成肌肉记忆！
              </span>
              <button
                onClick={() => setShowModuleGuide(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer"
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
