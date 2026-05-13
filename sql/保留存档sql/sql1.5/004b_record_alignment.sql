-- ============================================================
-- 1.5 录入结构正式对齐：新增 body_state、money_currency 列
--
-- 变更说明：
-- 1. body_state: 身体状态（累/困/饿/头疼/没精神），
--    解决"累"被误归入 energy 的问题
-- 2. money_currency: 金额币种（默认 CNY），配套 cost 字段
--
-- 前置条件：
--   - records 表已存在
--   - 003_period_rule_and_data_nature.sql 已执行
-- ============================================================

-- 1. body_state：身体状态
ALTER TABLE records ADD COLUMN IF NOT EXISTS body_state TEXT;
COMMENT ON COLUMN records.body_state IS '身体状态：累/困/饿/头疼/没精神等，与 mood/energy/state 分离';

-- 2. money_currency：金额币种
ALTER TABLE records ADD COLUMN IF NOT EXISTS money_currency TEXT DEFAULT 'CNY';
COMMENT ON COLUMN records.money_currency IS '金额币种，默认 CNY，与 cost 配套使用';

-- ============================================================
-- 验证：
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--       WHERE table_name = 'records'
--         AND column_name IN ('body_state', 'money_currency');
--   期望：2 rows
-- ============================================================
