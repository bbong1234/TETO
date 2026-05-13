-- TETO 1.6: input_id 体系
-- 每次用户输入生成唯一 input_id，复合句拆分后的子句继承父 input_id
-- 子句另有独立的 child input_id（parent_input_id + "-{index}"）

-- 1. records 表新增 input_id（用户输入编号）
ALTER TABLE records ADD COLUMN IF NOT EXISTS input_id TEXT NULL;
CREATE INDEX idx_records_input_id ON records(input_id) WHERE input_id IS NOT NULL;

-- 2. records 表新增 parent_input_id（复合句父输入编号，子句指向父句）
ALTER TABLE records ADD COLUMN IF NOT EXISTS parent_input_id TEXT NULL;
CREATE INDEX idx_records_parent_input_id ON records(parent_input_id) WHERE parent_input_id IS NOT NULL;

-- 3. decision_logs 表新增 input_id（关联到具体输入）
ALTER TABLE decision_logs ADD COLUMN IF NOT EXISTS input_id TEXT NULL;
CREATE INDEX idx_decision_logs_input_id ON decision_logs(input_id) WHERE input_id IS NOT NULL;
