import React, { useState } from 'react';
import { 
  Users, 
  Heart, 
  Send, 
  CheckCircle2, 
  Award, 
  Calendar, 
  Sparkles, 
  MessageSquare, 
  Flame, 
  Share2 
} from 'lucide-react';
import { CommunityPost } from '../types';
import { MOCK_COMMUNITY_POSTS } from '../data/mockData';

interface CommunityCheckInProps {
  streakDays: number;
  totalQuestions: number;
  onCheckInSuccess: () => void;
}

export const CommunityCheckIn: React.FC<CommunityCheckInProps> = ({
  streakDays,
  totalQuestions,
  onCheckInSuccess
}) => {
  const [posts, setPosts] = useState<CommunityPost[]>(MOCK_COMMUNITY_POSTS);
  const [newContent, setNewContent] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('按部就班就是伟大');
  const [hasCheckedInToday, setHasCheckedInToday] = useState<boolean>(false);

  const availableTags = [
    '按部就班就是伟大',
    '每日两题晨练',
    '不内卷只超越自己',
    '今日刷题心得',
    '结构化面试复盘',
    '申论大作文思维'
  ];

  const handleCheer = (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const nextCheered = !p.hasCheered;
        return {
          ...p,
          hasCheered: nextCheered,
          cheerCount: nextCheered ? p.cheerCount + 1 : p.cheerCount - 1
        };
      }
      return p;
    }));
  };

  const handleSubmitPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const newPost: CommunityPost = {
      id: `post-${Date.now()}`,
      author: '公考同行者',
      avatar: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
      archetype: '基层实干破局者',
      timeAgo: '刚刚',
      streakDays: streakDays + 1,
      todayQuestionsDone: 15,
      content: newContent,
      tags: [selectedTag, '按部就班就是伟大'],
      cheerCount: 1,
      hasCheered: true
    };

    setPosts([newPost, ...posts]);
    setNewContent('');
    setHasCheckedInToday(true);
    onCheckInSuccess();
  };

  // Generate 28-day streak heatmap blocks
  const daysInMonth = Array.from({ length: 28 }, (_, i) => {
    const isCompleted = i < streakDays % 28 || i === 27;
    return { day: i + 1, active: isCompleted };
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-semibold mb-1.5">
            <Award className="w-3.5 h-3.5 text-amber-600" />
            <span>备考轨迹 · 社区互勉墙</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            按部就班日拱一卒 · 拒绝内卷焦虑
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            记录下每天哪怕两道题的收获。这里不比谁起得更早、谁刷得更多，只记录每一个平凡日子的稳健前行。
          </p>
        </div>

        {/* User stats badge */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg font-mono">
            {streakDays}
          </div>
          <div className="text-xs">
            <span className="text-slate-400 block text-[11px]">连续按部就班</span>
            <strong className="text-slate-900 font-bold block">{streakDays} 天坚持</strong>
          </div>
        </div>
      </div>

      {/* Trajectory Heatmap Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-900">近 28 日备战轨迹</span>
          </div>
          <span className="text-slate-400 text-[11px]">按部就班即可点亮绿格</span>
        </div>

        {/* 28 Day Grid */}
        <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 pt-1">
          {daysInMonth.map((d) => (
            <div
              key={d.day}
              className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-mono font-semibold transition-all ${
                d.active
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-400'
              }`}
              title={`第 ${d.day} 天：${d.active ? '已按部就班完成' : '待坚持'}`}
            >
              {d.day}
            </div>
          ))}
        </div>
      </div>

      {/* Publish Check-in Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">
          发布今日备考心得与轨迹
        </h3>

        <form onSubmit={handleSubmitPost} className="space-y-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="写下你今天做完两道题的心得、对某个申论观点的启发，或者给同行考友的一句共勉……"
            rows={3}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
          />

          {/* Tags */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 text-[11px]">添加标签：</span>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs ${
                  selectedTag === tag
                    ? 'bg-emerald-100 text-emerald-800 font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400">
              打卡将同时增加你专属角色的沉淀值
            </span>

            <button
              type="submit"
              disabled={!newContent.trim()}
              className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                newContent.trim()
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>发布打卡记录</span>
            </button>
          </div>
        </form>
      </div>

      {/* Community Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-bold text-slate-900">考友温暖共勉动态</span>
          <span>纯粹心得分享 · 零分数攀比</span>
        </div>

        {posts.map((post) => (
          <div
            key={post.id}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>{post.author}</span>
                    <span className="text-[11px] font-normal text-emerald-700 font-semibold">
                      · {post.archetype}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {post.timeAgo} · 坚持打卡 {post.streakDays} 天
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                今日研习 {post.todayQuestionsDone} 题
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {post.content}
            </p>

            {/* Tags */}
            <div className="flex items-center gap-2 flex-wrap">
              {post.tags.map((t, i) => (
                <span key={i} className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  #{t}
                </span>
              ))}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-400">
                “同舟共济，按部就班上岸”
              </span>

              <button
                onClick={() => handleCheer(post.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  post.hasCheered
                    ? 'bg-rose-50 text-rose-600'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${post.hasCheered ? 'fill-current' : ''}`} />
                <span>互勉致敬 ({post.cheerCount})</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
