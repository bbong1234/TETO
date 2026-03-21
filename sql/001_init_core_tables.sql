-- TETO 1.0 核心数据库表初始化
-- 文件: sql/001_init_core_tables.sql
-- 说明: 创建 6 张核心表，包含完整的约束和索引
-- 执行方式: 在 Supabase SQL Editor 中执行

-- ============================================
-- 1. profiles 表 (用户扩展信息)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'Asia/Shanghai',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- profiles 表索引
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- profiles 表注释
COMMENT ON TABLE public.profiles IS '用户扩展信息表';
COMMENT ON COLUMN public.profiles.id IS '用户ID，关联 auth.users';
COMMENT ON COLUMN public.profiles.email IS '用户邮箱';
COMMENT ON COLUMN public.profiles.display_name IS '显示名称';
COMMENT ON COLUMN public.profiles.avatar_url IS '头像URL';
COMMENT ON COLUMN public.profiles.timezone IS '时区';

-- ============================================
-- 2. daily_records 表 (每日记录)
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  note TEXT,
  total_score INTEGER,
  completion_rate INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- daily_records 唯一约束：每个用户每天只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS daily_records_user_date_idx 
  ON public.daily_records(user_id, record_date);

-- daily_records 表注释
COMMENT ON TABLE public.daily_records IS '每日记录表';
COMMENT ON COLUMN public.daily_records.user_id IS '用户ID';
COMMENT ON COLUMN public.daily_records.record_date IS '记录日期';
COMMENT ON COLUMN public.daily_records.note IS '备注';
COMMENT ON COLUMN public.daily_records.total_score IS '总分';
COMMENT ON COLUMN public.daily_records.completion_rate IS '完成率';

-- ============================================
-- 3. daily_record_items 表 (每日记录项)
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_record_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_record_id UUID NOT NULL REFERENCES public.daily_records(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  value_number INTEGER,
  value_duration INTEGER,
  value_time TIME,
  value_text TEXT,
  unit TEXT,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- daily_record_items 唯一约束：每条记录中每个 item_key 只能出现一次
CREATE UNIQUE INDEX IF NOT EXISTS daily_record_items_record_key_idx 
  ON public.daily_record_items(daily_record_id, item_key);

-- daily_record_items 索引
CREATE INDEX IF NOT EXISTS daily_record_items_daily_record_id_idx 
  ON public.daily_record_items(daily_record_id);
CREATE INDEX IF NOT EXISTS daily_record_items_item_key_idx 
  ON public.daily_record_items(item_key);

-- daily_record_items 表注释
COMMENT ON TABLE public.daily_record_items IS '每日记录项表';
COMMENT ON COLUMN public.daily_record_items.daily_record_id IS '关联的每日记录ID';
COMMENT ON COLUMN public.daily_record_items.item_key IS '项目键名';
COMMENT ON COLUMN public.daily_record_items.item_name IS '项目名称';
COMMENT ON COLUMN public.daily_record_items.value_number IS '数值';
COMMENT ON COLUMN public.daily_record_items.value_duration IS '时长（分钟）';
COMMENT ON COLUMN public.daily_record_items.value_time IS '时间点';
COMMENT ON COLUMN public.daily_record_items.value_text IS '文本值';
COMMENT ON COLUMN public.daily_record_items.unit IS '单位';
COMMENT ON COLUMN public.daily_record_items.sort_order IS '排序顺序';

-- ============================================
-- 4. diary_reviews 表 (日记复盘)
-- ============================================
CREATE TABLE IF NOT EXISTS public.diary_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  did_what TEXT,
  planned_what TEXT,
  completion_rate INTEGER,
  status_label TEXT,
  emotion_label TEXT,
  biggest_progress TEXT,
  biggest_problem TEXT,
  tomorrow_plan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- diary_reviews 唯一约束：每个用户每天只有一条复盘记录
CREATE UNIQUE INDEX IF NOT EXISTS diary_reviews_user_date_idx 
  ON public.diary_reviews(user_id, review_date);

-- diary_reviews 表注释
COMMENT ON TABLE public.diary_reviews IS '日记复盘表';
COMMENT ON COLUMN public.diary_reviews.user_id IS '用户ID';
COMMENT ON COLUMN public.diary_reviews.review_date IS '复盘日期';
COMMENT ON COLUMN public.diary_reviews.did_what IS '今天做了什么';
COMMENT ON COLUMN public.diary_reviews.planned_what IS '原本计划做什么';
COMMENT ON COLUMN public.diary_reviews.completion_rate IS '完成度（0-100）';
COMMENT ON COLUMN public.diary_reviews.status_label IS '今日状态';
COMMENT ON COLUMN public.diary_reviews.emotion_label IS '今日情绪';
COMMENT ON COLUMN public.diary_reviews.biggest_progress IS '今天最重要的推进';
COMMENT ON COLUMN public.diary_reviews.biggest_problem IS '今天最大的问题';
COMMENT ON COLUMN public.diary_reviews.tomorrow_plan IS '明日计划';

-- ============================================
-- 5. projects 表 (项目)
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- projects 索引
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects(status);

-- projects 表注释
COMMENT ON TABLE public.projects IS '项目表';
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

-- ============================================
-- 6. project_logs 表 (项目日志)
-- ============================================
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

-- project_logs 索引
CREATE INDEX IF NOT EXISTS project_logs_project_id_idx ON public.project_logs(project_id);
CREATE INDEX IF NOT EXISTS project_logs_log_date_idx ON public.project_logs(log_date);
