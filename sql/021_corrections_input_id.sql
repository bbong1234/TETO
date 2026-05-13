-- 021_corrections_input_id.sql
-- TETO 1.6 — corrections 表追加 input_id 列，使纠错可追溯至原始输入

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS input_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_corrections_input_id ON corrections(input_id);

COMMENT ON COLUMN corrections.input_id IS '关联的 input_id（用户原始输入编号），用于错误趋势分析';
