import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Headphones,
  Layers,
  Lightbulb,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2
} from 'lucide-react';
import type { KnowledgeCard } from '../types';
import { useKnowledgeSpeech } from '../hooks/useKnowledgeSpeech';

/** 卡片数据：纯 JSON 数组，随 public/ 一起发布，前端直读，不经过 server */
const DATA_URL = '/data/knowledge/ziliaofenxi.json';

/** 层级导航顺序：〇认知层 → 一材料阅读 → 二速算 → … → 八特殊考点 */
const LAYER_ORDER = ['〇', '一', '二', '三', '四', '五', '六', '七', '八'];

type Speech = ReturnType<typeof useKnowledgeSpeech>;

interface LayerGroup {
  /** 层序号（〇/一/…），用于排序 */
  numeral: string;
  /** node_path 第一段，如「二 速算基础层」 */
  label: string;
  cards: KnowledgeCard[];
}

/** node_path 形如「二 速算基础层 > 特殊公式口诀 > 合成增长率」，第一段是层级，其余是子路径 */
function splitNodePath(nodePath: string) {
  const [layer = '', ...rest] = nodePath.split('>').map((part) => part.trim());
  return { layer, leaf: rest.join(' › ') };
}

function buildGroups(cards: KnowledgeCard[]): LayerGroup[] {
  const map = new Map<string, KnowledgeCard[]>();
  cards.forEach((card) => {
    const { layer } = splitNodePath(card.node_path);
    const key = layer || '未分层';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(card);
  });

  return Array.from(map.entries())
    .map(([label, groupCards]) => ({
      numeral: label.charAt(0),
      label,
      cards: [...groupCards].sort((a, b) => a.id.localeCompare(b.id))
    }))
    .sort((a, b) => {
      const ai = LAYER_ORDER.indexOf(a.numeral);
      const bi = LAYER_ORDER.indexOf(b.numeral);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
}

/** 每张卡的播放 / 暂停 / 停止 */
const CardVoiceControls: React.FC<{ card: KnowledgeCard; speech: Speech }> = ({ card, speech }) => {
  const active = speech.activeCardId === card.id;
  const playing = active && speech.status === 'playing';
  const paused = active && speech.status === 'paused';
  const disabled = !speech.supported;

  const handleMain = () => {
    if (playing) speech.pause();
    else if (paused) speech.resume();
    else speech.playCard(card);
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={handleMain}
        disabled={disabled}
        aria-label={playing ? '暂停朗读本卡' : paused ? '继续朗读本卡' : '朗读本卡'}
        className={`inline-flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? 'bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:border-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400'
            : 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
        }`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{playing ? '暂停' : paused ? '继续' : '朗读'}</span>
      </button>
      <button
        type="button"
        onClick={speech.stop}
        disabled={disabled || !active}
        aria-label="停止朗读"
        className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
      >
        <Square className="w-3.5 h-3.5" />
        <span className="hidden sm:inline ml-1">停止</span>
      </button>
    </div>
  );
};


/** 单张知识卡：标题 / 定义 / 正文 / 口诀标签 / 陷阱警示列表 */
const KnowledgeCardView: React.FC<{ card: KnowledgeCard; speech: Speech }> = ({ card, speech }) => {
  const { leaf } = splitNodePath(card.node_path);
  // questions 目前全是「待配题」：真题未回填，整块隐藏，不留空占位
  const linkedQuestions = card.questions.filter((q) => q.trim().length > 0 && q !== '待配题');

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
      <header className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-slate-500 dark:text-slate-400">{card.id}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {card.module}
            </span>
          </div>
          <h3 className="mt-1.5 text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {card.title}
          </h3>
          {leaf && (
            <p className="mt-1 flex items-start gap-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              <Layers className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="break-words">{leaf}</span>
            </p>
          )}
        </div>
        <CardVoiceControls card={card} speech={speech} />
      </header>

      <div className="px-4 sm:px-5 py-4 space-y-4">
        <p className="text-sm sm:text-[15px] font-semibold leading-6 text-slate-800 dark:text-slate-200 bg-emerald-50/70 dark:bg-emerald-900/30 border-l-2 border-emerald-500 rounded-r-lg px-3 py-2">
          {card.definition}
        </p>

        <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 whitespace-pre-line">
          {card.content}
        </p>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            记忆口诀
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.hooks.map((hook, index) => (
              <span
                key={`${card.id}-hook-${index}`}
                className="inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] sm:text-xs font-medium leading-relaxed bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
              >
                {hook}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-900/25 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            易错陷阱
          </div>
          <ul className="mt-1.5 space-y-1">
            {card.traps.map((trap, index) => (
              <li
                key={`${card.id}-trap-${index}`}
                className="flex gap-1.5 text-xs sm:text-[13px] leading-relaxed text-amber-900 dark:text-amber-100"
              >
                <span aria-hidden="true" className="shrink-0">•</span>
                <span>{trap}</span>
              </li>
            ))}
          </ul>
        </div>

        {linkedQuestions.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
              <BookOpen className="w-3.5 h-3.5" />
              配套真题
            </div>
            <ul className="mt-1.5 space-y-1">
              {linkedQuestions.map((question, index) => (
                <li key={`${card.id}-q-${index}`} className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300">
                  {question}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
};


export const KnowledgeCards: React.FC = () => {
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [activeLayer, setActiveLayer] = useState<string>('all');
  const speech = useKnowledgeSpeech();

  // 直读静态 JSON：不经过 server，也不发任何音频请求（语音全部由浏览器本地合成）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error('数据格式不是数组');
        setCards(data as KnowledgeCard[]);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setCards([]);
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const groups = useMemo(() => buildGroups(cards), [cards]);
  const currentGroup = useMemo(
    () => groups.find((group) => group.label === activeLayer) || null,
    [groups, activeLayer]
  );
  const visibleCards = currentGroup ? currentGroup.cards : cards;
  const scopeName = currentGroup ? currentGroup.label : '全部层级';

  const groupButtonLabel = speech.groupPlaying
    ? (speech.status === 'paused' ? '继续连播' : '停止连播')
    : `连续播放${currentGroup ? '本组' : '全部'}（${visibleCards.length} 张）`;

  const handleGroupToggle = () => {
    if (speech.groupPlaying) {
      if (speech.status === 'paused') speech.resume();
      else speech.stop();
      return;
    }
    // 若本组某张卡正在单卡朗读，从它开始连播，而不是跳回第一张
    const activeIndex = visibleCards.findIndex((card) => card.id === speech.activeCardId);
    speech.playGroup(visibleCards, activeIndex > 0 ? activeIndex : 0);
  };

  const handlePickLayer = (key: string) => {
    // 切换分组时停掉正在朗读的队列，避免「看着 A 组、耳朵在听 B 组」
    speech.stop();
    setActiveLayer(key);
  };

  const renderNavButton = (key: string, label: string, count: number) => {
    const active = activeLayer === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => handlePickLayer(key)}
        aria-pressed={active}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left whitespace-nowrap text-xs font-semibold transition-colors cursor-pointer shrink-0 lg:w-full ${
          active
            ? 'bg-slate-900 dark:bg-slate-700 border-slate-900 dark:border-slate-600 text-white shadow-xs'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <span className="truncate">{label}</span>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] ${
            active
              ? 'bg-white/15 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Banner：模块定位 + 数据规模 + 语音能力提示 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-1.5">
              <Headphones className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>知识点体系通关 · 语音随身听</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              资料分析 · {loading ? '知识卡' : `${cards.length} 张知识卡`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              按「〇认知层 → 一材料阅读 → 二速算 → … → 八特殊考点」九层推进。每张卡包含定义、拆解、记忆口诀与易错陷阱；
              可单张朗读，也可连续播放本组，通勤、排队时闭眼磨耳朵。
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold">
              {loading ? '加载中…' : `${cards.length} 张卡 · ${groups.length} 个层级`}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                speech.supported
                  ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              {speech.supported ? '本机语音已就绪' : '当前浏览器不支持语音'}
            </span>
          </div>
        </div>

        {!speech.supported && (
          <p className="mt-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-700/70 rounded-lg px-3 py-2">
            当前浏览器没有 SpeechSynthesis 接口，卡片文字仍可正常阅读；换用 Chrome / Edge / Safari 即可调起语音朗读。
          </p>
        )}
        {speech.error && (
          <p className="mt-3 text-xs leading-relaxed text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700/70 rounded-lg px-3 py-2">
            {speech.error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* 左：层级导航（窄屏为横向滑动条，宽屏为左侧粘性列表） */}
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-2 px-1">
              <Layers className="w-3.5 h-3.5" />
              体系导航
            </div>
            <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
              {renderNavButton('all', '全部层级', cards.length)}
              {groups.map((group) => renderNavButton(group.label, group.label, group.cards.length))}
            </div>
          </div>
        </aside>

        {/* 右：卡片列表（窄屏单列） */}
        <section className="lg:col-span-9 space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/80 px-3 py-2.5 shadow-xs">
            <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
              {scopeName}
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{visibleCards.length} 张</span>
              {speech.groupPlaying && speech.position && speech.activeCardId && (
                <span className="ml-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                  正在播放 {speech.position.index + 1}/{speech.position.total}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleGroupToggle}
              disabled={!speech.supported || visibleCards.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                speech.groupPlaying
                  ? 'bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:border-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400'
                  : 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              {groupButtonLabel}
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在加载知识卡片…
            </div>
          )}

          {!loading && error && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-700/70 px-4 py-6 text-center space-y-3">
              <AlertTriangle className="w-6 h-6 mx-auto text-amber-500 dark:text-amber-400" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">知识卡片加载失败</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重新加载
              </button>
            </div>
          )}

          {!loading && !error && visibleCards.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              <BookOpen className="w-5 h-5 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
              本组暂无卡片
            </div>
          )}

          {!loading && !error && visibleCards.map((card) => (
            <KnowledgeCardView key={card.id} card={card} speech={speech} />
          ))}
        </section>
      </div>
    </div>
  );
};


