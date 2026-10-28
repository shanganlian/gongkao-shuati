-- 游客数据合并：登录后一次性并入账号（错题 + 答题历史 + 已用额度）
-- 执行顺序：第 3 个（依赖 create_answer_records.sql / create_user_quota.sql / create_review_items.sql）
-- 执行方式：Supabase Dashboard -> SQL Editor -> 整段粘贴运行
--
-- 幂等：本文件可重复执行任意次，不会报 42710 / 42P07 / 42P13 等错误。
--   * 依赖表 review_items：不存在则补建，存在则跳过（策略先 DROP 再 CREATE）
--   * 函数：先 DROP FUNCTION IF EXISTS 再重建
--
-- 幂等性：错题用 (user_id, question_id) 去重；答题记录用
-- (user_id, question_id, answered_on) 去重，重复调用不会产生重复数据。
-- 防刷：错题最多 200 条、历史最多 200 条、日期只接受最近 30 天、
-- 游客已用额度最多计入 10 题。

-- ============================================
-- 0. 依赖兜底：review_items（与 create_review_items.sql 结构一致）
--    已存在时 CREATE TABLE 跳过，策略按同名先删后建，保证可重跑
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.review_items'::regclass
       AND c.contype IN ('u', 'p')
       AND (
         SELECT array_agg(a.attname::TEXT ORDER BY a.attname)
           FROM unnest(c.conkey) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       ) = ARRAY['question_id', 'user_id']
  ) THEN
    CREATE UNIQUE INDEX review_items_user_question_uidx
      ON public.review_items(user_id, question_id);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '[跳过] review_items 唯一索引未创建（表内可能存在重复数据）：%', SQLERRM;
END $$;

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

-- 幂等：先删旧函数再重建
DROP FUNCTION IF EXISTS public.merge_guest_data(TEXT[], JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.merge_guest_data(
  p_mistake_ids TEXT[] DEFAULT '{}'::TEXT[],
  p_history JSONB DEFAULT '[]'::JSONB,
  p_used INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_date DATE := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_mistake TEXT;
  v_item JSONB;
  v_qid TEXT;
  v_day DATE;
  v_inserted INTEGER := 0;
  v_mistakes INTEGER := 0;
  v_records INTEGER := 0;
  v_add INTEGER := 0;
  v_before INTEGER := 0;
  v_after INTEGER := 0;
  v_limit INTEGER := 50;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'unauthenticated');
  END IF;

  INSERT INTO public.user_quota(user_id, quota_date, used_count, limit_count)
  VALUES (v_uid, v_date, 0, 50)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT used_count, limit_count INTO v_before, v_limit
    FROM public.user_quota
   WHERE user_id = v_uid AND quota_date = v_date
   FOR UPDATE;

  -- ---------- 1) 合并错题到复习队列 ----------
  FOR v_mistake IN
    SELECT unnest((COALESCE(p_mistake_ids, '{}'::TEXT[]))[1:200])
  LOOP
    CONTINUE WHEN v_mistake IS NULL OR length(v_mistake) = 0;

    INSERT INTO public.review_items(
      user_id, question_id, wrong_count, correct_streak, interval_days, next_review_at, mastered
    )
    VALUES (v_uid, v_mistake, 1, 0, 1, now(), false)
    ON CONFLICT (user_id, question_id) DO UPDATE
      SET wrong_count = public.review_items.wrong_count + 1,
          mastered = false;

    v_mistakes := v_mistakes + 1;
  END LOOP;

  -- ---------- 2) 合并答题历史 ----------
  IF p_history IS NOT NULL AND jsonb_typeof(p_history) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_history) LIMIT 200 LOOP
      v_qid := v_item->>'question_id';
      CONTINUE WHEN v_qid IS NULL OR length(v_qid) = 0;

      BEGIN
        v_day := COALESCE(NULLIF(v_item->>'answered_on', '')::DATE, v_date);
      EXCEPTION WHEN others THEN
        v_day := v_date;
      END;

      IF v_day > v_date THEN
        v_day := v_date;
      END IF;
      CONTINUE WHEN v_day < v_date - 30;

      INSERT INTO public.answer_records(
        user_id, question_id, selected_key, is_correct, source, answered_on, answered_at
      )
      VALUES (
        v_uid,
        v_qid,
        v_item->>'selected_key',
        CASE WHEN v_item->>'is_correct' IN ('true', 'false')
             THEN (v_item->>'is_correct')::BOOLEAN ELSE NULL END,
        'merged',
        v_day,
        now()
      )
      ON CONFLICT (user_id, question_id, answered_on) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_records := v_records + v_inserted;
    END LOOP;
  END IF;

  -- ---------- 3) 抵扣游客当天已用额度（最多 10 题） ----------
  v_add := LEAST(GREATEST(COALESCE(p_used, 0), 0), 10);

  UPDATE public.user_quota
     SET used_count = LEAST(used_count + v_add, limit_count),
         updated_at = now()
   WHERE user_id = v_uid AND quota_date = v_date
  RETURNING used_count INTO v_after;

  RETURN jsonb_build_object(
    'merged', true,
    'mistakes', v_mistakes,
    'records', v_records,
    'quota_added', v_add,
    'used', v_after,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_after, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_guest_data(TEXT[], JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_guest_data(TEXT[], JSONB, INTEGER) TO authenticated;
