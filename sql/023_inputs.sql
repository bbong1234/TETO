-- 023_inputs.sql
-- TETO 1.6 — 输入层：保存用户原始一句话输入
-- 作为 records 表的"上游"，承载未确认/正在澄清的中间态。
-- 任何录入入口（QuickInput / RecordEditDrawer / HistoryImport / API）都先落到这里。
--
-- 设计原则：
-- 1. inputs 是输入态，可改、可丢、可重解析，不参与统计
-- 2. records 是正式态，由 IngestPipeline 从 inputs 晋升而来
-- 3. 一个 input 可拆出多个 input_units（见 024）
--
-- 幂等：可重复执行。

CREATE TABLE IF NOT EXISTS inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,                                                       -- 用户原始输入文本
  source TEXT NOT NULL DEFAULT 'quick'
    CHECK (source IN ('quick','edit','import','api')),                           -- 输入入口
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',         -- 刚收到，待解析
      'clarifying',      -- 在澄清流程中
      'completed',       -- 已全部生成 records
      'partial',         -- 3 轮封顶但仍部分入库
      'failed',          -- 解析全部失败
      'cancelled'        -- 用户取消
    )),
  trace_id TEXT,                                                                 -- 关联的 trace
  batch_id TEXT,                                                                 -- CSV 批量导入归属
  total_units INTEGER NOT NULL DEFAULT 0,                                        -- 拆分出几个 unit
  promoted_record_count INTEGER NOT NULL DEFAULT 0,                              -- 已晋升 record 数
  metadata JSONB DEFAULT '{}'::jsonb,                                            -- 自由扩展（输入设备、CSV 行号等）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inputs_user_id ON inputs(user_id);
CREATE INDEX IF NOT EXISTS idx_inputs_status ON inputs(status);
CREATE INDEX IF NOT EXISTS idx_inputs_trace_id ON inputs(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inputs_batch_id ON inputs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inputs_created_at ON inputs(created_at DESC);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION fn_inputs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inputs_updated_at ON inputs;
CREATE TRIGGER trg_inputs_updated_at
  BEFORE UPDATE ON inputs
  FOR EACH ROW EXECUTE FUNCTION fn_inputs_set_updated_at();

-- RLS：用户只能管理自己的 inputs
ALTER TABLE inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inputs_user_select ON inputs;
CREATE POLICY inputs_user_select ON inputs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS inputs_user_insert ON inputs;
CREATE POLICY inputs_user_insert ON inputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS inputs_user_update ON inputs;
CREATE POLICY inputs_user_update ON inputs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS inputs_user_delete ON inputs;
CREATE POLICY inputs_user_delete ON inputs FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE inputs IS 'TETO 1.6 输入层：用户原始输入的容器，可承载未确认/澄清中状态';
COMMENT ON COLUMN inputs.raw_input IS '用户原始一句话输入';
COMMENT ON COLUMN inputs.source IS '输入来源：quick=快速输入, edit=编辑抽屉, import=CSV 导入, api=外部接口';
COMMENT ON COLUMN inputs.status IS '生命周期：pending → clarifying → completed/partial/failed/cancelled';
