-- ============================================================
-- TETO 1.4 事项（Topic）模块升级迁移脚本
-- 文件：009_teto_1_4_topic_module_upgrade.sql
-- 说明：
--   1. items 表新增 is_pinned（桌面置顶）
--   2. goals 表新增归属外键 item_id/phase_id + 度量字段
--   3. phases 表废除旧时代 goal_id（1.4 中 Goal 挂 Phase，非反向）
--   4. records 表新增 phase_id 外键
-- 安全原则：
--   - 所有新字段 nullable 或有合理默认值
--   - phases.goal_id 先置 NULL 再 drop，零数据丢失
--   - 全部使用 IF NOT EXISTS / IF EXISTS 保证幂等
-- ============================================================

-- ============================================================
-- 第一段：items 表升级
-- ============================================================

-- 1. 新增 is_pinned 字段（桌面置顶标记）
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- 2. 置顶事项查询索引（部分索引，仅 pinned=true 的行）
CREATE INDEX IF NOT EXISTS idx_items_pinned ON items(user_id, is_pinned) WHERE is_pinned = true;

-- ============================================================
-- 第二段：goals 表升级（归属 + 度量）
-- ============================================================

-- 3. 归属外键：目标属于哪个事项（允许 NULL，向后兼容全局目标）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES items(id) ON DELETE CASCADE;

-- 4. 归属外键：目标属于哪个阶段（NULL = 事项级目标）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;

-- 5. 度量类型：boolean（达标/未达标）或 numeric（量化型）
--    注意：ADD COLUMN IF NOT EXISTS 不支持同时加 CHECK，需分步
ALTER TABLE goals ADD COLUMN IF NOT EXISTS measure_type TEXT DEFAULT 'boolean';

-- 单独添加 CHECK 约束（幂等：先 DROP 再 ADD）
DO $$
BEGIN
  ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_measure_type_check;
  ALTER TABLE goals ADD CONSTRAINT goals_measure_type_check
    CHECK(measure_type IN ('boolean', 'numeric'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. 目标值（numeric 型时使用，如"背 5000 个单词"中的 5000）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_value NUMERIC(12,2) NULL;

-- 7. 当前值（用户手动更新，绝不自动计算）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS current_value NUMERIC(12,2) NULL;

-- 8. 索引
CREATE INDEX IF NOT EXISTS idx_goals_item ON goals(item_id);
CREATE INDEX IF NOT EXISTS idx_goals_phase ON goals(phase_id);

-- ============================================================
-- 第三段：phases 表清理（废除旧时代双向外键）
-- ============================================================
-- 1.4 中是 Goal 挂在 Phase 下（goals.phase_id → phases.id）
-- phases 不应再持有 goal_id，否则造成"双向绑定"脏关联

-- 9. 先将现有数据的 goal_id 安全置 NULL，再 DROP（幂等：列不存在时跳过）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phases' AND column_name = 'goal_id'
  ) THEN
    UPDATE phases SET goal_id = NULL WHERE goal_id IS NOT NULL;
    ALTER TABLE phases DROP COLUMN goal_id;
  END IF;
END $$;

-- 11. 清理对应的旧索引（如果存在）
DROP INDEX IF EXISTS idx_phases_goal;

-- ============================================================
-- 第四段：records 表升级
-- ============================================================

-- 12. 新增 phase_id 外键（记录可选归属某个阶段）
ALTER TABLE records ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;

-- 13. 索引
CREATE INDEX IF NOT EXISTS idx_records_phase ON records(phase_id);

-- ============================================================
-- 完成
-- ============================================================
-- 验证要点：
--   SELECT column_name FROM information_schema.columns WHERE table_name='items' AND column_name='is_pinned';
--   SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name IN ('item_id','phase_id','measure_type','target_value','current_value');
--   SELECT column_name FROM information_schema.columns WHERE table_name='phases' AND column_name='goal_id'; -- 应返回空
--   SELECT column_name FROM information_schema.columns WHERE table_name='records' AND column_name='phase_id';
