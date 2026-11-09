import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Lightbulb,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Circle,
  ListChecks,
  FileQuestion,
  Layers
} from 'lucide-react';
import { KnowledgeCard, KnowledgeChapter, KnowledgeGraphCard, KnowledgeStatus } from '../types';
import { KNOWLEDGE_TREE, EXAM_MODULE_NAMES } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface KnowledgeGraphProps {
  onRequireLogin: () => void;
  onJumpToPractice: (module: string, cardIds: string[], keywords: string[]) => void;
}

const STATUS_CONFIG: Record<KnowledgeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unlearned: { label: '未学', color: 'text-slate-400 bg-slate-100 dark:bg-slate-800', icon: <Circle className="w-3 h-3" /> },
  reviewing: { label: '复习中', color: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800', icon: <RefreshCw className="w-3 h-3" /> },
  mastered: { label: '已掌握', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40', icon: <CheckCircle2 className="w-3 h-3" /> }
};

/** 资料分析 62 张知识卡：与卡片页共用同一份静态数据 */
const KNOWLEDGE_CARDS_URL = '/data/knowledge/ziliaofenxi.json';
/** 层级顺序：〇认知层 → 一材料阅读 → … → 八特殊考点 */
const LAYER_NUMERALS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八'];

interface KnowledgeLayerGroup {
  /** node_path 第一段，如「二 速算基础层」 */
  label: string;
  /** 层序号（〇/一/…），用于排序与徽标 */
  numeral: string;
  /** 去掉序号后的层名，如「速算基础层」 */
  name: string;
  cards: KnowledgeCard[];
}

/** 按 node_path 第一层聚合卡片；顺序固定为〇→八，层内按卡片 id 排序 */
function buildKnowledgeLayers(cards: KnowledgeCard[]): KnowledgeLayerGroup[] {
  const map = new Map<string, KnowledgeCard[]>();
  cards.forEach((card) => {
    const layer = card.node_path.split('>')[0].trim() || '未分层';
    if (!map.has(layer)) map.set(layer, []);
    map.get(layer)!.push(card);
  });

  return Array.from(map.entries())
    .map(([label, groupCards]) => ({
      label,
      numeral: label.charAt(0),
      name: label.slice(1).trim() || label,
      cards: [...groupCards].sort((a, b) => a.id.localeCompare(b.id))
    }))
    .sort((a, b) => {
      const ai = LAYER_NUMERALS.indexOf(a.numeral);
      const bi = LAYER_NUMERALS.indexOf(b.numeral);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ onRequireLogin, onJumpToPractice }) => {
  const { user } = useAuth();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set([KNOWLEDGE_TREE[0]?.id]));
  const [expandedSubPoints, setExpandedSubPoints] = useState<Set<string>>(new Set());
  const [statusMap, setStatusMap] = useState<Record<string, KnowledgeStatus>>({});
  const [loading, setLoading] = useState(true);
  /** 资料分析 62 卡按 node_path 聚合出的层级框架 */
  const [layerGroups, setLayerGroups] = useState<KnowledgeLayerGroup[]>([]);
  const [frameworkLoading, setFrameworkLoading] = useState(true);
  const [frameworkError, setFrameworkError] = useState<string | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  // 加载用户的知识点掌握状态
  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      if (!user) { setStatusMap({}); setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('knowledge_progress')
        .select('knowledge_id, status')
        .eq('user_id', user.id);
      if (!error && !cancelled && data) {
        const map: Record<string, KnowledgeStatus> = {};
        data.forEach(d => { map[d.knowledge_id] = d.status as KnowledgeStatus; });
        setStatusMap(map);
      }
      setLoading(false);
    };
    loadStatus();
    return () => { cancelled = true; };
  }, [user]);

  // 加载资料分析知识卡，按 node_path 第一层聚合成 9 个层的框架
  useEffect(() => {
    let cancelled = false;
    const loadFramework = async () => {
      try {
        const res = await fetch(KNOWLEDGE_CARDS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('数据格式不是数组');
        if (!cancelled) {
          const groups = buildKnowledgeLayers(data as KnowledgeCard[]);
          setLayerGroups(groups);
          // 默认展开第一层：进入页面立刻能看到「层级 → 卡片标题」的框架，而不是 9 行折叠条
          if (groups.length > 0) setExpandedLayers(new Set([groups[0].label]));
        }
      } catch (err) {
        if (!cancelled) setFrameworkError((err as Error).message);
      } finally {
        if (!cancelled) setFrameworkLoading(false);
      }
    };
    loadFramework();
    return () => { cancelled = true; };
  }, []);

  const toggleLayer = (label: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSubPoint = (id: string) => {
    setExpandedSubPoints(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setCardStatus = async (cardId: string, status: KnowledgeStatus) => {
    if (!user) { onRequireLogin(); return; }
    // 乐观更新
    setStatusMap(prev => ({ ...prev, [cardId]: status }));
    try {
      const { data: existing } = await supabase
        .from('knowledge_progress')
        .select('id')
        .eq('user_id', user.id)
        .eq('knowledge_id', cardId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('knowledge_progress')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('knowledge_progress')
          .insert({ user_id: user.id, knowledge_id: cardId, status });
      }
    } catch {
      // 回滚
      setStatusMap(prev => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    }
  };

  const handleJumpToPractice = (card: KnowledgeGraphCard) => {
    const module = findModuleByCardId(card.id);
    onJumpToPractice(module, card.exampleQuestionIds, [card.title]);
  };

  const findModuleByCardId = (cardId: string): string => {
    for (const chap of KNOWLEDGE_TREE) {
      for (const sub of chap.subPoints) {
        if (sub.cards.some(c => c.id === cardId)) return chap.module;
      }
    }
    return 'all';
  };

  // 统计整体进度
  const allCardIds = KNOWLEDGE_TREE.flatMap(c => c.subPoints.flatMap(s => s.cards.map(card => card.id)));
  const totalCards = allCardIds.length;
  const masteredCount = allCardIds.filter(id => statusMap[id] === 'mastered').length;
  const reviewingCount = allCardIds.filter(id => statusMap[id] === 'reviewing').length;
  const progressPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-1.5">
              <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>知识图谱 · 体系化通关</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              行测申论知识点体系树
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              按章节 → 子考点 → 知识点卡片层级展开。每张卡片含讲解、速记口诀、常见陷阱与配套例题。标记掌握状态，进度云端同步。
            </p>
          </div>
          {/* 进度概览 */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" className="stroke-slate-200 dark:stroke-slate-500" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" className="stroke-emerald-500 dark:stroke-emerald-400" strokeWidth="3" strokeDasharray={`${progressPct}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">{progressPct}%</div>
            </div>
            <div className="text-xs space-y-0.5">
              <div className="text-slate-500 dark:text-slate-400">已掌握 <span className="font-bold text-emerald-600 dark:text-emerald-400">{masteredCount}</span> / {totalCards}</div>
              <div className="text-slate-600 dark:text-slate-300">复习中 {reviewingCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 资料分析知识点框架：按 node_path 第一层聚合（〇～八） */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              资料分析 · 知识点体系框架
            </h3>
            {!frameworkLoading && !frameworkError && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                {layerGroups.length} 个层级 · {layerGroups.reduce((sum, group) => sum + group.cards.length, 0)} 张卡
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            按每张卡 node_path 的第一层聚合。点击层级展开该层全部卡片标题，再点收起。
          </p>
        </div>

        <div className="p-3 sm:p-4 space-y-1.5">
          {frameworkLoading && (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-3">正在加载知识框架…</p>
          )}
          {!frameworkLoading && frameworkError && (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-700/70 rounded-lg px-3 py-2 break-words">
              知识框架加载失败：{frameworkError}
            </p>
          )}
          {!frameworkLoading && !frameworkError && layerGroups.map((group) => {
            const isOpen = expandedLayers.has(group.label);
            return (
              <div key={group.label} className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleLayer(group.label)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <span className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                    {group.numeral}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">
                    {group.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {group.cards.length} 张
                  </span>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />}
                </button>

                {isOpen && (
                  <ul className="ml-3 sm:ml-4 my-1 pl-4 sm:pl-5 pr-3 sm:pr-4 border-l-2 border-emerald-300 dark:border-emerald-800">
                    {group.cards.map((card) => (
                      <li key={card.id} className="flex items-start gap-2 py-1.5">
                        <span className="mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-400 dark:bg-emerald-500" aria-hidden="true" />
                        <p className="min-w-0 text-xs sm:text-sm text-slate-700 dark:text-slate-200 break-words leading-relaxed">
                          {card.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 树状目录 */}
      <div className="space-y-3">
        {KNOWLEDGE_TREE.map(chapter => {
          const isChapterOpen = expandedChapters.has(chapter.id);
          const chapterCards = chapter.subPoints.flatMap(s => s.cards);
          const chapterMastered = chapterCards.filter(c => statusMap[c.id] === 'mastered').length;
          return (
            <div key={chapter.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
              {/* 章节标题 */}
              <button
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  {isChapterOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-lg">{chapter.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{chapter.title}</h3>
                    <p className="text-[11px] text-slate-400">{EXAM_MODULE_NAMES[chapter.module]} · {chapterCards.length} 个知识点</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{chapterMastered}/{chapterCards.length} 已掌握</span>
              </button>

              {/* 子考点列表 */}
              {isChapterOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-5 pb-4 space-y-2">
                  {chapter.subPoints.map(sub => {
                    const isSubOpen = expandedSubPoints.has(sub.id);
                    return (
                      <div key={sub.id} className="rounded-xl border border-slate-100 dark:border-slate-800">
                        {/* 子考点标题 */}
                        <button
                          onClick={() => toggleSubPoint(sub.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {isSubOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{sub.title}</span>
                            <span className="text-[11px] text-slate-400">({sub.cards.length})</span>
                          </div>
                        </button>

                        {/* 知识点卡片 */}
                        {isSubOpen && (
                          <div className="px-4 pb-3 space-y-3">
                            {sub.cards.map(card => {
                              const status: KnowledgeStatus = statusMap[card.id] || 'unlearned';
                              const cfg = STATUS_CONFIG[status];
                              return (
                                <div key={card.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 overflow-hidden">
                                  {/* 卡片头部 */}
                                  <div className="flex items-center justify-between px-4 py-2.5 bg-white/60 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                      <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                      {card.title}
                                    </h4>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${cfg.color}`}>
                                      {cfg.icon}
                                      {cfg.label}
                                    </span>
                                  </div>

                                  {/* 卡片内容 */}
                                  <div className="p-4 space-y-3">
                                    {/* 讲解内容 */}
                                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{card.content}</p>

                                    {/* 速记口诀 */}
                                    <div className="p-3 bg-emerald-50/80 dark:bg-emerald-900/40 rounded-lg border border-emerald-200/70 dark:border-emerald-800/70">
                                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 dark:text-emerald-200 mb-1">
                                        <Lightbulb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                        速记口诀
                                      </div>
                                      <p className="text-xs text-emerald-900 dark:text-emerald-200 font-mono leading-relaxed">{card.mnemonic}</p>
                                    </div>

                                    {/* 常见陷阱 */}
                                    {card.pitfalls.length > 0 && (
                                      <div className="p-3 bg-rose-50/60 dark:bg-rose-900/40 rounded-lg border border-rose-200/60 dark:border-rose-800/60">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1.5">
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                          常见陷阱
                                        </div>
                                        <ul className="space-y-1">
                                          {card.pitfalls.map((p, idx) => (
                                            <li key={idx} className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed flex gap-1.5">
                                              <span className="text-rose-400 mt-0.5">•</span>
                                              <span>{p}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* 操作区 */}
                                    <div className="flex items-center justify-between pt-1">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => setCardStatus(card.id, 'unlearned')}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'unlearned' ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                        >
                                          未学
                                        </button>
                                        <button
                                          onClick={() => setCardStatus(card.id, 'reviewing')}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'reviewing' ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                        >
                                          复习中
                                        </button>
                                        <button
                                          onClick={() => setCardStatus(card.id, 'mastered')}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'mastered' ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}`}
                                        >
                                          已掌握
                                        </button>
                                      </div>
                                      <button
                                        onClick={() => handleJumpToPractice(card)}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                                      >
                                        <FileQuestion className="w-3 h-3" />
                                        相关题目
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="text-center text-xs text-slate-400 py-4">加载掌握进度中...</div>
      )}
    </div>
  );
};
