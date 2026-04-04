-- 创建用户页面配置表
CREATE TABLE public.user_page_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  block_order JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 创建唯一索引，确保每个用户每个页面只有一个配置
CREATE UNIQUE INDEX idx_user_page_configs_user_page ON public.user_page_configs(user_id, page_key);

-- 添加更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_page_configs_updated_at
BEFORE UPDATE ON public.user_page_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
