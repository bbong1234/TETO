-- 将 project_logs.log_date 从 DATE 改为 TIMESTAMP WITH TIME ZONE，支持时分秒
-- 执行时间：2026-03-22

-- 1. 先删除旧索引
DROP INDEX IF EXISTS public.project_logs_log_date_idx;

-- 2. 修改 log_date 字段类型
ALTER TABLE public.project_logs 
  ALTER COLUMN log_date TYPE TIMESTAMP WITH TIME ZONE 
  USING log_date::timestamp with time zone;

-- 3. 重新创建索引
CREATE INDEX project_logs_log_date_idx ON public.project_logs(log_date);

-- 4. 更新字段注释
COMMENT ON COLUMN public.project_logs.log_date IS '日志日期时间（精确到秒）';
