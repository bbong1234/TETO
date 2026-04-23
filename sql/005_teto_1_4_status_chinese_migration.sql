-- ============================================================
-- TETO 1.4 阶段与目标状态中文化迁移脚本
-- 文件：005_teto_1_4_status_chinese_migration.sql
-- 说明：将 goals 和 phases 表的 status 从英文值迁移为中文值
--       并更新 CHECK 约束
-- ============================================================

-- ============================================================
-- 第一段：迁移 goals 表现有数据
-- ============================================================

UPDATE goals SET status = '进行中' WHERE status = 'active';
UPDATE goals SET status = '已达成' WHERE status = 'achieved';
UPDATE goals SET status = '已放弃' WHERE status = 'abandoned';
UPDATE goals SET status = '已暂停' WHERE status = 'paused';

-- 更新 goals 表的 CHECK 约束和默认值
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check 
  CHECK(status IN ('进行中','已达成','已放弃','已暂停'));

ALTER TABLE goals ALTER COLUMN status SET DEFAULT '进行中';

-- ============================================================
-- 第二段：迁移 phases 表现有数据
-- ============================================================

UPDATE phases SET status = '进行中' WHERE status = 'active';
UPDATE phases SET status = '已结束' WHERE status IN ('completed', 'high_intensity', 'low_intensity');
UPDATE phases SET status = '停滞' WHERE status IN ('stagnant', 'recovery');

-- 更新 phases 表的 CHECK 约束和默认值
ALTER TABLE phases DROP CONSTRAINT IF EXISTS phases_status_check;
ALTER TABLE phases ADD CONSTRAINT phases_status_check 
  CHECK(status IN ('进行中','已结束','停滞'));

ALTER TABLE phases ALTER COLUMN status SET DEFAULT '进行中';
