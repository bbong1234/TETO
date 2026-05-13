-- ============================================================
-- 006: 目标系统规则重构
-- 将 measure_type(boolean/numeric/repeat) 迁移为
-- rule_type(一次性完成/周期性达成/周期性限制) + operator + period
-- ============================================================

-- ──────────────────────────────────────────
-- 阶段一：新增字段
-- ──────────────────────────────────────────

ALTER TABLE goals ADD COLUMN IF NOT EXISTS goal_text TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS rule_type TEXT
  CHECK (rule_type IN ('一次性完成', '周期性达成', '周期性限制'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS operator TEXT
  CHECK (operator IN ('>=', '<=', '=', 'between', 'before', 'after', 'complete'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS period TEXT
  CHECK (period IN ('无', '每天', '每周', '每月', '每年', '本周', '本月'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_min NUMERIC;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_max NUMERIC;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '手动创建'
  CHECK (source IN ('手动创建', '从记录生成', '系统建议'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN DEFAULT false;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress_source TEXT DEFAULT '记录统计'
  CHECK (progress_source IN ('记录统计', '手动更新', '暂无'));

-- ──────────────────────────────────────────
-- 阶段二：数据迁移
-- ──────────────────────────────────────────

-- 1. boolean 达标型 → 一次性完成 (operator=complete)
UPDATE goals SET
  rule_type = '一次性完成',
  operator = 'complete',
  period = '无',
  target_min = target_value,
  target_max = target_value,
  goal_text = title,
  source = '手动创建',
  progress_source = '手动更新',
  confirmation_required = false
WHERE measure_type = 'boolean'
  AND rule_type IS NULL;

-- 2. numeric 量化型(有 deadline) → 一次性完成 (operator=>=)
UPDATE goals SET
  rule_type = '一次性完成',
  operator = '>=',
  period = '无',
  target_min = target_value,
  target_max = NULL,
  goal_text = title,
  source = '手动创建',
  progress_source = '记录统计',
  confirmation_required = false,
  deadline = deadline_date
WHERE measure_type = 'numeric'
  AND deadline_date IS NOT NULL
  AND rule_type IS NULL;

-- 3. numeric 量化型(有 daily_target, 无 deadline) → 周期性达成
UPDATE goals SET
  rule_type = '周期性达成',
  operator = '>=',
  period = '每天',
  target_min = daily_target,
  target_max = NULL,
  goal_text = title,
  source = '手动创建',
  progress_source = '记录统计',
  confirmation_required = false
WHERE measure_type = 'numeric'
  AND daily_target IS NOT NULL
  AND deadline_date IS NULL
  AND rule_type IS NULL;

-- 4. repeat 重复型 → 周期性达成
UPDATE goals SET
  rule_type = '周期性达成',
  operator = '>=',
  period = CASE repeat_frequency
    WHEN 'daily' THEN '每天'
    WHEN 'weekly' THEN '每周'
    WHEN 'monthly' THEN '每月'
    ELSE '每天'
  END,
  target_min = repeat_count,
  target_max = NULL,
  goal_text = title,
  source = '手动创建',
  progress_source = '记录统计',
  confirmation_required = false,
  unit = COALESCE(unit, '次')
WHERE measure_type = 'repeat'
  AND rule_type IS NULL;

-- 5. 兜底：仍未迁移的 numeric 目标（无 daily_target 也无 deadline）
UPDATE goals SET
  rule_type = '一次性完成',
  operator = '>=',
  period = '无',
  target_min = target_value,
  goal_text = title,
  source = '手动创建',
  progress_source = CASE WHEN target_value IS NOT NULL THEN '记录统计' ELSE '手动更新' END,
  confirmation_required = false
WHERE measure_type = 'numeric'
  AND rule_type IS NULL;

-- 6. 状态映射：已达成 → 已完成
UPDATE goals SET status = '已完成' WHERE status = '已达成';

-- 7. 扩展 status 约束，新增草稿状态
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check
  CHECK (status IN ('草稿', '进行中', '已完成', '暂停', '放弃'));

-- 8. 同步 target_value = target_min（确保一致性）
UPDATE goals SET target_value = target_min WHERE target_value IS NULL AND target_min IS NOT NULL;

-- ──────────────────────────────────────────
-- 阶段三：删除旧字段
-- ──────────────────────────────────────────

ALTER TABLE goals DROP COLUMN IF EXISTS measure_type;
ALTER TABLE goals DROP COLUMN IF EXISTS repeat_frequency;
ALTER TABLE goals DROP COLUMN IF EXISTS repeat_count;
ALTER TABLE goals DROP COLUMN IF EXISTS daily_target;
ALTER TABLE goals DROP COLUMN IF EXISTS deadline_date;

-- ──────────────────────────────────────────
-- 阶段四：新增索引
-- ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_goals_item_status ON goals(user_id, item_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_rule_type ON goals(user_id, rule_type);
