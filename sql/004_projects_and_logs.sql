  -- 创建 projects 表
  CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,
    target_total INTEGER NOT NULL,
    current_progress INTEGER NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
  );

  -- 创建 project_logs 表
  CREATE TABLE IF NOT EXISTS public.project_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    progress_added INTEGER NOT NULL,
    progress_before INTEGER NOT NULL,
    progress_after INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
  );

  -- 为 projects 创建索引
  CREATE INDEX IF NOT EXISTS projects_user_id_idx 
    ON public.projects(user_id);

  CREATE INDEX IF NOT EXISTS projects_status_idx 
    ON public.projects(status);

  -- 为 project_logs 创建索引
  CREATE INDEX IF NOT EXISTS project_logs_project_id_idx 
    ON public.project_logs(project_id);

  CREATE INDEX IF NOT EXISTS project_logs_log_date_idx 
    ON public.project_logs(log_date);

  -- 添加注释
  COMMENT ON TABLE public.projects IS '项目表';
  COMMENT ON TABLE public.project_logs IS '项目日志表';

  COMMENT ON COLUMN public.projects.user_id IS '用户ID';
  COMMENT ON COLUMN public.projects.name IS '项目名称';
  COMMENT ON COLUMN public.projects.category IS '项目分类';
  COMMENT ON COLUMN public.projects.description IS '项目描述';
  COMMENT ON COLUMN public.projects.unit IS '单位';
  COMMENT ON COLUMN public.projects.target_total IS '目标总量';
  COMMENT ON COLUMN public.projects.current_progress IS '当前进度';
  COMMENT ON COLUMN public.projects.start_date IS '开始日期';
  COMMENT ON COLUMN public.projects.target_date IS '目标日期';
  COMMENT ON COLUMN public.projects.status IS '状态（active/paused/completed）';

  COMMENT ON COLUMN public.project_logs.project_id IS '关联项目ID';
  COMMENT ON COLUMN public.project_logs.log_date IS '日志日期';
  COMMENT ON COLUMN public.project_logs.progress_added IS '本次新增进度';
  COMMENT ON COLUMN public.project_logs.progress_before IS '更新前进度';
  COMMENT ON COLUMN public.project_logs.progress_after IS '更新后进度';
  COMMENT ON COLUMN public.project_logs.note IS '备注';
