-- 答题历史表 + 排行榜聚合函数
-- 执行顺序：第 1 个（先于 create_user_quota.sql / merge_guest_data.sql）
-- 执行方式：Supabase Dashboard -> SQL Editor -> 整段粘贴运行
--
-- 幂等：本文件可重复执行任意次，不会报 42710 / 42P07 / 42P13 等错误。
--   * 表 / 索引：CREATE ... IF NOT EXISTS
--   * 策略：先 DROP POLICY IF EXISTS 再 CREATE
--   * 函数：先 DROP FUNCTION IF EXISTS 再重建（返回列变更时 CREATE OR REPLACE 会失败）
--
-- 设计说明：
--   1. 所有答题记录统一落在 answer_records，错题本只负责"复习节奏"。
--   2. 额度扣减与答题记录写入必须原子发生，写入入口只有
--      create_user_quota.sql 里的 SECURITY DEFINER 函数，客户端只有只读权限。
--   3. 同一用户同一天同一题只保留一条记录，重复作答不重复扣额度。

CREATE TABLE IF NOT EXISTS public.answer_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  selected_key TEXT,
  is_correct BOOLEAN,
  source TEXT NOT NULL DEFAULT 'drill',
  answered_on DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id, answered_on)
);

CREATE INDEX IF NOT EXISTS idx_answer_records_user_time
  ON public.answer_records(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_records_user_day
  ON public.answer_records(user_id, answered_on DESC);

-- 兜底：若表是旧版本手工建的、没有 (user_id, question_id, answered_on) 唯一约束，
-- 下面 ON CONFLICT 会报 42P10。这里检测到缺失才补一个唯一索引，已存在则完全跳过。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.answer_records'::regclass
       AND c.contype IN ('u', 'p')
       AND (
         SELECT array_agg(a.attname::TEXT ORDER BY a.attname)
           FROM unnest(c.conkey) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       ) = ARRAY['answered_on', 'question_id', 'user_id']
  ) THEN
    CREATE UNIQUE INDEX answer_records_user_question_day_uidx
      ON public.answer_records(user_id, question_id, answered_on);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '[跳过] answer_records 唯一索引未创建（表内可能存在重复数据）：%', SQLERRM;
END $$;

-- ============================================
-- RLS：答题历史仅本人可读
-- ============================================
ALTER TABLE public.answer_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "answer_records_select_own" ON public.answer_records;
CREATE POLICY "answer_records_select_own" ON public.answer_records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "answer_records_insert_own" ON public.answer_records;
-- 说明：不开放 INSERT / UPDATE / DELETE 策略。
-- 所有答题记录必须由 create_user_quota.sql 的 SECURITY DEFINER 函数写入，
-- 防止客户端绕过额度直接插入记录（刷排行榜 / 伪造正确率）。
REVOKE INSERT, UPDATE, DELETE ON public.answer_records FROM anon, authenticated;
REVOKE ALL ON public.answer_records FROM anon;
GRANT SELECT ON public.answer_records TO authenticated;

-- ============================================
-- 排行榜：只输出脱敏昵称与聚合数据，不暴露他人明细
-- ============================================
-- 幂等：旧版本返回列不同时 CREATE OR REPLACE 会报 42P13，先删后建
DROP FUNCTION IF EXISTS public.get_leaderboard(INTEGER);

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (rank INTEGER, nickname TEXT, answered_count BIGINT, accuracy NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT a.user_id,
           count(*)::BIGINT AS answered_count,
           round(100.0 * count(*) FILTER (WHERE a.is_correct) / GREATEST(count(*), 1), 1) AS accuracy
      FROM public.answer_records a
     GROUP BY a.user_id
  )
  SELECT (row_number() OVER (ORDER BY agg.answered_count DESC, agg.accuracy DESC))::INTEGER,
         '考生#' || substr(replace(agg.user_id::TEXT, '-', ''), 1, 4),
         agg.answered_count,
         agg.accuracy
    FROM agg
   ORDER BY agg.answered_count DESC, agg.accuracy DESC
   LIMIT GREATEST(LEAST(COALESCE(p_limit, 20), 100), 1);
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(INTEGER) TO authenticated;
