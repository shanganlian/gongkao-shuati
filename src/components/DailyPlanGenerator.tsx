import React, { useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  RotateCcw, 
  Layers, 
  BookOpen, 
  Mic, 
  Headphones,
  Award,
  Send,
  HelpCircle
} from 'lucide-react';
import { DailyStudyPlan } from '../types';
import { generateDailyStudyPlan } from '../services/aiService';

interface DailyPlanGeneratorProps {
  onNavigateTab: (tab: string) => void;
  onPlanTaskCompleted: () => void;
}

export const DailyPlanGenerator: React.FC<DailyPlanGeneratorProps> = ({
  onNavigateTab,
  onPlanTaskCompleted
}) => {
  // Input form state
  const [userProfile, setUserProfile] = useState<string>('在职上班族（碎片时间为主）');
  const [availableHours, setAvailableHours] = useState<string>('2.5小时（通勤0.5h + 晚间2h）');
  const [weakPoints, setWeakPoints] = useState<string>('申论动笔没词、面试容易紧张不敢开口、行测数量资料较慢');
  const [targetExam, setTargetExam] = useState<string>('2026省考基层综合管理岗');
  const [additionalNotes, setAdditionalNotes] = useState<string>('平时工作较忙，希望战线拉长一点，每天坚持两道题练思维，不盲目刷题，避免后期面试不敢说。');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activePlan, setActivePlan] = useState<DailyStudyPlan | null>({
    planTitle: '2026省考基层综合管理岗 · 每日长线思维专属计划',
    philosophy: '申论与面试本质上是成年人公职思维方式的塑造，短期突击极难改变。战线拉长，把“每日思维两题”与“睡前两分钟镜头自录”融入日常，按部就班就是伟大。',
    dailyTimeBudget: '2.5小时（含通勤碎片）',
    scheduleBlocks: [
      {
        timeSlot: '早晨晨间 (20分钟)',
        taskName: '每日思维两题 · 申论与行测晨练',
        moduleType: '申论立论 + 言语/逻辑',
        goal: '结合最新基层治理政策，先列大纲再看考官解构，不期速成',
        estimatedMinutes: 20,
        isCompleted: true
      },
      {
        timeSlot: '通勤碎片 (25分钟)',
        taskName: '知识点通关秘籍 · 语音磨耳朵',
        moduleType: '资料分析速算口诀 / 行政法要点',
        goal: '地铁/公交上闭目听学，脑海同步构建两期比重与法律边界思维树',
        estimatedMinutes: 25,
        isCompleted: true
      },
      {
        timeSlot: '晚间专注 (50分钟)',
        taskName: '笔试专项真题精练 (10-15题)',
        moduleType: '数量关系赋值法 & 资料速算',
        goal: '不比做题数量，重在每做一道题彻底弄懂命题切入点并收录错题本',
        estimatedMinutes: 50,
        isCompleted: false
      },
      {
        timeSlot: '睡前突破 (25分钟)',
        taskName: '面试平台开口对练 (自录视频复盘)',
        moduleType: '结构化综合分析 / 无领导破冰',
        goal: '打开摄像头录制一段2分钟的个人作答，直视镜头消除胆怯，观看回放小动作',
        estimatedMinutes: 25,
        isCompleted: false
      }
    ],
    weeklyMilestones: [
      '第1周：养成每天开口说一段公职分析的习惯，消除镜头胆怯与卡顿',
      '第2周：行测资料分析稳固速算模型，正确率稳在80%以上',
      '第3周：申论大作文五段三分法形成本能，破题不慌'
    ],
    mindsetQuote: '“按部就班就是伟大。不看别人的分数，专注自己的每一步，日拱一卒，功不唐捐。”'
  });

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const generated = await generateDailyStudyPlan({
      userProfile,
      availableHours,
      weakPoints,
      targetExam,
      additionalNotes
    });

    if (generated && generated.scheduleBlocks) {
      setActivePlan(generated);
    }
    setIsLoading(false);
  };

  const toggleTaskCompletion = (index: number) => {
    if (!activePlan) return;
    const updated = { ...activePlan };
    const currentStatus = updated.scheduleBlocks[index].isCompleted;
    updated.scheduleBlocks[index].isCompleted = !currentStatus;
    setActivePlan(updated);

    if (!currentStatus) {
      onPlanTaskCompleted();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>智能学习规划 · 量身定制</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            根据个人情况描述 · 自动生成每日长线计划
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            输入你的作息、可用时间与当前顾虑。系统将把笔试刷题、语音听学与面试申论思维长线融入每日日程，杜绝无头苍蝇式焦虑。
          </p>
        </div>

        <button
          onClick={() => {
            const el = document.getElementById('plan-input-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer shrink-0"
        >
          重新定制我的计划
        </button>
      </div>

      {/* ACTIVE PLAN DISPLAY (If exists) */}
      {activePlan && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-semibold text-emerald-700">【专属定制执行方案】</span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {activePlan.planTitle}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">每日时间预算：</span>
              <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-mono font-semibold">
                {activePlan.dailyTimeBudget}
              </span>
            </div>
          </div>

          {/* Philosophy Box */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>长线思维培养指导哲学：</span>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed pt-1">
              {activePlan.philosophy}
            </p>
          </div>

          {/* Daily Schedule Task Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">今日执行任务清单 (点击完成打卡)</span>
              <span className="text-slate-400 font-mono">
                已达成 {activePlan.scheduleBlocks.filter(b => b.isCompleted).length} / {activePlan.scheduleBlocks.length} 项
              </span>
            </div>

            <div className="space-y-3">
              {activePlan.scheduleBlocks.map((block, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleTaskCompletion(idx)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    block.isCompleted
                      ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-500/10'
                      : 'bg-white border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <button
                      type="button"
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                        block.isCompleted ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">
                          {block.taskName}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {block.timeSlot}
                        </span>
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          {block.moduleType}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {block.goal}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <span className="text-xs font-mono text-slate-400">
                      ~{block.estimatedMinutes}分钟
                    </span>

                    {/* Quick Jump Action Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (block.taskName.includes('晨练')) onNavigateTab('daily');
                        else if (block.taskName.includes('语音') || block.taskName.includes('秘籍')) onNavigateTab('knowledge');
                        else if (block.taskName.includes('真题') || block.taskName.includes('刷题')) onNavigateTab('practice');
                        else if (block.taskName.includes('面试')) onNavigateTab('interview');
                        else onNavigateTab('practice');
                      }}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <span>前往执行</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Milestones & Anti-anxiety quote */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
              <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-600" />
                稳步进阶里程碑：
              </h5>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {activePlan.weeklyMilestones.map((m, i) => (
                  <li key={i} className="leading-relaxed">• {m}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-emerald-600 text-white rounded-xl flex flex-col justify-between shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-bold text-emerald-200">导师寄语 · 拒绝焦虑</span>
                <p className="text-xs sm:text-sm font-medium leading-relaxed pt-1">
                  {activePlan.mindsetQuote}
                </p>
              </div>
              <span className="text-[11px] text-emerald-200/80 mt-3 block">
                按部就班，每天积累一点，改变自然发生。
              </span>
            </div>
          </div>
        </div>
      )}

      {/* INPUT FORM SECTION */}
      <div id="plan-input-section" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            描述你的现状与备考条件
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            系统将据此为你量身优化时间分配，将面试与申论提早融入日程
          </p>
        </div>

        <form onSubmit={handleGeneratePlan} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* User Profile */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">当前备考身份：</label>
              <select
                value={userProfile}
                onChange={(e) => setUserProfile(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="在职上班族（碎片时间为主）">在职上班族（碎片时间为主）</option>
                <option value="应届毕业生全职备考">应届毕业生全职备考</option>
                <option value="二战/多次备考考生（突破瓶颈）">二战/多次备考考生（突破瓶颈）</option>
                <option value="宝妈/跨考零基础考生">宝妈/跨考零基础考生</option>
              </select>
            </div>

            {/* Target Exam */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">目标考试类型：</label>
              <select
                value={targetExam}
                onChange={(e) => setTargetExam(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="2026国家公务员考试（行政执法/市地综合）">2026国家公务员考试（行政执法/市地综合）</option>
                <option value="2026省公务员联考（乡镇/县级综合）">2026省公务员联考（乡镇/县级综合）</option>
                <option value="2026全国事业单位统考（综合管理A类）">2026全国事业单位统考（综合管理A类）</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Available Hours */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">每日可支配有效时间：</label>
              <input
                type="text"
                value={availableHours}
                onChange={(e) => setAvailableHours(e.target.value)}
                placeholder="例如：2小时左右、碎片时间1小时+晚间2小时"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Weak points */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">主要痛点与薄弱环节：</label>
              <input
                type="text"
                value={weakPoints}
                onChange={(e) => setWeakPoints(e.target.value)}
                placeholder="例如：申论写不出、面试容易紧张不敢开口、数量慢"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Additional Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">补充描述或个人顾虑（选填）：</label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="例如：平时工作繁重，容易被别人的高分搞得很焦虑，希望战线拉长，每天按部就班搞懂两道题，培养思维方式……"
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>AI 正在研判并生成每日计划...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>生成我的专属长线计划</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
