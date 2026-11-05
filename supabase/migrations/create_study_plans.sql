-- 定制计划 v1.0：4 周计划 + 任务完成日志
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（可重复执行，幂等）
-- 说明：
--   * plan 列为完整计划 JSON（StudyPlan：planTitle/summary/weeks/totalDays/totalTasks）。
--   * 一个用户同时只有一份 active 计划；「重新定制」把旧计划置为 archived 后插新行。
--   * 完成记录按 (user_id, plan_id, task_key) 唯一，重复勾选幂等，不会重复计数。
--   * 未登录用户不写库，计划与勾选落在 localStorage（前端 studyPlanService 兜底）。

create extension if not exists "pgcrypto";

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_exam text not null check (target_exam in ('national', 'provincial')),
  exam_date date,
  daily_minutes int not null check (daily_minutes in (30, 60, 120)),
  weak_modules text[] not null default '{}',
  start_date date not null default ((now() at time zone 'Asia/Shanghai')::date),
  plan jsonb not null,
  provider text not null default 'template' check (provider in ('deepseek', 'template')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists study_plans_one_active
  on public.study_plans (user_id)
  where status = 'active';

create index if not exists study_plans_user_status_idx
  on public.study_plans (user_id, status, updated_at desc);

create table if not exists public.study_plan_task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  task_key text not null,
  task_date date not null,
  completed_on date not null default ((now() at time zone 'Asia/Shanghai')::date),
  created_at timestamptz not null default now(),
  unique (user_id, plan_id, task_key)
);

create index if not exists study_plan_task_logs_plan_idx
  on public.study_plan_task_logs (plan_id);

create index if not exists study_plan_task_logs_user_date_idx
  on public.study_plan_task_logs (user_id, task_date);

alter table public.study_plans enable row level security;
alter table public.study_plan_task_logs enable row level security;

-- study_plans：仅本人可读写
drop policy if exists "study_plans_select_own" on public.study_plans;
create policy "study_plans_select_own" on public.study_plans
  for select using (auth.uid() = user_id);

drop policy if exists "study_plans_insert_own" on public.study_plans;
create policy "study_plans_insert_own" on public.study_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "study_plans_update_own" on public.study_plans;
create policy "study_plans_update_own" on public.study_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study_plans_delete_own" on public.study_plans;
create policy "study_plans_delete_own" on public.study_plans
  for delete using (auth.uid() = user_id);

-- study_plan_task_logs：仅本人可读写
drop policy if exists "study_plan_task_logs_select_own" on public.study_plan_task_logs;
create policy "study_plan_task_logs_select_own" on public.study_plan_task_logs
  for select using (auth.uid() = user_id);

drop policy if exists "study_plan_task_logs_insert_own" on public.study_plan_task_logs;
create policy "study_plan_task_logs_insert_own" on public.study_plan_task_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "study_plan_task_logs_update_own" on public.study_plan_task_logs;
create policy "study_plan_task_logs_update_own" on public.study_plan_task_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study_plan_task_logs_delete_own" on public.study_plan_task_logs;
create policy "study_plan_task_logs_delete_own" on public.study_plan_task_logs
  for delete using (auth.uid() = user_id);

comment on table public.study_plans is '定制计划：4 周计划（plan 为 JSONB），一个用户仅一份 active';
comment on table public.study_plan_task_logs is '定制计划任务完成日志：按 plan + task_key 唯一，重复勾选幂等';
