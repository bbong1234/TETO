-- 开发环境临时禁用 RLS
-- 注意：这仅适用于开发环境，生产环境应启用 RLS

-- 禁用 daily_records 表的 RLS
ALTER TABLE IF EXISTS public.daily_records DISABLE ROW LEVEL SECURITY;

-- 禁用 daily_record_items 表的 RLS
ALTER TABLE IF EXISTS public.daily_record_items DISABLE ROW LEVEL SECURITY;

-- 禁用 diary_reviews 表的 RLS
ALTER TABLE IF EXISTS public.diary_reviews DISABLE ROW LEVEL SECURITY;

-- 禁用 projects 表的 RLS
ALTER TABLE IF EXISTS public.projects DISABLE ROW LEVEL SECURITY;

-- 禁用 project_logs 表的 RLS
ALTER TABLE IF EXISTS public.project_logs DISABLE ROW LEVEL SECURITY;

-- 查看当前 RLS 状态
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'daily_records',
    'daily_record_items',
    'diary_reviews',
    'projects',
    'project_logs'
  );
