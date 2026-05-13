-- 022_corrections_rule_id.sql
-- TETO 1.6 — corrections 表追加 rule_id 和 decision_type 列
-- 使纠错可追溯到出错的规则和决策类型，支持错误聚类

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS rule_id TEXT NULL;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS decision_type TEXT NULL;

COMMENT ON COLUMN corrections.rule_id IS '出错的规则 ID（如 R-CL-001），用于定位哪条规则导致错误';
COMMENT ON COLUMN corrections.decision_type IS '出错的决策类型（DEC-SPLIT/DEC-TYPE/DEC-ITEM/DEC-TIME/DEC-AMOUNT/DEC-ADMISSION），用于错误聚类';

CREATE INDEX IF NOT EXISTS idx_corrections_rule_id ON corrections(rule_id);
CREATE INDEX IF NOT EXISTS idx_corrections_decision_type ON corrections(decision_type);
