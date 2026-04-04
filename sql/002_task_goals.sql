-- 创建任务目标值表
CREATE TABLE IF NOT EXISTS public.task_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID NOT NULL,
  goal_value DECIMAL(10, 2) NOT NULL,
  period VARCHAR(20) NOT NULL CHECK (period IN ('day', 'week', 'month', 'year', 'custom')),
  custom_period_days INTEGER,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES public.task_definitions(id) ON DELETE CASCADE,
  UNIQUE(user_id, task_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_goals_user_id ON public.task_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_task_goals_task_id ON public.task_goals(task_id);

-- 启用行级安全策略
ALTER TABLE public.task_goals ENABLE ROW LEVEL SECURITY;

-- 创建行级安全策略
CREATE POLICY "Users can view their own task goals" ON public.task_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own task goals" ON public.task_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own task goals" ON public.task_goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own task goals" ON public.task_goals
  FOR DELETE USING (auth.uid() = user_id);
