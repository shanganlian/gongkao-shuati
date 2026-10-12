-- 知识点掌握进度：knowledge_progress 表 + RLS

CREATE TABLE IF NOT EXISTS public.knowledge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unlearned' CHECK (status IN ('unlearned', 'reviewing', 'mastered')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, knowledge_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_progress_user ON public.knowledge_progress(user_id);

-- RLS 行级安全（进度数据私有）
ALTER TABLE public.knowledge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kp_select_own" ON public.knowledge_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "kp_insert_own" ON public.knowledge_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kp_update_own" ON public.knowledge_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "kp_delete_own" ON public.knowledge_progress
  FOR DELETE USING (auth.uid() = user_id);
