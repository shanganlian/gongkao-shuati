import React, { useState, useEffect } from 'react';
import { Heart, Trash2, Send, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Note {
  id: string;
  question_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
}

interface NoteListProps {
  questionId: string;
  onRequireLogin: () => void;
}

export const NoteList: React.FC<NoteListProps> = ({ questionId, onRequireLogin }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 防灌水：1分钟内最多2条
  const canPost = (): boolean => {
    try {
      const raw = localStorage.getItem('note_recent_times');
      if (!raw) return true;
      const times: number[] = JSON.parse(raw);
      const now = Date.now();
      const recent = times.filter(t => now - t < 60000);
      return recent.length < 2;
    } catch {
      return true;
    }
  };

  const recordPostTime = () => {
    try {
      const raw = localStorage.getItem('note_recent_times');
      const times: number[] = raw ? JSON.parse(raw) : [];
      times.push(Date.now());
      localStorage.setItem('note_recent_times', JSON.stringify(times.slice(-10)));
    } catch { /* ignore */ }
  };

  // 加载笔记
  useEffect(() => {
    let cancelled = false;
    const loadNotes = async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, question_id, user_id, content, likes_count, created_at')
        .eq('question_id', questionId)
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && !cancelled) {
        setNotes(data || []);
      }
    };
    loadNotes();

    // 加载当前用户的点赞状态
    if (user) {
      supabase
        .from('note_likes')
        .select('note_id')
        .eq('user_id', user.id)
        .then(({ data }) => {
          if (!cancelled && data) {
            const map: Record<string, boolean> = {};
            data.forEach(d => { map[d.note_id] = true; });
            setLikedMap(map);
          }
        });
    }
    return () => { cancelled = true; };
  }, [questionId, user]);

  const handlePost = async () => {
    if (!user) { onRequireLogin(); return; }
    const content = newContent.trim();
    if (!content) return;
    if (content.length > 200) { setError('笔记不能超过200字'); return; }
    if (!canPost()) { setError('1分钟内最多发2条笔记，请稍后再试'); return; }

    setSubmitting(true);
    setError('');
    const { data, error } = await supabase
      .from('notes')
      .insert({ question_id: questionId, user_id: user.id, content })
      .select()
      .single();

    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else if (data) {
      setNotes(prev => [data as Note, ...prev]);
      setNewContent('');
      recordPostTime();
    }
  };

  const handleLike = async (noteId: string) => {
    if (!user) { onRequireLogin(); return; }
    const liked = likedMap[noteId];
    if (liked) {
      await supabase.from('note_likes').delete().eq('note_id', noteId).eq('user_id', user.id);
      setLikedMap(prev => ({ ...prev, [noteId]: false }));
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, likes_count: Math.max(0, n.likes_count - 1) } : n));
    } else {
      await supabase.from('note_likes').insert({ note_id: noteId, user_id: user.id });
      setLikedMap(prev => ({ ...prev, [noteId]: true }));
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, likes_count: n.likes_count + 1 } : n));
    }
  };

  const handleDelete = async (noteId: string) => {
    const { error } = await supabase.from('notes').delete().eq('id', noteId);
    if (!error) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  };

  const displayNotes = expanded ? notes : notes.slice(0, 3);

  return (
    <div className="mt-4 pt-4 border-t border-slate-200/70">
      <div className="flex items-center gap-1.5 mb-3">
        <MessageSquare className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-bold text-slate-800">考友笔记</span>
        <span className="text-xs text-slate-400">({notes.length})</span>
      </div>

      {/* 发布框 */}
      <div className="mb-3 space-y-2">
        <textarea
          value={newContent}
          onChange={e => { setNewContent(e.target.value); setError(''); }}
          onFocus={() => { if (!user) onRequireLogin(); }}
          placeholder={user ? '写下你的解题思路或踩坑经验（200字内）...' : '登录后发布考友笔记'}
          maxLength={200}
          rows={2}
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{newContent.length}/200</span>
          <button
            onClick={handlePost}
            disabled={submitting || !newContent.trim()}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            <Send className="w-3 h-3" />
            发布
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
      </div>

      {/* 笔记列表 */}
      {displayNotes.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">还没有笔记，来抢沙发吧～</p>
      ) : (
        <div className="space-y-2">
          {displayNotes.map(note => {
            const isMine = user?.id === note.user_id;
            const liked = !!likedMap[note.id];
            return (
              <div key={note.id} className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-700 leading-relaxed flex-1">{note.content}</p>
                  {isMine && (
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="text-slate-300 hover:text-rose-500 cursor-pointer shrink-0"
                      title="删除笔记"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleLike(note.id)}
                    className={`flex items-center gap-1 cursor-pointer transition-colors ${liked ? 'text-rose-500' : 'hover:text-rose-400'}`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-500' : ''}`} />
                    <span>{note.likes_count}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notes.length > 3 && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="mt-2 text-xs text-emerald-600 font-medium cursor-pointer hover:underline"
        >
          {expanded ? '收起' : `查看全部 ${notes.length} 条`}
        </button>
      )}
    </div>
  );
};
