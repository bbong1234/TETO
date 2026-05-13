-- 016_corrections.sql
-- TETO 1.6 — 用户纠错记录表
-- 每次用户修正 AI 推断字段时生成一条记录，绑定原 decision_id

CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,              -- 被修正的决策 ID，如 DEC-ITEM-xxx
  field_corrected TEXT NOT NULL,          -- 被修正的字段名，如 item_id
  old_value TEXT,                         -- 修正前的值
  new_value TEXT,                         -- 修正后的值
  corrected_by TEXT NOT NULL DEFAULT 'user', -- 'user' | 'system'
  trace_id TEXT,                          -- 关联的 trace_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_corrections_record_id ON corrections(record_id);
CREATE INDEX IF NOT EXISTS idx_corrections_decision_id ON corrections(decision_id);
CREATE INDEX IF NOT EXISTS idx_corrections_created_at ON corrections(created_at);

-- RLS
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

-- 用户只能看到自己的记录的纠错
DROP POLICY IF EXISTS corrections_user_policy ON corrections;
CREATE POLICY corrections_user_policy ON corrections
  FOR ALL
  USING (
    record_id IN (
      SELECT id FROM records WHERE user_id = auth.uid()
    )
  );
