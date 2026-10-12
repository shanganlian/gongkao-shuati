import React, { useState } from 'react';
import { 
  Sparkles, 
  Volume2, 
  CheckCircle2, 
  ChevronRight, 
  BookMarked, 
  Send, 
  HelpCircle, 
  Lightbulb, 
  Award,
  Layers,
  ArrowRight,
  ShieldAlert,
  Share2
} from 'lucide-react';
import { MOCK_DAILY_MINDSET } from '../data/mockData';

interface DailyMindsetProps {
  onPlayAudio: (track: { id: string; title: string; subtitle: string; textToRead: string }) => void;
  onFinishDailyTask: () => void;
}

export const DailyMindset: React.FC<DailyMindsetProps> = ({
  onPlayAudio,
  onFinishDailyTask
}) => {
  const data = MOCK_DAILY_MINDSET;
  const [activeTab, setActiveTab] = useState<'q1' | 'q2'>('q1');
  const [q1UserNotes, setQ1UserNotes] = useState<string>('');
  const [q1Submitted, setQ1Submitted] = useState<boolean>(false);
  const [showThinkingDetails, setShowThinkingDetails] = useState<boolean>(false);

  // Q2 state
  const [q2SelectedOption, setQ2SelectedOption] = useState<string | null>(null);
  const [q2Submitted, setQ2Submitted] = useState<boolean>(false);

  const [hasCompletedBoth, setHasCompletedBoth] = useState<boolean>(false);

  const handlePlayVoice = () => {
    onPlayAudio({
      id: 'daily-voice-1',
      title: '每日两题 · 思维晨练导学',
      subtitle: data.theme,
      textToRead: data.thinkingQuestion.audioExplanationText
    });
  };

  const handleSubmitQ1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q1UserNotes.trim()) return;
    setQ1Submitted(true);
    setShowThinkingDetails(true);
    checkAllDone(true, q2Submitted);
  };

  const handleSelectQ2 = (key: string) => {
    if (q2Submitted) return;
    setQ2SelectedOption(key);
  };

  const handleSubmitQ2 = () => {
    if (!q2SelectedOption) return;
    setQ2Submitted(true);
    checkAllDone(q1Submitted, true);
  };

  const checkAllDone = (done1: boolean, done2: boolean) => {
    if (done1 && done2) {
      setHasCompletedBoth(true);
      onFinishDailyTask();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Mindset Philosophy Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/60 text-emerald-200 text-xs font-semibold mb-3 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>长线思维培养计划 · 每日两题</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            “{data.goldenQuote}”
          </h2>

          <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
            申论与面试本质上是一种公职思维方式的塑造，短期突击极难蜕变。在准备初试时，每天拿两道题练手——一道申论/面试思辨题、一道行测应用题。日拱一卒，到了考场才能做到开口有条理、落笔有乾坤。
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-emerald-600/60 text-xs">
            <button
              onClick={handlePlayVoice}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-emerald-900 font-semibold hover:bg-emerald-50 transition-colors shadow-xs cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>听考官音频导读（4分钟）</span>
            </button>
            <span className="text-emerald-200/80">
              今日研习主题：{data.theme}
            </span>
          </div>
        </div>
      </div>

      {/* Segmented Tab: Question 1 vs Question 2 */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('q1')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'q1'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>第一题 · 申论与面试宏观思辨</span>
            {q1Submitted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            onClick={() => setActiveTab('q2')}
            className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'q2'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>第二题 · 行测核心真题辨析</span>
            {q2Submitted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>

        <div className="text-xs text-slate-500 hidden sm:block">
          完成度：<strong className="text-emerald-600">{(q1Submitted ? 1 : 0) + (q2Submitted ? 1 : 0)} / 2</strong>
        </div>
      </div>

      {/* QUESTION 1 CONTENT */}
      {activeTab === 'q1' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <div className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">
                {data.thinkingQuestion.title}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {data.thinkingQuestion.prompt}
              </h3>
            </div>

            {/* Background Material */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-900 block mb-1">【考情背景】：</span>
              {data.thinkingQuestion.background}
            </div>

            {/* User Input Sandbox: Record thoughts / outline */}
            <form onSubmit={handleSubmitQ1} className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  写下你的破题思考或答题大纲（即使只有两三句话也是巨大的开始）：
                </label>
                <span className="text-[11px] text-slate-400">已输入 {q1UserNotes.length} 字</span>
              </div>

              <textarea
                value={q1UserNotes}
                onChange={(e) => setQ1UserNotes(e.target.value)}
                placeholder="例如：第一步先点出基层形式主义的危害，强调政绩观错位；第二步剖析指尖减负与面对面服务的辩证关系；第三步提出数据共享、优化考核、网格服务的实招……"
                rows={4}
                className="w-full text-xs sm:text-sm p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-all placeholder:text-slate-400"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowThinkingDetails(!showThinkingDetails)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>{showThinkingDetails ? '收起官方破题框架' : '参考破题思路与金句'}</span>
                </button>

                <button
                  type="submit"
                  disabled={!q1UserNotes.trim()}
                  className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                    q1UserNotes.trim()
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{q1Submitted ? '已完成本题打卡' : '提交打卡并解锁深度解析'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Detailed Thinking Breakdown & Golden Quotes */}
          {(showThinkingDetails || q1Submitted) && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                    析
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    考官官方解构：三步破题思维链
                  </h4>
                </div>
                <span className="text-xs text-slate-400">申论立论 / 面试综合分析通用</span>
              </div>

              {/* 3 Step Thinking Chain */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.thinkingQuestion.thinkingDimensions.map((dim, idx) => (
                  <div key={idx} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-2">
                    <span className="text-xs font-bold text-emerald-800 block">
                      {dim.step}
                    </span>
                    <p className="text-xs text-slate-700 font-medium">
                      {dim.standpoint}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {dim.framework}
                    </p>
                  </div>
                ))}
              </div>

              {/* Policy Anchor */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">【政策高屋建瓴锚点】：</strong>
                  <span>{data.thinkingQuestion.policyAnchor}</span>
                </div>
              </div>

              {/* Gold Sentences */}
              <div>
                <h5 className="text-xs font-bold text-slate-900 mb-2">
                  【申论大作文与面试吸睛金句库】（可随手背诵）：
                </h5>
                <div className="space-y-2">
                  {data.thinkingQuestion.goldSentences.map((sent, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/50 text-xs text-slate-800 font-serif italic"
                    >
                      {sent}
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Step Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveTab('q2')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <span>继续练第二题（行测辨析）</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUESTION 2 CONTENT */}
      {activeTab === 'q2' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">
                【行测实战】{data.aptitudeQuestion.title}
              </span>
              <span className="text-xs text-slate-400">
                {data.aptitudeQuestion.source}
              </span>
            </div>

            <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
              {data.aptitudeQuestion.stem}
            </h3>

            {/* Options */}
            <div className="space-y-2.5 pt-2">
              {data.aptitudeQuestion.options?.map((opt) => {
                const isSelected = q2SelectedOption === opt.key;
                const isCorrect = data.aptitudeQuestion.answer === opt.key;
                let optionClasses = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700';

                if (q2Submitted) {
                  if (isCorrect) {
                    optionClasses = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-semibold';
                  } else if (isSelected && !isCorrect) {
                    optionClasses = 'border-rose-300 bg-rose-50 text-rose-900';
                  } else {
                    optionClasses = 'border-slate-200 bg-white opacity-60 text-slate-500';
                  }
                } else if (isSelected) {
                  optionClasses = 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-medium';
                }

                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSelectQ2(opt.key)}
                    className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition-all cursor-pointer ${optionClasses}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center font-bold font-mono text-xs text-slate-700 shrink-0">
                        {opt.key}
                      </span>
                      <span>{opt.text}</span>
                    </div>

                    {q2Submitted && isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Submit button */}
            {!q2Submitted && (
              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={handleSubmitQ2}
                  disabled={!q2SelectedOption}
                  className={`px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                    q2SelectedOption
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  确认提交答案
                </button>
              </div>
            )}
          </div>

          {/* Q2 Analysis & Thinking Transfer */}
          {q2Submitted && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                    q2SelectedOption === data.aptitudeQuestion.answer
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {q2SelectedOption === data.aptitudeQuestion.answer ? '回答正确！' : '遗憾答错'}
                  </span>
                  <span className="text-xs text-slate-600">
                    正确答案是：<strong className="font-bold text-slate-900">{data.aptitudeQuestion.answer}</strong>
                  </span>
                </div>
                <span className="text-xs text-slate-400">难易度：{data.aptitudeQuestion.difficulty}</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl text-xs sm:text-sm text-slate-700 leading-relaxed border border-slate-200/60">
                <strong className="text-slate-900 block mb-1">【考点精析】：</strong>
                {data.aptitudeQuestion.explanation}
              </div>

              {/* Mindset Transfer */}
              <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200/80 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>公职思维迁移：这道题如何赋能申论与面试？</span>
                </div>
                <p className="leading-relaxed">
                  {data.aptitudeQuestion.thinkingTip}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completion celebratory card if both are completed */}
      {hasCompletedBoth && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3 shadow-xs animate-in zoom-in-95 duration-300">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-emerald-950">
            今日两题思维晨练已顺利达成！
          </h3>
          <p className="text-xs sm:text-sm text-emerald-800 max-w-md mx-auto">
            按部就班就是伟大。你今天对公职思维又有了更深一步的感知。日积月累，质变自然发生。
          </p>
          <div className="pt-1">
            <span className="inline-block px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg">
              今日学习轨迹已自动记入备考数据库
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
