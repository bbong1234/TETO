-- ============================================================
-- 1.5: 历史规律字段 + data_nature 数据性质标记
--
-- 为 records 表新增字段，支持：
-- 1. 概括性历史识别（规律记录 is_period_rule=true）
-- 2. 数据性质区分（data_nature: fact vs inferred）
-- 3. 规律记录的时间范围和频率信息
-- 4. 推断条目的来源关联
--
-- 前置条件：
--   - records 表已存在
--   - 013_record_semantic_fields.sql 已执行
-- ============================================================

-- 1. data_nature：区分原始事实记录 vs 推断生成的条目
ALTER TABLE records ADD COLUMN IF NOT EXISTS data_nature TEXT DEFAULT 'fact'
  CHECK (data_nature IN ('fact', 'inferred'));
COMMENT ON COLUMN records.data_nature IS '数据性质：fact=原始事实记录, inferred=由概括性规律推断生成的条目';

-- 2. is_period_rule：标记是否为规律记录
ALTER TABLE records ADD COLUMN IF NOT EXISTS is_period_rule BOOLEAN DEFAULT false;
COMMENT ON COLUMN records.is_period_rule IS '是否为概括性规律记录（如"那段时间基本每天7:40起床"）';

-- 3. period_start_date：规律起始日
ALTER TABLE records ADD COLUMN IF NOT EXISTS period_start_date DATE;
COMMENT ON COLUMN records.period_start_date IS '规律记录的时间范围起始日';

-- 4. period_end_date：规律结束日
ALTER TABLE records ADD COLUMN IF NOT EXISTS period_end_date DATE;
COMMENT ON COLUMN records.period_end_date IS '规律记录的时间范围结束日';

-- 5. period_frequency：规律频率
ALTER TABLE records ADD COLUMN IF NOT EXISTS period_frequency TEXT
  CHECK (period_frequency IS NULL OR period_frequency IN ('daily', 'weekly', 'monthly', 'irregular'));
COMMENT ON COLUMN records.period_frequency IS '规律频率：daily/weekly/monthly/irregular';

-- 6. period_expanded：规律是否已展开
ALTER TABLE records ADD COLUMN IF NOT EXISTS period_expanded BOOLEAN DEFAULT false;
COMMENT ON COLUMN records.period_expanded IS '规律记录是否已展开为逐日推断条目';

-- 7. period_source_id：推断条目的来源规律记录ID
ALTER TABLE records ADD COLUMN IF NOT EXISTS period_source_id UUID
  REFERENCES records(id) ON DELETE SET NULL;
COMMENT ON COLUMN records.period_source_id IS '推断条目(data_nature=inferred)的来源规律记录ID';

-- ============================================================
-- 索引
-- ============================================================

-- 按用户+数据性质查找（统计时过滤推断数据）
CREATE INDEX IF NOT EXISTS idx_records_data_nature
  ON records(data_nature) WHERE data_nature != 'fact';

-- 按规律记录查找
CREATE INDEX IF NOT EXISTS idx_records_period_rule
  ON records(is_period_rule) WHERE is_period_rule = true;

-- 按来源规律查找推断条目
CREATE INDEX IF NOT EXISTS idx_records_period_source
  ON records(period_source_id) WHERE period_source_id IS NOT NULL;

-- ============================================================
-- 验证：
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'records'
--       AND column_name IN ('data_nature', 'is_period_rule', 'period_start_date', 'period_end_date', 'period_frequency', 'period_expanded', 'period_source_id');
--   期望：7 rows
-- ============================================================
