-- 018_decision_logs.sql
-- TETO 1.6 可观测性：决策日志表
-- 存储每次关键判断的上下文，方便事后审计和诊断

CREATE TABLE IF NOT EXISTS decision_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id TEXT NOT NULL,       -- 如在 id-registry.ts 中定义的决策 ID
  trace_id TEXT,                   -- 关联的 trace
  span_id TEXT,                    -- 关联的 span
  decision_type TEXT NOT NULL,     -- 'item_match' | 'field_write' | 'confidence_check' | 'type_infer' | ...
  input_summary TEXT,              -- 判断输入摘要（JSON 或文本）
  output_summary TEXT,             -- 判断输出摘要
  confidence REAL,                 -- 0.0 ~ 1.0
  rule_ids TEXT[] DEFAULT '{}',    -- 触发的规则 ID 列表
  error_code TEXT,                 -- 如果决策出错
  metadata JSONB DEFAULT '{}',     -- 额外上下文
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_decision_logs_decision_id ON decision_logs(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_trace_id ON decision_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_span_id ON decision_logs(span_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_decision_type ON decision_logs(decision_type);
CREATE INDEX IF NOT EXISTS idx_decision_logs_created_at ON decision_logs(created_at);

-- RLS
ALTER TABLE decision_logs ENABLE ROW LEVEL SECURITY;

-- 通过 service_role 允许系统写入
CREATE POLICY "Service can manage all decision logs"
  ON decision_logs FOR ALL
  USING (true)
  WITH CHECK (true);
