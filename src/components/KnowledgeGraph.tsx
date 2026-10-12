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
  FileQuestion
} from 'lucide-react';
import { KnowledgeChapter, KnowledgeCard, KnowledgeStatus } from '../types';
import { KNOWLEDGE_TREE, EXAM_MODULE_NAMES } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface KnowledgeGraphProps {
  onRequireLogin: () => void;
  onJumpToPractice: (module: string, cardIds: string[], keywords: string[]) => void;
}

const STATUS_CONFIG: Record<KnowledgeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unlearned: { label: '未学', color: 'text-slate-400 bg-slate-100', icon: <Circle className="w-3 h-3" /> },
  reviewing: { label: '复习中', color: 'text-amber-600 bg-amber-50', icon: <RefreshCw className="w-3 h-3" /> },
  mastered: { label: '已掌握', color: 'text-emerald-600 bg-emerald-50', icon: <CheckCircle2 className="w-3 h-3" /> }
};

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ onRequireLogin, onJumpToPractice }) => {
  const { user } = useAuth();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set([KNOWLEDGE_TREE[0]?.id]));
  const [expandedSubPoints, setExpandedSubPoints] = useState<Set<string>>(new Set());
  const [statusMap, setStatusMap] = useState<Record<string, KnowledgeStatus>>({});
  const [loading, setLoading] = useState(true);

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

  const handleJumpToPractice = (card: KnowledgeCard) => {
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
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold mb-1.5">
              <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
              <span>知识图谱 · 体系化通关</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              行测申论知识点体系树
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              按章节 → 子考点 → 知识点卡片层级展开。每张卡片含讲解、速记口诀、常见陷阱与配套例题。标记掌握状态，进度云端同步。
            </p>
          </div>
          {/* 进度概览 */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${progressPct}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-600">{progressPct}%</div>
            </div>
            <div className="text-xs space-y-0.5">
              <div className="text-slate-500">已掌握 <span className="font-bold text-emerald-600">{masteredCount}</span> / {totalCards}</div>
              <div className="text-amber-600">复习中 {reviewingCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 树状目录 */}
      <div className="space-y-3">
        {KNOWLEDGE_TREE.map(chapter => {
          const isChapterOpen = expandedChapters.has(chapter.id);
          const chapterCards = chapter.subPoints.flatMap(s => s.cards);
          const chapterMastered = chapterCards.filter(c => statusMap[c.id] === 'mastered').length;
          return (
            <div key={chapter.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {/* 章节标题 */}
              <button
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  {isChapterOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-lg">{chapter.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{chapter.title}</h3>
                    <p className="text-[11px] text-slate-400">{EXAM_MODULE_NAMES[chapter.module]} · {chapterCards.length} 个知识点</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{chapterMastered}/{chapterCards.length} 已掌握</span>
              </button>

              {/* 子考点列表 */}
              {isChapterOpen && (
                <div className="border-t border-slate-100 px-5 pb-4 space-y-2">
                  {chapter.subPoints.map(sub => {
                    const isSubOpen = expandedSubPoints.has(sub.id);
                    return (
                      <div key={sub.id} className="rounded-xl border border-slate-100">
                        {/* 子考点标题 */}
                        <button
                          onClick={() => toggleSubPoint(sub.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer text-left rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {isSubOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            <span className="text-sm font-semibold text-slate-700">{sub.title}</span>
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
                                <div key={card.id} className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
                                  {/* 卡片头部 */}
                                  <div className="flex items-center justify-between px-4 py-2.5 bg-white/60 border-b border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                      <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
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
                                    <p className="text-xs text-slate-700 leading-relaxed">{card.content}</p>

                                    {/* 速记口诀 */}
                                    <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200/70">
                                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 mb-1">
                                        <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                                        速记口诀
                                      </div>
                                      <p className="text-xs text-amber-900 font-mono leading-relaxed">{card.mnemonic}</p>
                                    </div>

                                    {/* 常见陷阱 */}
                                    {card.pitfalls.length > 0 && (
                                      <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200/60">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-900 mb-1.5">
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                          常见陷阱
                                        </div>
                                        <ul className="space-y-1">
                                          {card.pitfalls.map((p, idx) => (
                                            <li key={idx} className="text-xs text-rose-800 leading-relaxed flex gap-1.5">
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
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'unlearned' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                        >
                                          未学
                                        </button>
                                        <button
                                          onClick={() => setCardStatus(card.id, 'reviewing')}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'reviewing' ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-400 hover:bg-amber-100'}`}
                                        >
                                          复习中
                                        </button>
                                        <button
                                          onClick={() => setCardStatus(card.id, 'mastered')}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${status === 'mastered' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-400 hover:bg-emerald-100'}`}
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
