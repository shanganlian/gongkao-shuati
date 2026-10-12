import React, { useState } from 'react';
import { 
  Compass, 
  Volume2, 
  Headphones, 
  BookOpen, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  Play, 
  Clock, 
  Lightbulb,
  FileCheck
} from 'lucide-react';
import { KnowledgePoint, ExamModule } from '../types';
import { MOCK_KNOWLEDGE_POINTS, EXAM_MODULE_NAMES } from '../data/mockData';

interface KnowledgeBaseProps {
  onPlayAudio: (track: { id: string; title: string; subtitle: string; textToRead: string }) => void;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ onPlayAudio }) => {
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [activeKp, setActiveKp] = useState<KnowledgePoint>(MOCK_KNOWLEDGE_POINTS[0]);

  const filteredPoints = MOCK_KNOWLEDGE_POINTS.filter(kp => 
    selectedModule === 'all' || kp.module === selectedModule
  );

  const handlePlayVoice = (kp: KnowledgePoint) => {
    onPlayAudio({
      id: kp.id,
      title: kp.title,
      subtitle: EXAM_MODULE_NAMES[kp.module] || '公考体系秘籍',
      textToRead: kp.audioSummaryText
    });
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold mb-1.5">
            <Headphones className="w-3.5 h-3.5 text-emerald-600" />
            <span>通关秘籍 · 语音听学馆</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            知识点体系与语音导学
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            行测速算口诀、申论官方语系与法律行政红线。每个知识点均提供考官级语音精讲，支持通勤、跑步、睡前碎片化磨耳朵。
          </p>
        </div>

        {/* Global Voice play top trigger */}
        <button
          onClick={() => handlePlayVoice(activeKp)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>听当前考点讲解 ({activeKp.durationMinutes}分钟)</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setSelectedModule('all')}
          className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors cursor-pointer ${
            selectedModule === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          全部秘籍 ({MOCK_KNOWLEDGE_POINTS.length})
        </button>
        {Object.entries(EXAM_MODULE_NAMES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedModule(key)}
            className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors cursor-pointer ${
              selectedModule === key ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Two-Column Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Knowledge Points List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {filteredPoints.map((kp) => {
            const isSelected = activeKp.id === kp.id;
            return (
              <div
                key={kp.id}
                onClick={() => setActiveKp(kp)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white border-emerald-500 shadow-sm ring-1 ring-emerald-500/20'
                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {EXAM_MODULE_NAMES[kp.module]}
                    </span>
                    <span className="text-emerald-700 font-medium">{kp.tag}</span>
                  </div>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    {kp.durationMinutes}m
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                  {kp.title}
                </h4>

                <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                  {kp.summary}
                </p>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1 text-amber-500 font-semibold text-[11px]">
                    {'★'.repeat(kp.importance)}
                    <span className="text-slate-400 ml-1">高频考查</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayVoice(kp);
                    }}
                    className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold text-xs cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>语音精讲</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detailed Deep Dive & Audio Play Deck (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <span className="font-semibold text-emerald-700">
                  【{EXAM_MODULE_NAMES[activeKp.module]} · 核心知识体系】
                </span>
                <span>重要度：{'★'.repeat(activeKp.importance)}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {activeKp.title}
              </h3>
            </div>

            {/* Audio Listening Box */}
            <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-white">
                    语音总结版本 · {activeKp.durationMinutes} 分钟
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    支持调速与通勤闭屏播放，边听边在脑海建立思维树
                  </p>
                </div>
              </div>

              <button
                onClick={() => handlePlayVoice(activeKp)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>立即朗读</span>
              </button>
            </div>

            {/* Core Memory Formula (速记口诀) */}
            <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs sm:text-sm text-amber-950 space-y-1">
              <span className="font-bold text-amber-900 block flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                核心秒杀与通关记忆公式：
              </span>
              <p className="font-mono leading-relaxed pt-1">
                {activeKp.memoryFormula}
              </p>
            </div>

            {/* Deep Conceptual Summary */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-slate-600" />
                知识点本质解构与答题脉络：
              </h5>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                {activeKp.summary}
              </p>
            </div>

            {/* Mindset Bridge: How this transfers to interview & essay */}
            <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200/60 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>思维贯通：初试考点如何转化为申论与面试优势？</span>
              </div>
              <p className="text-emerald-900 leading-relaxed">
                {activeKp.mindsetBridge}
              </p>
            </div>

            {/* Core Keywords Tags */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400">掌握关键词：</span>
              {activeKp.coreConcepts.map((concept, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium"
                >
                  {concept}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
