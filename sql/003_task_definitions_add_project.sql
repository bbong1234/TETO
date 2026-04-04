-- 向任务定义表添加项目关联字段和其他缺少的字段
ALTER TABLE public.task_definitions
  ADD COLUMN IF NOT EXISTS include_in_project BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN DEFAULT false;

-- 添加外键约束
ALTER TABLE public.task_definitions
  ADD CONSTRAINT fk_task_definitions_project_id
  FOREIGN KEY (project_id)
  REFERENCES public.projects(id)
  ON DELETE SET NULL;

-- 创建project_id索引
CREATE INDEX IF NOT EXISTS idx_task_definitions_project_id ON public.task_definitions(project_id);
