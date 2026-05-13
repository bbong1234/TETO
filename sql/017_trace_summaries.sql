-- 017_trace_summaries.sql
-- TETO 1.6 可观测性：trace 摘要表
-- 存储每次 API 操作/管道执行的 trace 摘要
-- 自动清理：保留 7 天（通过应用层定时任务或 Supabase pg_cron）

CREATE TABLE IF NOT EXISTS trace_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id UUID,
  operation TEXT,                -- e.g. 'record_create', 'goal_compute', 'parse'
  status TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'failed' | 'partial'
  total_duration_ms INTEGER,
  span_count INTEGER DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  input_summary TEXT,
  output_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_trace_summaries_trace_id ON trace_summaries(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_user_id ON trace_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_created_at ON trace_summaries(created_at);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_status ON trace_summaries(status);

-- RLS
ALTER TABLE trace_summaries ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的 trace
CREATE POLICY "Users can view own traces"
  ON trace_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own traces"
  ON trace_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 通过 service_role 允许系统写入（无需 user_id 验证）
CREATE POLICY "Service can manage all traces"
  ON trace_summaries FOR ALL
  USING (true)
  WITH CHECK (true);
