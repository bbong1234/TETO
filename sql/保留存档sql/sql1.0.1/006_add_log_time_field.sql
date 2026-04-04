-- 为 project_logs 表添加真正的日志时间字段 log_time
-- 执行时间：2026-03-22

-- 新增 log_time 字段（timestamp without time zone）
ALTER TABLE public.project_logs
  ADD COLUMN IF NOT EXISTS log_time timestamp without time zone;

-- 更新字段注释
COMMENT ON COLUMN public.project_logs.log_time IS '日志真实时间（精确到秒，用户输入的时间）';

-- 说明：
-- - log_date (date): 保留作为兼容字段，只存储日期
-- - log_time (timestamp without time zone): 新增字段，存储用户输入的完整时间（精确到秒）
-- - 新数据将使用 log_time 作为主时间字段
-- - 历史数据的 log_time 将为 NULL，log_date 保持原值
