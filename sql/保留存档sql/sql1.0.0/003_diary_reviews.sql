-- 创建 diary_reviews 表
CREATE TABLE IF NOT EXISTS public.diary_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
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

-- 创建唯一索引（确保每个用户每天只有一条记录）
CREATE UNIQUE INDEX IF NOT EXISTS diary_reviews_user_date_idx 
  ON public.diary_reviews(user_id, review_date);

-- 添加注释
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
