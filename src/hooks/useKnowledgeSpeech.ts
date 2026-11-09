import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeCard } from '../types';

export type KnowledgeSpeechStatus = 'idle' | 'playing' | 'paused';

export interface KnowledgeSpeechPosition {
  index: number;
  total: number;
}

/** 普通话判定：lang 必须以 zh-CN 开头（zh-HK / zh-TW / 粤语一律排除） */
const MANDARIN_LANG = /^zh[-_]CN/i;
/** Microsoft 普通话系音色优先 */
const PREFERRED_MANDARIN_VOICE = /xiaoxiao|xiaoyi|yunjian|yunyang/i;

/** 无普通话音色时的统一提示（UI 按钮旁只显示前半句） */
export const MANDARIN_VOICE_MISSING_MESSAGE =
  '未找到普通话语音，已停止朗读。请在系统「设置 → 时间和语言 → 语音」中安装中文（简体）语音包后重试。';

export function isMandarinVoice(voice: SpeechSynthesisVoice): boolean {
  return MANDARIN_LANG.test(voice.lang || '');
}

/**
 * 从系统音色列表挑普通话音色：先过滤 lang=zh-CN，再优先 Microsoft 普通话系
 * （Xiaoxiao / Xiaoyi / Yunjian / Yunyang）。没有 zh-CN 时返回 null，
 * 绝不退回到 zh-HK / zh-TW，避免粤语或台湾腔顶替普通话。
 */
export function pickMandarinVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const mandarinVoices = voices.filter(isMandarinVoice);
  if (mandarinVoices.length === 0) return null;
  return mandarinVoices.find((voice) => PREFERRED_MANDARIN_VOICE.test(voice.name)) ?? mandarinVoices[0];
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
  /** 系统没有任何普通话音色：UI 在播放按钮旁提示「未找到普通话语音」 */
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  /** 当前选中的普通话音色（name / lang），渲染出来便于确认不是粤语 */
  const [voiceInfo, setVoiceInfo] = useState<{ name: string; lang: string } | null>(null);

  const queueRef = useRef<KnowledgeCard[]>([]);
  const genRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  /** getVoices() 是否已返回过非空列表：区分「还没加载完」与「确实没有普通话音色」 */
  const voiceListLoadedRef = useRef(false);
  /** startQueue 在等音色列表时挂起的回调，voiceschanged / 超时后统一结算 */
  const pendingResolversRef = useRef<Array<(voice: SpeechSynthesisVoice | null) => void>>([]);

  /**
   * 读取并缓存普通话音色。getVoices() 首次可能为空（异步加载），
   * 此时不缓存任何音色，等 voiceschanged 再读，保证加载完成前不会误用 zh-HK。
   */
  const publishVoices = useCallback((): SpeechSynthesisVoice | null => {
    if (!synth) return null;
    const allVoices = synth.getVoices();
    if (allVoices.length === 0) return null;
    voiceListLoadedRef.current = true;
    const picked = pickMandarinVoice(allVoices);
    voiceRef.current = picked;
    setVoiceUnavailable(!picked);
    setVoiceInfo(picked ? { name: picked.name, lang: picked.lang } : null);
    const resolvers = pendingResolversRef.current;
    pendingResolversRef.current = [];
    resolvers.forEach((resolve) => resolve(picked));
    return picked;
  }, [synth]);

  /** 取普通话音色：已缓存直接返回；列表未就绪时最多等 1.2s，等不到就返回 null（不降级到粤语） */
  const resolveVoice = useCallback((): Promise<SpeechSynthesisVoice | null> => {
    if (voiceRef.current && isMandarinVoice(voiceRef.current)) return Promise.resolve(voiceRef.current);
    const fromList = publishVoices();
    if (fromList) return Promise.resolve(fromList);
    if (voiceListLoadedRef.current) return Promise.resolve(null); // 有音色列表，但没有 zh-CN
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const settle = (voice: SpeechSynthesisVoice | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(voice);
      };
      timer = window.setTimeout(() => settle(voiceRef.current), 1200);
      pendingResolversRef.current.push(settle);
    });
  }, [publishVoices]);

  // 监听 voiceschanged 缓存普通话音色；个别浏览器不派发该事件，2.5s 兜底再查一次
  useEffect(() => {
    if (!synth) return;
    publishVoices();
    const handleVoicesChanged = () => {
      publishVoices();
    };
    synth.addEventListener('voiceschanged', handleVoicesChanged);
    const fallbackTimer = window.setTimeout(() => {
      const picked = publishVoices();
      if (!picked && !voiceListLoadedRef.current) {
        // 始终拿不到音色列表：按「无普通话音色」处理，避免沉默或误用方言
        voiceListLoadedRef.current = true;
        setVoiceUnavailable(true);
      }
    }, 2500);
    return () => {
      window.clearTimeout(fallbackTimer);
      synth.removeEventListener('voiceschanged', handleVoicesChanged);
    };
  }, [synth, publishVoices]);

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

        const allVoices = synth.getVoices();
        // 每次发声前重新读一遍：缓存里的 voice 对象可能已失效（系统切换 / 浏览器重载列表），
        // 直接复用会让 utterance.voice 赋值落空，退回系统默认音色（可能是粤语）。
        const picked = allVoices.length > 0 ? pickMandarinVoice(allVoices) : voiceRef.current;
        const voice = picked && isMandarinVoice(picked) ? picked : null;
        if (allVoices.length > 0) {
          voiceRef.current = voice;
          setVoiceUnavailable(!voice);
          setVoiceInfo(voice ? { name: voice.name, lang: voice.lang } : null);
        }
        if (!voice) {
          // 兜底：没有经过 zh-CN 校验的 voice，绝不发声（否则可能落到 zh-HK / 系统默认粤语）
          genRef.current += 1;
          setError(MANDARIN_VOICE_MISSING_MESSAGE);
          resetState();
          return;
        }
        if (import.meta.env.DEV) {
          const zhCNCount = allVoices.filter(isMandarinVoice).length;
          const zhHKCount = allVoices.filter((item) => /^zh[-_]HK/i.test(item.lang || '')).length;
          console.info(
            `[知识卡朗读] 选用音色：${voice.name}（${voice.lang}）；voice 列表 ${allVoices.length} 个，zh-CN ${zhCNCount} 个，zh-HK ${zhHKCount} 个`
          );
        }

        const utterance = new SpeechSynthesisUtterance(buildSpeechText(card));
        utterance.lang = 'zh-CN';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.voice = voice;

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

      resolveVoice().then((voice) => {
        if (gen !== genRef.current) return;
        if (!voice) {
          genRef.current += 1;
          setError(MANDARIN_VOICE_MISSING_MESSAGE);
          resetState();
          return;
        }
        voiceRef.current = voice;
        window.setTimeout(() => speakAt(startIndex), 60);
      });
    },
    [synth, resetState, resolveVoice]
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
    voiceUnavailable,
    voiceInfo,
    playCard,
    playGroup,
    pause,
    resume,
    stop,
  };
}
