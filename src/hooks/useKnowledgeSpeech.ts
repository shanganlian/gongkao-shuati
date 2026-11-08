import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeCard } from '../types';

export type KnowledgeSpeechStatus = 'idle' | 'playing' | 'paused';

export interface KnowledgeSpeechPosition {
  index: number;
  total: number;
}

/**
 * 朗读文本：严格按 definition → content → hooks → traps 的顺序拼接。
 * hooks / traps 前面加一句引导语，听到就知道进入口诀 / 陷阱段落。
 */
export function buildSpeechText(card: KnowledgeCard): string {
  const parts: string[] = [];
  if (card.definition) parts.push(card.definition);
  if (card.content) parts.push(card.content);
  if (card.hooks.length) parts.push(`记忆口诀：${card.hooks.join('。')}`);
  if (card.traps.length) parts.push(`易错陷阱：${card.traps.join('。')}`);
  return parts.join('。');
}

/**
 * 知识点卡片语音朗读（浏览器原生 SpeechSynthesis，无第三方依赖、无网络请求）。
 *
 * - 单卡：playCard(card)
 * - 本组连播：playGroup(cards)，一张读完自动读下一张
 * - 暂停 / 继续 / 停止：pause() / resume() / stop()
 *
 * Chrome 在 cancel() 之后立刻 speak() 有概率吞掉首句，所以起播推迟 60ms，
 * 并用 generation 计数丢弃过期回调（停止后不会继续念下一张）。
 */
export function useKnowledgeSpeech() {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function';
  const synth = supported ? window.speechSynthesis : null;

  const [status, setStatus] = useState<KnowledgeSpeechStatus>('idle');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [groupPlaying, setGroupPlaying] = useState(false);
  const [position, setPosition] = useState<KnowledgeSpeechPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queueRef = useRef<KnowledgeCard[]>([]);
  const genRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // 优先选中文（zh-CN）音色；部分浏览器首次 getVoices() 返回空，需等 voiceschanged
  useEffect(() => {
    if (!synth) return;
    const loadVoices = () => {
      const voices = synth.getVoices();
      const picked =
        voices.find((v) => /^zh[-_]CN/i.test(v.lang)) ||
        voices.find((v) => /^zh/i.test(v.lang));
      if (picked) voiceRef.current = picked;
    };
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    return () => synth.removeEventListener?.('voiceschanged', loadVoices);
  }, [synth]);

  const resetState = useCallback(() => {
    setStatus('idle');
    setActiveCardId(null);
    setGroupPlaying(false);
    setPosition(null);
    queueRef.current = [];
  }, []);

  const startQueue = useCallback(
    (cards: KnowledgeCard[], startIndex: number, isGroup: boolean) => {
      if (!synth || cards.length === 0) return;
      const gen = ++genRef.current;
      queueRef.current = cards;
      setGroupPlaying(isGroup);
      setError(null);
      synth.cancel();
      if (synth.paused) synth.resume();

      const speakAt = (index: number) => {
        if (gen !== genRef.current) return;
        const card = queueRef.current[index];
        if (!card) {
          genRef.current += 1;
          resetState();
          return;
        }

        setActiveCardId(card.id);
        setPosition({ index, total: queueRef.current.length });

        const utterance = new SpeechSynthesisUtterance(buildSpeechText(card));
        utterance.lang = 'zh-CN';
        utterance.rate = 1;
        utterance.pitch = 1;
        if (voiceRef.current) utterance.voice = voiceRef.current;

        utterance.onend = () => {
          if (gen !== genRef.current) return;
          speakAt(index + 1);
        };
        utterance.onerror = (event) => {
          if (gen !== genRef.current) return;
          // 主动 cancel() 会触发 interrupted / canceled，属于正常停止
          if (event.error && event.error !== 'interrupted' && event.error !== 'canceled') {
            setError(`语音合成失败（${event.error}），可改用系统朗读或稍后重试。`);
          }
          genRef.current += 1;
          resetState();
        };

        setStatus('playing');
        synth.speak(utterance);
      };

      window.setTimeout(() => speakAt(startIndex), 60);
    },
    [synth, resetState]
  );

  const playCard = useCallback(
    (card: KnowledgeCard) => {
      startQueue([card], 0, false);
    },
    [startQueue]
  );

  const playGroup = useCallback(
    (cards: KnowledgeCard[], startIndex = 0) => {
      startQueue(cards, startIndex, cards.length > 1);
    },
    [startQueue]
  );

  const pause = useCallback(() => {
    if (!synth) return;
    synth.pause();
    setStatus('paused');
  }, [synth]);

  const resume = useCallback(() => {
    if (!synth) return;
    synth.resume();
    setStatus('playing');
  }, [synth]);

  const stop = useCallback(() => {
    if (!synth) return;
    genRef.current += 1;
    synth.cancel();
    resetState();
  }, [synth, resetState]);

  // 离开页面时一定要 cancel，否则朗读会跟着用户跑到别的模块
  useEffect(() => {
    return () => {
      if (!synth) return;
      genRef.current += 1;
      synth.cancel();
    };
  }, [synth]);

  return {
    supported,
    status,
    activeCardId,
    groupPlaying,
    position,
    error,
    playCard,
    playGroup,
    pause,
    resume,
    stop,
  };
}
