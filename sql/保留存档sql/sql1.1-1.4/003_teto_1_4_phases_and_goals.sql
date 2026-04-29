-- ============================================================
-- TETO 1.4 阶段与目标模型建表脚本
-- 文件：003_teto_1_4_phases_and_goals.sql
-- 说明：新增 goals（目标）和 phases（阶段）两张核心表
--       并为 items 和 records 表添加 goal_id 外键关联
-- ============================================================


-- ============================================================
-- 第一段：建表
-- ============================================================

-- -----------------------------------------------------------
-- 1. goals —— 目标（方向层对象）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT '进行中'
                          CHECK(status IN ('进行中','已达成','已放弃','已暂停')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 2. phases —— 阶段（事项在某段时间的持续现实概括）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS phases (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id),
  item_id       UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  goal_id       UUID        REFERENCES goals(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  start_date    DATE,
  end_date      DATE,
  status        TEXT        NOT NULL DEFAULT '进行中'
                            CHECK(status IN ('进行中','已结束','停滞')),
  is_historical BOOLEAN     DEFAULT false,
  sort_order    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 第二段：为现有表添加 goal_id 字段
-- ============================================================

-- -----------------------------------------------------------
-- 3. 为 items 表添加 goal_id 外键
-- -----------------------------------------------------------
ALTER TABLE items 
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- -----------------------------------------------------------
-- 4. 为 records 表添加 goal_id 外键
-- -----------------------------------------------------------
ALTER TABLE records 
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- ============================================================
-- 第三段：触发器（updated_at 自动更新）
-- ============================================================

-- goals 表 updated_at 触发器
DROP TRIGGER IF EXISTS trg_goals_updated_at ON goals;
CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- phases 表 updated_at 触发器
DROP TRIGGER IF EXISTS trg_phases_updated_at ON phases;
CREATE TRIGGER trg_phases_updated_at
  BEFORE UPDATE ON phases
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 第四段：RLS（行级安全策略）
-- ============================================================

-- -----------------------------------------------------------
-- goals RLS
-- -----------------------------------------------------------
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_select ON goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY goals_insert ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY goals_update ON goals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY goals_delete ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- phases RLS
-- -----------------------------------------------------------
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY phases_select ON phases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY phases_insert ON phases
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY phases_update ON phases
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY phases_delete ON phases
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 第五段：索引
-- ============================================================

-- goals 表索引
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);

-- phases 表索引
CREATE INDEX IF NOT EXISTS idx_phases_user_item ON phases(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_phases_item ON phases(item_id);
CREATE INDEX IF NOT EXISTS idx_phases_goal ON phases(goal_id);

-- items 表新增索引
CREATE INDEX IF NOT EXISTS idx_items_goal ON items(goal_id);

-- records 表新增索引
CREATE INDEX IF NOT EXISTS idx_records_goal ON records(goal_id);
