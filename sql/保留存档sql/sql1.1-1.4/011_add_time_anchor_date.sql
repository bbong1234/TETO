-- ============================================================
-- 011: records 表添加 time_anchor_date 列 + 性能索引
--
-- time_anchor_date 允许计划类记录（type=计划）投影到未来的某个日期，
-- 在记录列表中按该日期查询时，可以提前看到未来的计划安排。
-- ============================================================

-- 1. time_anchor_date 列
ALTER TABLE records ADD COLUMN IF NOT EXISTS time_anchor_date DATE NULL;

COMMENT ON COLUMN records.time_anchor_date IS '计划投影日期：计划记录可在该日期被查询到';

CREATE INDEX IF NOT EXISTS idx_records_time_anchor
  ON records(time_anchor_date)
  WHERE time_anchor_date IS NOT NULL;

-- 2. 复合索引：按事项查记录（高频查询模式）
CREATE INDEX IF NOT EXISTS idx_records_user_item
  ON records(user_id, item_id)
  WHERE item_id IS NOT NULL;

-- 3. 复合索引：按类型过滤记录
CREATE INDEX IF NOT EXISTS idx_records_user_type
  ON records(user_id, type);
