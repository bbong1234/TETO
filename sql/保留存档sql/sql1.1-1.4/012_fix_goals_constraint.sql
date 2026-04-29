-- ============================================================
-- 012: 修复 goals 表 measure_type 约束可能未生效的问题
--
-- 迁移 009 使用 EXCEPTION WHEN OTHERS THEN NULL 可能吞掉了
-- ADD CONSTRAINT 失败，导致 measure_type 列缺少 CHECK 约束。
-- 此迁移先修复异常数据，再重新添加约束。
-- ============================================================

-- 1. 清理非法值：将非 boolean/numeric 的值统一修正为 'numeric'
UPDATE goals SET measure_type = 'numeric'
  WHERE measure_type IS NULL
     OR measure_type NOT IN ('boolean', 'numeric');

-- 2. 确保约束存在（先删后建，幂等操作）
DO $$
BEGIN
  ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_measure_type_check;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '删除旧约束时出错（可能已不存在）';
END $$;

ALTER TABLE goals ADD CONSTRAINT goals_measure_type_check
  CHECK (measure_type IN ('boolean', 'numeric'));
