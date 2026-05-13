-- 007: 补齐 records/goals/phases/items 表的 user_id 复合索引
-- 当前活跃迁移中 records 表缺少 user_id 索引，phases 表完全没有索引
-- 使用 CREATE INDEX IF NOT EXISTS 保证幂等

-- records 表（最高频查询）
CREATE INDEX IF NOT EXISTS idx_records_user_item ON records(user_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_sub_item ON records(user_id, sub_item_id) WHERE sub_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_phase ON records(user_id, phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_time_anchor ON records(user_id, time_anchor_date) WHERE time_anchor_date IS NOT NULL;

-- goals 表
CREATE INDEX IF NOT EXISTS idx_goals_user_phase ON goals(user_id, phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_user_sub_item ON goals(user_id, sub_item_id) WHERE sub_item_id IS NOT NULL;

-- phases 表
CREATE INDEX IF NOT EXISTS idx_phases_user_status ON phases(user_id, status);

-- items 表
CREATE INDEX IF NOT EXISTS idx_items_user_folder ON items(user_id, folder_id) WHERE folder_id IS NOT NULL;

-- ── 清理被复合索引覆盖的旧弱索引（缺少 user_id，RLS 下无效） ──
DROP INDEX IF EXISTS idx_records_item;        -- 被 idx_records_user_item 覆盖
DROP INDEX IF EXISTS idx_records_phase;       -- 被 idx_records_user_phase 覆盖
DROP INDEX IF EXISTS idx_records_sub_item;    -- 被 idx_records_user_sub_item 覆盖
DROP INDEX IF EXISTS idx_records_time_anchor; -- 被 idx_records_user_time_anchor 覆盖
DROP INDEX IF EXISTS idx_goals_item;          -- 被 idx_goals_item_status 覆盖
DROP INDEX IF EXISTS idx_goals_phase;         -- 被 idx_goals_user_phase 覆盖
DROP INDEX IF EXISTS idx_goals_sub_item;      -- 被 idx_goals_user_sub_item 覆盖
