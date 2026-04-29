-- ============================================================
-- 1.5: 移除 items.goal_id 列
--
-- items.goal_id 是 1.4 之前的旧模型字段（事项→单目标），
-- 1.4 已改为 goals.item_id 反向关联（事项→多目标），
-- 1.5 正式移除此废弃字段。
--
-- 前置条件：
--   - 所有旧模型目标已通过 015_backfill_goals_item_id.sql 迁移
--     补全了 goals.item_id 字段
--   - 前端和 API 已不再引用 items.goal_id
-- ============================================================

-- 1. 先清理可能的残留外键约束
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'items'
    AND att.attname = 'goal_id'
    AND con.contype = 'f'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE items DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

-- 2. 移除 items.goal_id 列
ALTER TABLE items DROP COLUMN IF EXISTS goal_id;

-- ============================================================
-- 验证：
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'items' AND column_name = 'goal_id';
--   期望：0 rows
-- ============================================================
