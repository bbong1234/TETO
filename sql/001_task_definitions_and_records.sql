-- 创建任务定义表
CREATE TABLE IF NOT EXISTS public.task_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('boolean', 'count', 'number')),
  unit_name VARCHAR(50) NOT NULL,
  include_in_stats BOOLEAN DEFAULT true,
  include_in_completion BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- 创建任务日记录表
CREATE TABLE IF NOT EXISTS public.task_daily_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID NOT NULL,
  record_date DATE NOT NULL,
  value_boolean BOOLEAN,
  value_number DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES public.task_definitions(id) ON DELETE CASCADE,
  UNIQUE(user_id, task_id, record_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_definitions_user_id ON public.task_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_definitions_status ON public.task_definitions(status);
CREATE INDEX IF NOT EXISTS idx_task_daily_records_user_id ON public.task_daily_records(user_id);
CREATE INDEX IF NOT EXISTS idx_task_daily_records_task_id ON public.task_daily_records(task_id);
CREATE INDEX IF NOT EXISTS idx_task_daily_records_record_date ON public.task_daily_records(record_date);

-- 启用行级安全策略
ALTER TABLE public.task_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_daily_records ENABLE ROW LEVEL SECURITY;

-- 创建行级安全策略
CREATE POLICY "Users can view their own tasks" ON public.task_definitions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks" ON public.task_definitions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" ON public.task_definitions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" ON public.task_definitions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own task records" ON public.task_daily_records
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own task records" ON public.task_daily_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own task records" ON public.task_daily_records
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own task records" ON public.task_daily_records
  FOR DELETE USING (auth.uid() = user_id);
