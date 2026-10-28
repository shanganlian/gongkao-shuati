-- 每日刷题额度：user_quota 表 + 原子扣减函数
-- 执行顺序：第 2 个（依赖 create_answer_records.sql）
-- 执行方式：Supabase Dashboard -> SQL Editor -> 整段粘贴运行
--
-- 幂等：本文件可重复执行任意次，不会报 42710 / 42P07 / 42P13 等错误。
--   * 表 / 索引：CREATE ... IF NOT EXISTS
--   * 策略：先 DROP POLICY IF EXISTS 再 CREATE
--   * 函数：先 DROP FUNCTION IF EXISTS 再重建
--
-- 规则：
--   * 游客 10 题/日（前端 localStorage 计数，登录后由 merge_guest_data 合并）
--   * 登录用户 50 题/日，按 Asia/Shanghai 自然日重置
--   * 同一天同一道题重复作答不重复扣额度
--   * 扣额度与写答题记录在同一个函数里完成，避免"扣了没记 / 记了没扣"

CREATE TABLE IF NOT EXISTS public.user_quota (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  limit_count INTEGER NOT NULL DEFAULT 50 CHECK (limit_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quota_date)
);

CREATE INDEX IF NOT EXISTS idx_user_quota_date ON public.user_quota(quota_date);

ALTER TABLE public.user_quota ENABLE ROW LEVEL SECURITY;

-- 只允许本人查看自己的额度，写入只能通过下面的函数
DROP POLICY IF EXISTS "quota_select_own" ON public.user_quota;
CREATE POLICY "quota_select_own" ON public.user_quota
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_quota FROM anon, authenticated;
REVOKE ALL ON public.user_quota FROM anon;
GRANT SELECT ON public.user_quota TO authenticated;

-- 兜底：旧表若缺 (user_id, quota_date) 主键/唯一约束，ON CONFLICT 会报 42P10。
-- 检测到缺失才补唯一索引，已存在则完全跳过。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.user_quota'::regclass
       AND c.contype IN ('u', 'p')
       AND (
         SELECT array_agg(a.attname::TEXT ORDER BY a.attname)
           FROM unnest(c.conkey) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       ) = ARRAY['quota_date', 'user_id']
  ) THEN
    CREATE UNIQUE INDEX user_quota_user_date_uidx
      ON public.user_quota(user_id, quota_date);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '[跳过] user_quota 唯一索引未创建（表内可能存在重复数据）：%', SQLERRM;
END $$;

-- ============================================
-- 0. 幂等：先删旧函数再重建
--    （旧版本若参数/返回类型不同，CREATE OR REPLACE 会直接报错）
-- ============================================
DROP FUNCTION IF EXISTS public.consume_question_quota_batch(JSONB, TEXT);
DROP FUNCTION IF EXISTS public.consume_question_quota(TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public._consume_quota_one(UUID, DATE, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.get_daily_quota();

-- ============================================
-- 1. 查询今日额度
-- ============================================
CREATE OR REPLACE FUNCTION public.get_daily_quota()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_date DATE := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_used INTEGER := 0;
  v_limit INTEGER := 50;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'used', 0, 'limit', 50, 'remaining', 0);
  END IF;

  INSERT INTO public.user_quota(user_id, quota_date, used_count, limit_count)
  VALUES (v_uid, v_date, 0, 50)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT used_count, limit_count INTO v_used, v_limit
    FROM public.user_quota
   WHERE user_id = v_uid AND quota_date = v_date;

  RETURN jsonb_build_object(
    'authenticated', true,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0)
  );
END;
$$;

