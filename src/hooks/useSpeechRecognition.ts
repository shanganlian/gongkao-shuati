/**
 * 面试大厅 v1.0 · Web Speech 语音识别钩子
 *
 * 设计要点（考场模拟不能中途崩）：
 *  - 只支持 Chrome / Edge 等带 webkitSpeechRecognition 的浏览器，isSupported 先暴露给 UI 做降级（改手动输入）
 *  - continuous 模式下浏览器仍会因静默自动 end，钩子会在用户未点“结束”时自动续录，并限制续录次数防止死循环
 *  - 权限拒绝 / 无麦克风 / 断网 / 无语音 全部转成中文 error，不抛异常到页面
 *  - 暂停续录：stop() 只断开识别，transcript 与 elapsedSeconds 都保留；再次 start() 继续累加
 *  - 组件卸载或“放弃本题”时调用 reset()，避免麦克风指示灯常亮
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechRecognitionErrorCode =
  | 'not-supported'
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface UseSpeechRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  autoRestart?: boolean;
  /** 单次作答内最多自动续录次数，防止静默循环 */
  maxRestarts?: number;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  /** 已确认的最终转写（累计，多段拼接） */
  transcript: string;
  /** 当前正在识别的临时片段，用于实时上屏 */
  interimTranscript: string;
  error: string | null;
  errorCode: SpeechRecognitionErrorCode | null;
  /** 累计有效识别时长（秒），暂停期间不计入 */
  elapsedSeconds: number;
  start: () => void;
  stop: () => void;
  reset: () => void;
  getTranscript: () => string;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝：请点地址栏左侧的锁图标，把“麦克风”改为允许后刷新页面。',
  'service-not-allowed': '浏览器阻止了语音服务：请确认使用 https 或 localhost 打开本页。',
  'audio-capture': '没有检测到麦克风：请检查设备是否插入、系统输入设备是否选对。',
  network: '语音识别需要联网：当前网络不可用或请求被拦截，可先改用手动输入。',
  'no-speech': '这一小段没有听到声音，已自动继续录音，请靠近麦克风大声一点。',
  aborted: '语音识别已中止。',
  'language-not-supported': '当前浏览器不支持中文语音识别，请改用 Chrome 或 Edge。',
};

function getRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    lang = 'zh-CN',
    continuous = true,
    interimResults = true,
    autoRestart = true,
    maxRestarts = 20,
  } = options;

  const [isSupported] = useState<boolean>(() => !!getRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<SpeechRecognitionErrorCode | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef('');
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartCountRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const segmentStartedAtRef = useRef(0);

  const syncElapsed = useCallback(() => {
    const running = segmentStartedAtRef.current > 0 ? Date.now() - segmentStartedAtRef.current : 0;
    setElapsedSeconds(Math.floor((accumulatedMsRef.current + running) / 1000));
  }, []);

  const pauseClock = useCallback(() => {
    if (segmentStartedAtRef.current > 0) {
      accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
      segmentStartedAtRef.current = 0;
    }
    syncElapsed();
  }, [syncElapsed]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const applyError = useCallback((code: SpeechRecognitionErrorCode, message?: string) => {
    setErrorCode(code);
    setError(message || ERROR_MESSAGES[code] || '语音识别出现未知错误，请改用手动输入。');
  }, []);

  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      restartCountRef.current = 0;
      if (segmentStartedAtRef.current === 0) segmentStartedAtRef.current = Date.now();
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result && result[0] ? result[0].transcript : '';
        if (!text) continue;
        if (result.isFinal) {
          const clean = String(text).trim();
          if (clean) {
            const separator = finalTextRef.current && !/[。！？；]$/.test(finalTextRef.current) ? '。' : '';
            finalTextRef.current = finalTextRef.current ? `${finalTextRef.current}${separator}${clean}` : clean;
            setTranscript(finalTextRef.current);
          }
        } else {
          interim += text;
        }
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event: any) => {
      const code = String((event && event.error) || 'unknown');
      if (code === 'aborted' || code === 'no-speech') {
        // 静默导致的空结果不算失败，交由 onend 自动续录
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        shouldListenRef.current = false;
        setIsListening(false);
        pauseClock();
        applyError('not-allowed', ERROR_MESSAGES[code]);
        return;
      }
      if (code === 'audio-capture') {
        shouldListenRef.current = false;
        setIsListening(false);
        pauseClock();
        applyError('audio-capture', ERROR_MESSAGES['audio-capture']);
        return;
      }
      if (code === 'network') {
        applyError('network', ERROR_MESSAGES.network);
        return;
      }
      applyError('unknown', `语音识别中断（${code}），已保留前面转写的内容。`);
    };

    recognition.onend = () => {
      setIsListening(false);
      pauseClock();
      setInterimTranscript('');
      if (!shouldListenRef.current || !autoRestart) return;
      if (restartCountRef.current >= maxRestarts) {
        shouldListenRef.current = false;
        applyError('unknown', '本次作答语音识别多次中断，已停止自动续录，请点击“继续录音”或手动补充。');
        return;
      }
      restartCountRef.current += 1;
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        if (!shouldListenRef.current) return;
        try {
          recognition.start();
        } catch {
          // 部分版本连续 start 会抛 InvalidStateError，先 stop 让 onend 再兜一次
          try {
            recognition.stop();
          } catch {
            /* noop */
          }
        }
      }, 300);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [
    applyError,
    autoRestart,
    clearRestartTimer,
    continuous,
    interimResults,
    lang,
    maxRestarts,
    pauseClock,
  ]);

  const start = useCallback(() => {
    if (!isSupported) {
      applyError('not-supported', ERROR_MESSAGES['language-not-supported']);
      return;
    }
    const recognition = ensureRecognition();
    if (!recognition) {
      applyError('not-supported', ERROR_MESSAGES['language-not-supported']);
      return;
    }
    setError(null);
    setErrorCode(null);
    shouldListenRef.current = true;
    clearRestartTimer();
    if (segmentStartedAtRef.current === 0) segmentStartedAtRef.current = Date.now();
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      // 已在识别中：保持状态即可
    }
  }, [applyError, clearRestartTimer, ensureRecognition, isSupported]);

  /** 只断开识别，不清空内容；用于“暂停后继续答” */
  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
    }
    setIsListening(false);
    setInterimTranscript('');
    pauseClock();
  }, [clearRestartTimer, pauseClock]);

  /** 换题 / 放弃本题时调用：连计时与转写一起清空 */
  const reset = useCallback(() => {
    shouldListenRef.current = false;
    restartCountRef.current = 0;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        /* noop */
      }
    }
    finalTextRef.current = '';
    accumulatedMsRef.current = 0;
    segmentStartedAtRef.current = 0;
    setTranscript('');
    setInterimTranscript('');
    setIsListening(false);
    setElapsedSeconds(0);
    setError(null);
    setErrorCode(null);
  }, [clearRestartTimer]);

  const getTranscript = useCallback(() => finalTextRef.current.trim(), []);

  useEffect(() => {
    if (!isListening) return;
    const timer = setInterval(syncElapsed, 500);
    return () => clearInterval(timer);
  }, [isListening, syncElapsed]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    errorCode,
    elapsedSeconds,
    start,
    stop,
    reset,
    getTranscript,
  };
}

