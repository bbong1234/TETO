-- 019_feature_flags.sql
-- TETO 1.6 功能开关机制
-- 仅服务端 service_role 可读，客户端不可直接访问

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flag_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.6 首批开关
INSERT INTO feature_flags (flag_name, enabled, description, rollout_percentage) VALUES
  ('new_parse_engine', false, 'TETO 1.6 新版解析引擎', 0),
  ('debug_trace_page', false, '调试 Trace 页面', 0),
  ('computation_v2', false, 'TETO 1.6 新版计算引擎', 0)
ON CONFLICT (flag_name) DO NOTHING;

-- RLS：客户端不可直接访问
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- 只有 service_role 可读
CREATE POLICY "Service role can read feature flags"
  ON feature_flags FOR SELECT
  USING (true);

-- 只有 service_role 可更新
CREATE POLICY "Service role can update feature flags"
  ON feature_flags FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can insert feature flags"
  ON feature_flags FOR INSERT
  WITH CHECK (true);