-- ============================================
-- 2. 内部扣减（不校验身份，仅供下面两个函数调用）
-- ============================================
CREATE OR REPLACE FUNCTION public._consume_quota_one(
  p_uid UUID,
  p_date DATE,
  p_question_id TEXT,
  p_selected_key TEXT,
  p_is_correct BOOLEAN,
  p_source TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INTEGER := 0;
  v_limit INTEGER := 50;
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO public.user_quota(user_id, quota_date, used_count, limit_count)
  VALUES (p_uid, p_date, 0, 50)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  -- 先落答题记录：唯一键保证"同题当日只记一次、只扣一次"
  INSERT INTO public.answer_records(user_id, question_id, selected_key, is_correct, source, answered_on)
  VALUES (p_uid, p_question_id, p_selected_key, p_is_correct, COALESCE(NULLIF(p_source, ''), 'drill'), p_date)
  ON CONFLICT (user_id, question_id, answered_on) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT used_count, limit_count INTO v_used, v_limit
    FROM public.user_quota
   WHERE user_id = p_uid AND quota_date = p_date
   FOR UPDATE;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object(
      'allowed', true, 'charged', false,
      'used', v_used, 'limit', v_limit, 'remaining', GREATEST(v_limit - v_used, 0)
    );
  END IF;

  IF v_used >= v_limit THEN
    -- 额度已满：撤回刚写入的记录，避免"没扣额度却留下答题记录"
    DELETE FROM public.answer_records
     WHERE user_id = p_uid AND question_id = p_question_id AND answered_on = p_date;

    RETURN jsonb_build_object(
      'allowed', false, 'charged', false, 'reason', 'quota_exhausted',
      'used', v_used, 'limit', v_limit, 'remaining', 0
    );
  END IF;

  UPDATE public.user_quota
     SET used_count = used_count + 1, updated_at = now()
   WHERE user_id = p_uid AND quota_date = p_date
  RETURNING used_count INTO v_used;

  RETURN jsonb_build_object(
    'allowed', true, 'charged', true,
    'used', v_used, 'limit', v_limit, 'remaining', GREATEST(v_limit - v_used, 0)
  );
END;
$$;

-- ============================================
-- 3. 单题扣减（刷题 / 错题复习调用）
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_question_quota(
  p_question_id TEXT,
  p_selected_key TEXT DEFAULT NULL,
  p_is_correct BOOLEAN DEFAULT NULL,
  p_source TEXT DEFAULT 'drill'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated', 'used', 0, 'limit', 50, 'remaining', 0);
  END IF;
  IF p_question_id IS NULL OR length(p_question_id) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_question', 'used', 0, 'limit', 50, 'remaining', 0);
  END IF;

  RETURN public._consume_quota_one(
    v_uid,
    (now() AT TIME ZONE 'Asia/Shanghai')::date,
    p_question_id,
    p_selected_key,
    p_is_correct,
    p_source
  );
END;
$$;

-- ============================================
-- 4. 批量扣减（交卷时一次算清，避免 N 次往返）
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_question_quota_batch(
  p_items JSONB,
  p_source TEXT DEFAULT 'paper'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_date DATE := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_item JSONB;
  v_res JSONB;
  v_charged INTEGER := 0;
  v_blocked INTEGER := 0;
  v_allowed_ids TEXT[] := '{}'::TEXT[];
  v_blocked_ids TEXT[] := '{}'::TEXT[];
  v_used INTEGER := 0;
  v_limit INTEGER := 50;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_items');
  END IF;
  IF jsonb_array_length(p_items) > 120 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_items');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'question_id' IS NULL OR length(v_item->>'question_id') = 0 THEN
      CONTINUE;
    END IF;

    v_res := public._consume_quota_one(
      v_uid,
      v_date,
      v_item->>'question_id',
      v_item->>'selected_key',
      NULLIF(v_item->>'is_correct', '')::BOOLEAN,
      COALESCE(NULLIF(v_item->>'source', ''), p_source)
    );

    IF (v_res->>'allowed')::BOOLEAN THEN
      IF (v_res->>'charged')::BOOLEAN THEN
        v_charged := v_charged + 1;
      END IF;
      v_allowed_ids := array_append(v_allowed_ids, v_item->>'question_id');
    ELSE
      v_blocked := v_blocked + 1;
      v_blocked_ids := array_append(v_blocked_ids, v_item->>'question_id');
    END IF;
  END LOOP;

  INSERT INTO public.user_quota(user_id, quota_date, used_count, limit_count)
  VALUES (v_uid, v_date, 0, 50)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT used_count, limit_count INTO v_used, v_limit
    FROM public.user_quota
   WHERE user_id = v_uid AND quota_date = v_date;

  RETURN jsonb_build_object(
    'allowed', v_blocked = 0,
    'charged', v_charged,
    'blocked', v_blocked,
    'allowed_ids', to_jsonb(v_allowed_ids),
    'blocked_ids', to_jsonb(v_blocked_ids),
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0)
  );
END;
$$;

-- ============================================
-- 5. 权限收敛：只有登录用户能调用
-- ============================================
REVOKE ALL ON FUNCTION public.get_daily_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_quota() TO authenticated;

REVOKE ALL ON FUNCTION public._consume_quota_one(UUID, DATE, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
-- 内部函数不直接授权：只由上面的 SECURITY DEFINER 包装函数调用


REVOKE ALL ON FUNCTION public.consume_question_quota(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_question_quota(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_question_quota_batch(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_question_quota_batch(JSONB, TEXT) TO authenticated;

