-- 艾宾浩斯错题复习功能：review_items 表 + RLS
-- 幂等：可重复执行（表 IF NOT EXISTS，策略先 DROP 再 CREATE）

-- ============================================
-- 1. review_items 表：错题复习队列
-- ============================================
CREATE TABLE IF NOT EXISTS public.review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 1,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  mastered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_review_items_user ON public.review_items(user_id);
CREATE INDEX IF NOT EXISTS idx_review_items_due ON public.review_items(user_id, next_review_at) WHERE mastered = false;

-- ============================================
-- 2. RLS 行级安全（复习数据私有）
-- ============================================
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_select_own" ON public.review_items;
CREATE POLICY "review_select_own" ON public.review_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_insert_own" ON public.review_items;
CREATE POLICY "review_insert_own" ON public.review_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_update_own" ON public.review_items;
CREATE POLICY "review_update_own" ON public.review_items
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_delete_own" ON public.review_items;
CREATE POLICY "review_delete_own" ON public.review_items
  FOR DELETE USING (auth.uid() = user_id);
