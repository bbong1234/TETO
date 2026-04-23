-- ============================================================
-- TETO 1.4 记录类型收敛
-- 新增 cost 字段（花费金额）
-- 收敛 type 为 4 个值：发生/计划/想法/总结
-- ============================================================

-- 1. 给 records 表新增 cost 字段
ALTER TABLE records ADD COLUMN cost NUMERIC(12,2) NULL;

-- 2. 创建 cost 字段索引（方便后续查询有花费的记录）
CREATE INDEX IF NOT EXISTS idx_records_cost ON records(cost) WHERE cost IS NOT NULL;

-- 3. 将旧类型记录迁移为主类型
--    情绪 → 发生，花费 → 发生，结果 → 发生
UPDATE records SET type = '发生' WHERE type IN ('情绪', '花费', '结果');

-- 4. 修改 type 的 CHECK 约束，只允许 4 个值
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_type_check;
ALTER TABLE records ADD CONSTRAINT records_type_check CHECK (type IN ('发生', '计划', '想法', '总结'));
