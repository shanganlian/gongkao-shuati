import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  X, 
  Headphones, 
  FastForward, 
  Sparkles,
  Loader2,
  UserCheck
} from 'lucide-react';
import { 
  playEmotionalSpeech, 
  stopAllSpeech, 
  VOICE_PERSONAS, 
  VoicePersona 
} from '../services/audioService';

interface AudioTrack {
  id: string;
  title: string;
  subtitle: string;
  textToRead: string;
}

interface AudioPlayerFloatingProps {
  currentTrack: AudioTrack | null;
  onClose: () => void;
}

export const AudioPlayerFloating: React.FC<AudioPlayerFloatingProps> = ({
  currentTrack,
  onClose
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore'); // Default to warm mentor Kore for knowledge/mindset
  const stopFuncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      stopAllSpeech();
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    // Start playing new track with emotional voice
    playTrackWithVoice(currentTrack.textToRead, selectedVoice);

    return () => {
      stopAllSpeech();
    };
  }, [currentTrack]);

  const playTrackWithVoice = async (text: string, voiceName: string) => {
    stopAllSpeech();
    setIsLoadingAudio(true);
    setIsPlaying(false);
    setProgress(0);

    try {
      const stopFn = await playEmotionalSpeech({
        text,
        voiceName,
        onStart: () => {
          setIsLoadingAudio(false);
          setIsPlaying(true);
        },
        onProgress: (pct) => {
          setProgress(pct);
        },
        onEnd: () => {
          setIsPlaying(false);
          setProgress(100);
        },
        onError: () => {
          setIsLoadingAudio(false);
          setIsPlaying(false);
        }
      });
      stopFuncRef.current = stopFn;
    } catch {
      setIsLoadingAudio(false);
      setIsPlaying(false);
    }
  };

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
    if (currentTrack) {
      playTrackWithVoice(currentTrack.textToRead, voiceId);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;

    if (isPlaying) {
      stopAllSpeech();
      setIsPlaying(false);
    } else {
      playTrackWithVoice(currentTrack.textToRead, selectedVoice);
    }
  };

  const handleRestart = () => {
    if (currentTrack) {
      playTrackWithVoice(currentTrack.textToRead, selectedVoice);
    }
  };

  if (!currentTrack) return null;

  const currentPersona = VOICE_PERSONAS[selectedVoice] || VOICE_PERSONAS.Kore;

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[420px] z-50 bg-slate-900 text-white rounded-2xl shadow-2xl p-4.5 border border-slate-700 transition-all">
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            {isLoadingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Headphones className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold truncate text-white">
              {currentTrack.title}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-emerald-400 font-medium">
                {currentPersona.name} · {currentPersona.role}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                · 高保真情感原声
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            stopAllSpeech();
            onClose();
          }}
          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          title="关闭语音播放"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Persona Voice Switcher (Emotive voice choices) */}
      <div className="mb-3 p-2 bg-slate-800/80 rounded-xl border border-slate-700/80">
        <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5 px-0.5">
          <span className="font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            选择讲解人声音色：
          </span>
          <span className="text-[10px] text-slate-400">富有真情实感与抑扬顿挫</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {Object.values(VOICE_PERSONAS).map((vp) => (
            <button
              key={vp.id}
              onClick={() => handleVoiceChange(vp.id)}
              className={`p-1.5 rounded-lg text-left transition-all cursor-pointer ${
                selectedVoice === vp.id
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-slate-900/60 hover:bg-slate-700/70 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px]">
                <span>{vp.avatar}</span>
                <span className="truncate">{vp.name}</span>
              </div>
              <div className={`text-[9px] truncate mt-0.5 ${selectedVoice === vp.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                {vp.role}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Soundwave Equalizer Animation */}
      <div className="flex items-center justify-between gap-1 h-6 my-2 px-1 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
        {[30, 75, 45, 95, 60, 100, 50, 85, 40, 90, 65, 80, 35, 95, 55, 75, 40, 85, 50].map((h, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-300 ${
              isPlaying 
                ? 'bg-emerald-400 animate-pulse' 
                : 'bg-slate-700'
            }`}
            style={{
              height: isPlaying ? `${Math.max(25, h)}%` : '20%',
              animationDelay: `${i * 60}ms`
            }}
          />
        ))}
      </div>

      {/* Progress track */}
      <div className="w-full bg-slate-800 rounded-full h-1.5 my-2.5 overflow-hidden">
        <div 
          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Playback Controls & Status */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[11px] text-slate-400 font-mono">
          {isLoadingAudio ? 'AI 正在调谐真情实感原声...' : (isPlaying ? '正在深情播诵中' : '已暂停')}
        </span>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRestart}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="从头重播"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoadingAudio}
            className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-50"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isLoadingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-slate-950" />
            ) : (
              <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
