-- ============================================
-- 004_add_prediction_fields_to_projects.sql
-- ============================================
-- 为 projects 表添加预测字段
-- 用于存储项目预计完成时间和剩余天数
-- ============================================

-- 添加 predicted_remaining_days 字段（预计剩余天数）
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS predicted_remaining_days INTEGER;

-- 添加 predicted_finish_date 字段（预计完成日期）
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS predicted_finish_date DATE;

-- 添加 updated_at 字段（如果不存在）
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW());

-- 添加索引以优化查询性能
CREATE INDEX IF NOT EXISTS projects_user_status_idx 
  ON public.projects(user_id, status);

-- 添加注释
COMMENT ON COLUMN public.projects.predicted_remaining_days IS '预计剩余天数';
COMMENT ON COLUMN public.projects.predicted_finish_date IS '预计完成日期';
COMMENT ON COLUMN public.projects.updated_at IS '更新时间';
