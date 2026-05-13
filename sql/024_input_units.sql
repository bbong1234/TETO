-- 024_input_units.sql
-- TETO 1.6 — 输入单元：input 拆分后的单条候选记录
-- 每个 unit 对应将来的 1 条 record（或 null 如果 cancelled / failed）
-- 承载澄清流程的所有中间态（解析结果、待答问题、已答历史、轮次计数）

CREATE TABLE IF NOT EXISTS input_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_id UUID NOT NULL REFERENCES inputs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                                                         -- 冗余，提升 RLS 性能
  unit_index INTEGER NOT NULL DEFAULT 0,                                         -- 在原 input 中的顺序
  unit_text TEXT,                                                                -- 该单元对应的子句文本

  parsed_semantic JSONB DEFAULT '{}'::jsonb,                                     -- AI 解析结果（ParsedSemantic 形态）
  classifier_decision JSONB DEFAULT '{}'::jsonb,                                 -- {confidence, route, missing_fields, ...}
  field_ownership JSONB DEFAULT '{}'::jsonb,                                     -- {field_name: 'user'|'ai'|'rule'|'default'|'inherited'}
  confidence_overall NUMERIC(4,3),                                               -- 整体置信度 0.000~1.000

  pending_question JSONB,                                                        -- 当前待答 {field, prompt, kind, options?}
  answered_questions JSONB NOT NULL DEFAULT '[]'::jsonb,                         -- 已答列表 [{field, answer, at}]
  clarify_round INTEGER NOT NULL DEFAULT 0,                                      -- 已澄清几轮（封顶 3）
  clarify_max INTEGER NOT NULL DEFAULT 3,                                        -- 配置上限

  status TEXT NOT NULL DEFAULT 'pending_clarify'
    CHECK (status IN (
      'pending_clarify',   -- 等用户回答澄清
      'ready',             -- 解析完毕、可入库（高置信路径直达此态）
      'promoted',          -- 已生成 record
      'partial',           -- 3 轮封顶后用户选择"先这样保存"
      'cancelled',         -- 用户取消
      'failed'             -- 解析失败
    )),

  promoted_record_id UUID REFERENCES records(id) ON DELETE SET NULL,             -- 晋升后的 record id
  trace_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT input_units_clarify_round_max CHECK (clarify_round >= 0 AND clarify_round <= clarify_max + 1)
);

CREATE INDEX IF NOT EXISTS idx_input_units_input_id ON input_units(input_id);
CREATE INDEX IF NOT EXISTS idx_input_units_user_id ON input_units(user_id);
CREATE INDEX IF NOT EXISTS idx_input_units_status ON input_units(status);
CREATE INDEX IF NOT EXISTS idx_input_units_promoted_record_id
  ON input_units(promoted_record_id) WHERE promoted_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_input_units_trace_id
  ON input_units(trace_id) WHERE trace_id IS NOT NULL;

-- updated_at 触发器
CREATE OR REPLACE FUNCTION fn_input_units_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_input_units_updated_at ON input_units;
CREATE TRIGGER trg_input_units_updated_at
  BEFORE UPDATE ON input_units
  FOR EACH ROW EXECUTE FUNCTION fn_input_units_set_updated_at();

-- RLS
ALTER TABLE input_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS input_units_user_select ON input_units;
CREATE POLICY input_units_user_select ON input_units FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS input_units_user_insert ON input_units;
CREATE POLICY input_units_user_insert ON input_units FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS input_units_user_update ON input_units;
CREATE POLICY input_units_user_update ON input_units FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS input_units_user_delete ON input_units;
CREATE POLICY input_units_user_delete ON input_units FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE input_units IS 'TETO 1.6 输入单元：input 拆分后的候选记录，承载澄清流程中间态';
COMMENT ON COLUMN input_units.classifier_decision IS '路由决策 JSON：{confidence, route: "direct"|"clarify", missing_fields[], ...}';
COMMENT ON COLUMN input_units.field_ownership IS '字段归属表：每个字段标 user/ai/rule/default/inherited，给解释面板用';
COMMENT ON COLUMN input_units.pending_question IS '当前待用户回答的问题 JSON：{field, prompt, kind: "select"|"text"|"datetime"|"number", options?}';
COMMENT ON COLUMN input_units.status IS '单元生命周期：pending_clarify → ready → promoted | partial | cancelled | failed';
