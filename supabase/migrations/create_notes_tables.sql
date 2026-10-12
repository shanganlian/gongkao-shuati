-- 考友笔记功能：notes 表 + note_likes 表 + RLS + 点赞数同步触发器

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. notes 表：考友笔记
-- ============================================
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 200),
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按题目查询、按用户查询
CREATE INDEX IF NOT EXISTS idx_notes_question_id ON public.notes(question_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);

-- ============================================
-- 2. note_likes 表：点赞记录（实现一人一赞）
-- ============================================
CREATE TABLE IF NOT EXISTS public.note_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_likes_note_id ON public.note_likes(note_id);
CREATE INDEX IF NOT EXISTS idx_note_likes_user_id ON public.note_likes(user_id);

-- ============================================
-- 3. RLS 行级安全
-- ============================================
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_likes ENABLE ROW LEVEL SECURITY;

-- notes: 所有人可读
CREATE POLICY "notes_select_all" ON public.notes
  FOR SELECT USING (true);

-- notes: 登录用户只能以自己身份发布
CREATE POLICY "notes_insert_own" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- notes: 只能删除自己的笔记
CREATE POLICY "notes_delete_own" ON public.notes
  FOR DELETE USING (auth.uid() = user_id);

-- note_likes: 所有人可读
CREATE POLICY "note_likes_select_all" ON public.note_likes
  FOR SELECT USING (true);

-- note_likes: 登录用户才能点赞
CREATE POLICY "note_likes_insert_own" ON public.note_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- note_likes: 可取消自己的赞
CREATE POLICY "note_likes_delete_own" ON public.note_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 4. 触发器：note_likes 增删时同步 notes.likes_count
-- ============================================
CREATE OR REPLACE FUNCTION public.update_note_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.notes SET likes_count = likes_count + 1 WHERE id = NEW.note_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.notes SET likes_count = likes_count - 1 WHERE id = OLD.note_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_note_likes_count ON public.note_likes;
CREATE TRIGGER trg_note_likes_count
  AFTER INSERT OR DELETE ON public.note_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_note_likes_count();
