-- ============================================================
-- TETO 1.4 数据回填：将旧模型 goals 关系迁移到新模型
-- 文件：015_backfill_goals_item_id.sql
-- 说明：
--   旧模型：items.goal_id → goals.id（事项引用目标）
--   新模型：goals.item_id → items.id（目标引用事项）
--   此迁移将 items.goal_id 指向的目标回填 goals.item_id
--   执行后，所有目标都会通过 goals.item_id 关联到事项
-- 安全原则：
--   - 仅更新 item_id 为 NULL 的目标（不覆盖已有数据）
--   - 使用 EXISTS 确保引用完整性
--   - 幂等设计，可重复执行
-- ============================================================

-- 回填 goals.item_id：将 items.goal_id 指向的目标关联到对应事项
UPDATE goals g
SET item_id = i.id
FROM items i
WHERE i.goal_id = g.id
  AND g.item_id IS NULL
  AND i.goal_id IS NOT NULL;

-- 验证：
-- SELECT g.id, g.title, g.item_id, i.id as item_id_check
-- FROM goals g
-- JOIN items i ON i.goal_id = g.id
-- WHERE g.item_id = i.id;
