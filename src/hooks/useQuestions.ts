import { useState, useEffect, useMemo } from 'react';
import { Question, ExamCategory } from '../types';
import { filterValidQuestions } from '../lib/questionValidation';
import { getScopeModuleStats } from '../data/subModuleCounts';

export function useQuestions(
  selectedCategory: ExamCategory | 'all',
  activeProvince: string,
  activeModule: string,
  activeSubModule: string,
  practiceMode: string,
  mistakeList: string[],
  currentKnowledgeFilter: { module: string; cardIds: string[]; keywords: string[] } | null
) {
  const [indexData, setIndexData] = useState<Record<string, string[]> | null>(null);
  const [idMap, setIdMap] = useState<Record<string, string[]> | null>(null);
  const [loadedChunks, setLoadedChunks] = useState<Set<string>>(new Set());
  const [questionsPool, setQuestionsPool] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/data/questions/index.json').then(res => res.json()),
      fetch('/data/questions/idMap.json').then(res => res.json())
    ]).then(([index, map]) => {
      setIndexData(index);
      setIdMap(map);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!indexData || !idMap) return;

    let targetChunks = new Set<string>();
    const isKnowledgeFilterActive = !!currentKnowledgeFilter;

    if (isKnowledgeFilterActive && currentKnowledgeFilter?.cardIds?.length) {
      currentKnowledgeFilter.cardIds.forEach(id => {
        const chunks = idMap[id];
        // 一个题目 ID 可能分布在多个分片中，必须全部加载，否则会漏题
        if (chunks && chunks.length > 0) chunks.forEach(c => targetChunks.add(c));
      });
    } else if (practiceMode === 'review' || practiceMode === 'mistakes') {
      mistakeList.forEach(id => {
        const chunks = idMap[id];
        // 同上：加载该 ID 所在的全部匹配分片
        if (chunks && chunks.length > 0) chunks.forEach(c => targetChunks.add(c));
      });
    } else {
      Object.keys(indexData).forEach(key => {
        const [cat, prov, mod] = key.split('-');
        const catMatch = selectedCategory === 'all' || cat === selectedCategory;
        const provMatch = activeProvince === 'all' || prov === activeProvince || (selectedCategory === 'national' && prov === 'none') || prov === '联考';
        const modMatch = activeModule === 'all' || mod === activeModule;

        if (catMatch && provMatch && modMatch) {
          if (indexData[key] && indexData[key].length > 0) {
            // 加载所有匹配的分片文件
            indexData[key].forEach(c => targetChunks.add(c));
          }
        }
      });
    }

    const chunksToFetch = Array.from(targetChunks).filter(c => !loadedChunks.has(c));
    
    if (chunksToFetch.length > 0) {
      setIsLoading(true);
      // 每次最多并行加载 2 个分片，结合 useEffect 的依赖实现渐进式陆续加载
      const limited = chunksToFetch.slice(0, 2);
      
      Promise.all(limited.map(c => fetch(`/data/questions/${c}`).then(r => r.json())))
        .then(results => {
          const newQuestions = results.flat();
          setQuestionsPool(prev => {
            const existingIds = new Set(prev.map(q => q.id));
            const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
            return [...prev, ...uniqueNew];
          });
          setLoadedChunks(prev => {
            const next = new Set(prev);
            limited.forEach(c => next.add(c));
            return next;
          });
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [indexData, idMap, selectedCategory, activeProvince, activeModule, currentKnowledgeFilter, practiceMode, mistakeList, loadedChunks]);

  // 当前“目标考试 + 省份”范围的模块/子类题量：优先用构建期快照，快照缺失时用已加载题库现算。
  // 快照只统计 subModule_confidence != 'low' 的子类，low 置信题仍计入模块总数与「全部」。
  const subModuleStats = useMemo(() => {
    const snapshot = getScopeModuleStats(selectedCategory, activeProvince);
    if (snapshot.hasSubCounts) return snapshot;

    const totalByModule: Record<string, number> = {};
    const subsByModule: Record<string, Record<string, number>> = {};
    let total = 0;
    for (const q of filterValidQuestions(questionsPool)) {
      const catMatch = selectedCategory === 'all' || q.category === selectedCategory;
      let provMatch = true;
      if (selectedCategory !== 'national' && activeProvince !== 'all') {
        provMatch = q.province === activeProvince || q.province === '联考';
      }
      if (!catMatch || !provMatch) continue;
      if (!q.module) continue;
      total += 1;
      totalByModule[q.module] = (totalByModule[q.module] || 0) + 1;
      if (q.subModule && q.subModule_confidence !== 'low') {
        const bucket = (subsByModule[q.module] ||= {});
        bucket[q.subModule] = (bucket[q.subModule] || 0) + 1;
      }
    }
    return {
      ...snapshot,
      total,
      totalByModule,
      subsByModule,
      hasSubCounts: Object.keys(subsByModule).length > 0,
    };
  }, [questionsPool, selectedCategory, activeProvince]);

  // 当前“目标考试 + 省份 + 模块”范围内可筛的二级分类；用于隐藏空分类、兜底重置选中态
  const availableSubModules = useMemo(() => {
    if (currentKnowledgeFilter) return [];
    const subs = subModuleStats.subsByModule[activeModule] || {};
    return Object.keys(subs).filter(sub => subs[sub] > 0);
  }, [subModuleStats, activeModule, currentKnowledgeFilter]);

  const filteredQuestions = useMemo(() => {
    const isKnowledgeFilterActive = !!currentKnowledgeFilter;
    // 统一数据校验：题干为空 / 选项为空（含选项文本为空）的题目直接跳过
    const validPool = filterValidQuestions(questionsPool);
    return validPool.filter(q => {
      if (isKnowledgeFilterActive) {
        const { cardIds, keywords } = currentKnowledgeFilter!;
        if (cardIds && cardIds.length > 0) return cardIds.includes(q.id);
        if (keywords && keywords.length > 0) {
          const searchText = [q.title, q.stem, ...(q.keyPoints || [])].join(' ');
          return keywords.some(kw => searchText.includes(kw));
        }
        return true;
      }
      
      const catMatch = selectedCategory === 'all' || q.category === selectedCategory;
      let provMatch = true;
      if (selectedCategory !== 'national' && activeProvince !== 'all') {
        provMatch = q.province === activeProvince || q.province === '联考';
      }
      const modMatch = activeModule === 'all' || q.module === activeModule;
      // low 为待人工复核的暂定分类，不进入二级分类筛选，避免把不确定题暴露到错误子类
      const subModMatch = activeSubModule === 'all'
        || (q.subModule === activeSubModule && q.subModule_confidence !== 'low');

      return catMatch && provMatch && modMatch && subModMatch;
    });
  }, [questionsPool, currentKnowledgeFilter, selectedCategory, activeProvince, activeModule, activeSubModule]);

  return {
    questionsPool,
    filteredQuestions,
    availableSubModules,
    subModuleStats,
    isLoading,
    indexData
  };
}
