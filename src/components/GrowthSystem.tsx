import React from 'react';
import { 
  Award, 
  ShieldCheck, 
  Flame, 
  Sparkles, 
  Compass, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Target, 
  Layers,
  ChevronRight,
  BookOpen,
  Mic,
  Smile
} from 'lucide-react';
import { GrowthBadge } from '../types';
import { MOCK_GROWTH_BADGES } from '../data/mockData';
import { formatStreakDays } from '../lib/activityStats';
import type { ActivityStats } from '../lib/activityStats';

interface GrowthSystemProps {
  level: number;
  levelTitle: string;
  currentExp: number;
  nextLevelExp: number;
  activityStats: ActivityStats;
  onNavigateTab: (tab: string) => void;
}

export const GrowthSystem: React.FC<GrowthSystemProps> = ({
  level,
  levelTitle,
  currentExp,
  nextLevelExp,
  activityStats,
  onNavigateTab
}) => {
  const expPercentage = Math.min(100, Math.round((currentExp / nextLevelExp) * 100));
  const ziliaoStat = activityStats.moduleStats.find(item => item.module === 'ziliao');

  // 勋章解锁完全由真实活动数据判定，不再沿用 mock 里的固定“已点亮”
  const growthBadges = MOCK_GROWTH_BADGES.map(badge => {
    let isUnlocked = false;
    switch (badge.id) {
      case 'b-1':
        isUnlocked = activityStats.mindsetDays >= 30;
        break;
      case 'b-2':
        isUnlocked = activityStats.mindsetDays >= 1;
        break;
      case 'b-3':
        isUnlocked = activityStats.interviewSessions >= 1;
        break;
      case 'b-4':
        isUnlocked = activityStats.interviewSessions >= 3;
        break;
      case 'b-5':
        isUnlocked = !!ziliaoStat && ziliaoStat.answered >= 5 && ziliaoStat.accuracy >= 85;
        break;
      case 'b-6':
        isUnlocked = activityStats.streakDays >= 60;
        break;
    }
    return { ...badge, isUnlocked, earnedDate: undefined as string | undefined };
  });
  const unlockedBadgeCount = growthBadges.filter(badge => badge.isUnlocked).length;

  // Tier styles - Sophisticated non-cartoon executive materials (Bronze, Silver, Gold, Imperial Jade)
  const tierBadges = {
    jade: {
      label: '青玉品阶',
      border: 'border-emerald-600/40',
      bg: 'bg-emerald-950/5 dark:bg-emerald-500/10',
      badgeColor: 'text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/40',
      tag: '高阶洞察'
    },
    gold: {
      label: '金纹品阶',
      border: 'border-brand-gold/40',
      bg: 'bg-brand-gold/5',
      badgeColor: 'text-[#7A5B12] dark:text-amber-300 bg-brand-gold/15',
      tag: '恒毅坚守'
    },
    silver: {
      label: '银辉品阶',
      border: 'border-slate-400/40 dark:border-slate-500/40',
      bg: 'bg-slate-50 dark:bg-slate-800',
      badgeColor: 'text-slate-800 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-700/80',
      tag: '实战破题'
    },
    bronze: {
      label: '铜鉴品阶',
      border: 'border-[#A16207]/30 dark:border-amber-600/40',
      bg: 'bg-[#A16207]/5 dark:bg-amber-500/10',
      badgeColor: 'text-[#7C4A03] dark:text-amber-300 bg-[#A16207]/15 dark:bg-amber-500/20',
      tag: '笃行起步'
    }
  };

  // Official civil service ladder stages (暗线贯穿，严肃克制)
  const officialRanks = [
    { lvl: 1, title: '研习行者', desc: '初窥门径，建立公考知行框架' },
    { lvl: 3, title: '案头调研员', desc: '行测基础夯实，初步理解机关逻辑' },
    { lvl: 6, title: '基层实干主事', desc: '明晰实操痛点，破除答题套路化' },
    { lvl: 10, title: '破局研判骨干', desc: '申论大纲得心应手，面试敢于直视考官' },
    { lvl: 15, title: '案头策论大家', desc: '思维重塑成熟，官样语言水到渠成' },
    { lvl: 20, title: '登岸正印先锋', desc: '融会贯通，处变不惊，大局在胸' }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner: Growth Philosophy */}
      <div className="bg-slate-900 dark:bg-slate-700 text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>全局成长系统 · 暗线贯穿</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              “见己之精进，不以他人高分自扰”
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              公考没有捷径，唯有日积月累。这里的等级与勋章不是娱乐化游戏，而是你把成年人公职思维方式内化为本能的沉淀印记。
            </p>
          </div>

          {/* Level Rank Badge (Minimalist executive emblem) */}
          <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-2xl shrink-0 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-600 to-brand-ink flex items-center justify-center text-white shadow-md">
              <span className="font-mono text-xl font-black">Lv.{level}</span>
            </div>
            <div>
              <div className="text-xs text-slate-400">当前公职思维位阶</div>
              <div className="text-base font-bold text-white tracking-wide">{levelTitle}</div>
              <div className="text-[11px] text-emerald-400 mt-0.5">
                {formatStreakDays(activityStats.streakDays)} · 累计活跃 {activityStats.activeDays} 天
              </div>
            </div>
          </div>
        </div>

        {/* Experience Progress bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>思维经验值进阶 (Exp)</span>
            <span className="font-mono tabular-nums text-slate-300">
              {currentExp} / {nextLevelExp} ({expPercentage}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${expPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3 Core Streak & Stats Cards (Matching user layout style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Combo Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">每日两题思辨连击</span>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {activityStats.mindsetStreak} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">COMBO</span>
            </div>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">已晨练 {activityStats.mindsetDays} 天 · 日拱一卒</span>
          </div>
        </div>

        {/* Total Questions Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">真题精研与弄懂总数</span>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {activityStats.totalAnswered} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">道</span>
            </div>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">行测模块覆盖 {activityStats.moduleCoverage}%</span>
          </div>
        </div>

        {/* Total Interview minutes Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Mic className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">考场开口与自录复盘</span>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {activityStats.interviewMinutes} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">分钟</span>
            </div>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">已开口 {activityStats.interviewSessions} 场 · 结构化 + 无领导</span>
          </div>
        </div>
      </div>

      {/* Ranks Ladder Roadmap */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">公职思维晋升阶梯</h3>
          </div>
          <span className="text-xs text-slate-400">暗线循序渐进 · 杜绝速成心态</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {officialRanks.map((rank) => {
            const isReached = level >= rank.lvl;
            const isCurrent = level === rank.lvl;
            return (
              <div
                key={rank.lvl}
                className={`p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-50/50 dark:bg-emerald-900/40 border-emerald-500 ring-1 ring-emerald-500/20'
                    : isReached
                    ? 'bg-slate-50/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                    isCurrent ? 'bg-emerald-600 text-white' : isReached ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    阶段 {rank.lvl}
                  </span>
                  {isReached && (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isCurrent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  )}
                </div>
                <h4 className={`text-xs font-bold ${isReached ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  {rank.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {rank.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Badges Cabinet (勋章墙 - 典雅高贵，拒绝卡通) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">专属沉淀勋章墙</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              记录你在长线备考中攻克的每一个认知卡点
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 font-mono">
            已点亮 {unlockedBadgeCount} / {growthBadges.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {growthBadges.map((badge) => {
            const tierMeta = tierBadges[badge.tier];
            return (
              <div
                key={badge.id}
                className={`p-4 rounded-xl border transition-all ${
                  badge.isUnlocked
                    ? `${tierMeta.border} ${tierMeta.bg} shadow-xs`
                    : 'border-slate-200 bg-slate-50/50 dark:bg-slate-800/50 opacity-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${tierMeta.badgeColor}`}>
                      <Award className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {badge.name}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {tierMeta.label}
                      </span>
                    </div>
                  </div>

                  {badge.isUnlocked ? (
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded font-medium">
                      已解锁
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      待达成
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-2">
                  {badge.description}
                </p>

                {badge.isUnlocked && badge.earnedDate && (
                  <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-400 font-mono">
                    获颁日期：{badge.earnedDate}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gentle Anti-Anxiety Reminder */}
      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200/80 dark:border-emerald-800/80 rounded-2xl flex items-start gap-3">
        <Smile className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-950 dark:text-emerald-200 space-y-1">
          <strong className="font-semibold block">【必得题库抗焦虑宣言】：</strong>
          <p className="leading-relaxed">
            任何公布分数排行榜的机制都会催生无意义的内卷与惶恐。每个人起点不同、可用时间不同。在这里，你唯一需要对比的就是昨天的自己。按部就班就是伟大，日拱一卒，功不唐捐。
          </p>
        </div>
      </div>
    </div>
  );
};
