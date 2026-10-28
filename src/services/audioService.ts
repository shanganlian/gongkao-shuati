/**
 * High-Fidelity Emotional Voice Audio Service
 * Integrates server-side Gemini AI TTS with emotional personas and low-latency fallback
 */

import { authFetch } from '../lib/authFetch';

export interface VoicePersona {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar: string;
  defaultStyle: string;
}

export const VOICE_PERSONAS: Record<string, VoicePersona> = {
  Charon: {
    id: 'Charon',
    name: '张巡视员',
    role: '正厅级资深主考官',
    description: '庄重威严、音调沉稳、抑扬顿挫、极具体制内领导气度与考场仪式感',
    avatar: '👨‍💼',
    defaultStyle: '严肃庄重、富有威严、音调沉稳大气的中国国家公务员面试正厅级主考官口吻，普通话标准，富有临场压迫感与考场仪式感，情绪真挚自然'
  },
  Kore: {
    id: 'Kore',
    name: '林导师',
    role: '公考命题组名师',
    description: '温润亲切、循循善诱、娓娓道来、充满鼓励与启发性',
    avatar: '👩‍🏫',
    defaultStyle: '温润亲切、循循善诱、娓娓道来的公考命题组资深名师口吻，语调抑扬顿挫，充满对考生的鼓励与启发'
  },
  Puck: {
    id: 'Puck',
    name: '程老师',
    role: '基层实务领学人',
    description: '干练清晰、思维敏捷、富有机关实操穿透力',
    avatar: '🧑‍💻',
    defaultStyle: '专业清晰、沉着自信、富有机关实务感染力的实干型导师口吻'
  }
};

// In-memory audio cache to avoid re-generating identical lines
const audioCache = new Map<string, string>();

let currentActiveAudio: HTMLAudioElement | null = null;

/**
 * Play high-fidelity emotional voice audio
 */
export async function playEmotionalSpeech(options: {
  text: string;
  voiceName?: string;
  style?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err?: any) => void;
  onProgress?: (progressPct: number) => void;
}): Promise<() => void> {
  const { 
    text, 
    voiceName = 'Charon', 
    style, 
    onStart, 
    onEnd, 
    onError,
    onProgress
  } = options;

  // Stop currently playing audio if any
  stopAllSpeech();

  const cacheKey = `${voiceName}:${text.slice(0, 120)}`;
  let audioBase64 = audioCache.get(cacheKey);

  // If not cached, fetch from backend Gemini TTS API
  if (!audioBase64) {
    try {
      const res = await authFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName,
          style: style || VOICE_PERSONAS[voiceName]?.defaultStyle
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          audioBase64 = data.audioBase64;
          audioCache.set(cacheKey, audioBase64!);
        }
      }
    } catch (e) {
      console.warn('Backend TTS request error, falling back to enhanced browser speech:', e);
    }
  }

  // If Gemini TTS audio is available, play via native Audio element
  if (audioBase64) {
    try {
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      currentActiveAudio = audio;

      audio.onplay = () => {
        onStart?.();
      };

      audio.ontimeupdate = () => {
        if (audio.duration && audio.duration > 0) {
          const pct = Math.min(100, Math.round((audio.currentTime / audio.duration) * 100));
          onProgress?.(pct);
        }
      };

      audio.onended = () => {
        currentActiveAudio = null;
        onEnd?.();
      };

      audio.onerror = (e) => {
        console.warn('Audio element error:', e);
        currentActiveAudio = null;
        fallbackWebSpeech(text, voiceName, onStart, onEnd, onError, onProgress);
      };

      await audio.play();

      return () => {
        audio.pause();
        audio.currentTime = 0;
        if (currentActiveAudio === audio) {
          currentActiveAudio = null;
        }
      };
    } catch (e) {
      console.warn('Failed to play audio element, using fallback:', e);
    }
  }

  // Graceful fallback to enhanced Web Speech API if AI TTS unavailable
  return fallbackWebSpeech(text, voiceName, onStart, onEnd, onError, onProgress);
}

/**
 * Stop any currently running speech or audio playback
 */
export function stopAllSpeech() {
  if (currentActiveAudio) {
    try {
      currentActiveAudio.pause();
      currentActiveAudio.currentTime = 0;
    } catch {}
    currentActiveAudio = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

/**
 * Fallback Web Speech Synthesis with naturalized voice tuning
 */
function fallbackWebSpeech(
  text: string,
  voiceName: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err?: any) => void,
  onProgress?: (progressPct: number) => void
): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.('Speech not supported');
    return () => {};
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';

  // Tuned rates and pitches for human authority and emotion
  if (voiceName === 'Charon') {
    utterance.rate = 0.90; // Solemn, steady, authoritative
    utterance.pitch = 0.90; // Deeper resonant voice
  } else if (voiceName === 'Kore') {
    utterance.rate = 0.95;
    utterance.pitch = 1.05; // Warmer feminine voice
  } else {
    utterance.rate = 0.96;
    utterance.pitch = 1.0;
  }

  // Choose the best natural Chinese voice available on this device
  const voices = window.speechSynthesis.getVoices();
  const bestVoice = voices.find(v => 
    (v.lang.includes('zh') || v.lang.includes('cmn')) && 
    (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Xiaoxiao') || v.name.includes('Yunxi'))
  ) || voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));

  if (bestVoice) {
    utterance.voice = bestVoice;
  }

  utterance.onstart = () => {
    onStart?.();
    onProgress?.(0);
  };

  utterance.onboundary = (e) => {
    if (text.length > 0) {
      const pct = Math.min(100, Math.round((e.charIndex / text.length) * 100));
      onProgress?.(pct);
    }
  };

  utterance.onend = () => {
    onEnd?.();
    onProgress?.(100);
  };

  utterance.onerror = (e) => {
    onError?.(e);
  };

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
  };
}
