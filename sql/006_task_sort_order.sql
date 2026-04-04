-- 为任务表添加排序字段
ALTER TABLE public.task_definitions
ADD COLUMN sort_order INTEGER DEFAULT 0;

-- 更新现有任务的排序顺序
UPDATE public.task_definitions
SET sort_order = ROW_NUMBER() OVER (ORDER BY created_at) - 1;

-- 创建索引以提高排序查询性能
CREATE INDEX idx_task_definitions_sort_order ON public.task_definitions(sort_order);
