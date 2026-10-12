import { useState, useEffect, useMemo } from 'react';
import { Question, ExamCategory } from '../types';

export function useQuestions(
  selectedCategory: ExamCategory | 'all',
  activeProvince: string,
  activeModule: string,
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
        if (chunks && chunks.length > 0) targetChunks.add(chunks[0]);
      });
    } else if (practiceMode === 'review' || practiceMode === 'mistakes') {
      mistakeList.forEach(id => {
        const chunks = idMap[id];
        if (chunks && chunks.length > 0) targetChunks.add(chunks[0]);
      });
    } else {
      Object.keys(indexData).forEach(key => {
        const [cat, prov, mod] = key.split('-');
        const catMatch = selectedCategory === 'all' || cat === selectedCategory;
        const provMatch = activeProvince === 'all' || prov === activeProvince || (selectedCategory === 'national' && prov === 'none') || prov === '联考';
        const modMatch = activeModule === 'all' || mod === activeModule;

        if (catMatch && provMatch && modMatch) {
          if (indexData[key] && indexData[key].length > 0) {
            targetChunks.add(indexData[key][0]); // Load just the first chunk to save bandwidth
          }
        }
      });
    }

    const chunksToFetch = Array.from(targetChunks).filter(c => !loadedChunks.has(c));
    
    if (chunksToFetch.length > 0) {
      setIsLoading(true);
      // Fetch up to 10 chunks to avoid overwhelming the network
      const limited = chunksToFetch.slice(0, 10);
      
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

  const filteredQuestions = useMemo(() => {
    const isKnowledgeFilterActive = !!currentKnowledgeFilter;
    return questionsPool.filter(q => {
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
      
      return catMatch && provMatch && modMatch;
    });
  }, [questionsPool, currentKnowledgeFilter, selectedCategory, activeProvince, activeModule]);

  return {
    questionsPool,
    filteredQuestions,
    isLoading,
    indexData
  };
}
