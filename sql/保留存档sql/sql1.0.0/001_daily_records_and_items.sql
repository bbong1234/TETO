-- 创建 daily_records 表
CREATE TABLE IF NOT EXISTS public.daily_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  record_date DATE NOT NULL,
  note TEXT,
  total_score INTEGER,
  completion_rate INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- 创建 daily_record_items 表
CREATE TABLE IF NOT EXISTS public.daily_record_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_record_id UUID NOT NULL REFERENCES public.daily_records(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  value_number INTEGER,
  value_duration INTEGER,
  value_time TEXT,
  value_text TEXT,
  unit TEXT,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- 创建唯一索引（确保每个用户每天只有一条记录）
CREATE UNIQUE INDEX IF NOT EXISTS daily_records_user_date_idx 
  ON public.daily_records(user_id, record_date);

-- 为 daily_record_items 创建索引
CREATE INDEX IF NOT EXISTS daily_record_items_daily_record_id_idx 
  ON public.daily_record_items(daily_record_id);

CREATE INDEX IF NOT EXISTS daily_record_items_item_key_idx 
  ON public.daily_record_items(item_key);

-- 添加注释
COMMENT ON TABLE public.daily_records IS '每日记录表';
COMMENT ON TABLE public.daily_record_items IS '每日记录项表';

COMMENT ON COLUMN public.daily_records.user_id IS '用户ID';
COMMENT ON COLUMN public.daily_records.record_date IS '记录日期';
COMMENT ON COLUMN public.daily_records.note IS '备注';
COMMENT ON COLUMN public.daily_records.total_score IS '总分';
COMMENT ON COLUMN public.daily_records.completion_rate IS '完成率';

COMMENT ON COLUMN public.daily_record_items.daily_record_id IS '关联的每日记录ID';
COMMENT ON COLUMN public.daily_record_items.item_key IS '项目键值';
COMMENT ON COLUMN public.daily_record_items.item_name IS '项目名称';
COMMENT ON COLUMN public.daily_record_items.value_number IS '数值';
COMMENT ON COLUMN public.daily_record_items.value_duration IS '时长（分钟）';
COMMENT ON COLUMN public.daily_record_items.value_time IS '时间';
COMMENT ON COLUMN public.daily_record_items.value_text IS '文本值';
COMMENT ON COLUMN public.daily_record_items.unit IS '单位';
COMMENT ON COLUMN public.daily_record_items.sort_order IS '排序';
