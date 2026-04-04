-- TETO 1.0 核心表 RLS 安全策略配置
-- 文件: sql/002_enable_rls_core_tables.sql
-- 说明: 为 6 张核心表启用行级安全策略，确保用户只能访问自己的数据
-- 执行方式: 在 Supabase SQL Editor 中执行

-- ============================================
-- 1. profiles 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（避免重复错误）
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

-- SELECT 策略：只能查看自己的 profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- INSERT 策略：只能插入自己的 profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- UPDATE 策略：只能更新自己的 profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE 策略：只能删除自己的 profile
CREATE POLICY "Users can delete own profile"
  ON public.profiles
  FOR DELETE
  USING (id = auth.uid());

-- ============================================
-- 2. daily_records 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.daily_records ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Users can view own daily records" ON public.daily_records;
DROP POLICY IF EXISTS "Users can insert own daily records" ON public.daily_records;
DROP POLICY IF EXISTS "Users can update own daily records" ON public.daily_records;
DROP POLICY IF EXISTS "Users can delete own daily records" ON public.daily_records;

-- SELECT 策略
CREATE POLICY "Users can view own daily records"
  ON public.daily_records
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT 策略
CREATE POLICY "Users can insert own daily records"
  ON public.daily_records
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE 策略
CREATE POLICY "Users can update own daily records"
  ON public.daily_records
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE 策略
CREATE POLICY "Users can delete own daily records"
  ON public.daily_records
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 3. daily_record_items 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.daily_record_items ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Users can view own daily record items" ON public.daily_record_items;
DROP POLICY IF EXISTS "Users can insert own daily record items" ON public.daily_record_items;
DROP POLICY IF EXISTS "Users can update own daily record items" ON public.daily_record_items;
DROP POLICY IF EXISTS "Users can delete own daily record items" ON public.daily_record_items;

-- SELECT 策略：通过 daily_records 间接验证
CREATE POLICY "Users can view own daily record items"
  ON public.daily_record_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_records
      WHERE daily_records.id = daily_record_items.daily_record_id
      AND daily_records.user_id = auth.uid()
    )
  );

-- INSERT 策略
CREATE POLICY "Users can insert own daily record items"
  ON public.daily_record_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_records
      WHERE daily_records.id = daily_record_items.daily_record_id
      AND daily_records.user_id = auth.uid()
    )
  );

-- UPDATE 策略
CREATE POLICY "Users can update own daily record items"
  ON public.daily_record_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_records
      WHERE daily_records.id = daily_record_items.daily_record_id
      AND daily_records.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_records
      WHERE daily_records.id = daily_record_items.daily_record_id
      AND daily_records.user_id = auth.uid()
    )
  );

-- DELETE 策略
CREATE POLICY "Users can delete own daily record items"
  ON public.daily_record_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_records
      WHERE daily_records.id = daily_record_items.daily_record_id
      AND daily_records.user_id = auth.uid()
    )
  );

-- ============================================
-- 4. diary_reviews 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.diary_reviews ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Users can view own diary reviews" ON public.diary_reviews;
DROP POLICY IF EXISTS "Users can insert own diary reviews" ON public.diary_reviews;
DROP POLICY IF EXISTS "Users can update own diary reviews" ON public.diary_reviews;
DROP POLICY IF EXISTS "Users can delete own diary reviews" ON public.diary_reviews;

-- SELECT 策略
CREATE POLICY "Users can view own diary reviews"
  ON public.diary_reviews
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT 策略
CREATE POLICY "Users can insert own diary reviews"
  ON public.diary_reviews
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE 策略
CREATE POLICY "Users can update own diary reviews"
  ON public.diary_reviews
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE 策略
CREATE POLICY "Users can delete own diary reviews"
  ON public.diary_reviews
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 5. projects 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

-- SELECT 策略
CREATE POLICY "Users can view own projects"
  ON public.projects
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT 策略
CREATE POLICY "Users can insert own projects"
  ON public.projects
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE 策略
CREATE POLICY "Users can update own projects"
  ON public.projects
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE 策略
CREATE POLICY "Users can delete own projects"
  ON public.projects
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 6. project_logs 表 RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE public.project_logs ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略
DROP POLICY IF EXISTS "Users can view own project logs" ON public.project_logs;
DROP POLICY IF EXISTS "Users can insert own project logs" ON public.project_logs;
DROP POLICY IF EXISTS "Users can update own project logs" ON public.project_logs;
DROP POLICY IF EXISTS "Users can delete own project logs" ON public.project_logs;

-- SELECT 策略：通过 projects 表间接验证
CREATE POLICY "Users can view own project logs"
  ON public.project_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- INSERT 策略
CREATE POLICY "Users can insert own project logs"
  ON public.project_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- UPDATE 策略
CREATE POLICY "Users can update own project logs"
  ON public.project_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- DELETE 策略
CREATE POLICY "Users can delete own project logs"
  ON public.project_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- ============================================
-- 完成提示
-- ============================================
SELECT 'RLS 策略配置完成！已为 6 张核心表启用行级安全策略。' AS status;
