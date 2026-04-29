-- ============================================================
-- TETO 1.4 子项（Sub-Items）+ 重复型目标 迁移脚本
-- 文件：014_sub_items_and_repeat_goals.sql
-- 说明：
--   1. 新建 sub_items 表（事项下的行动线）
--   2. records 新增 sub_item_id 外键
--   3. goals 新增 sub_item_id 外键 + 重复型字段
--   4. goals.measure_type 扩展为 boolean/numeric/repeat
--   5. 修改 records.item_id FK 为 ON DELETE SET NULL（删除保护）
-- 安全原则：
--   - 所有新字段 nullable 或有合理默认值
--   - 全部使用 IF NOT EXISTS / IF EXISTS 保证幂等
--   - FK 变更使用独立 DO 块，失败不影响其他迁移
-- ============================================================

-- ============================================================
-- 第一段：创建 sub_items 表
-- ============================================================

CREATE TABLE IF NOT EXISTS sub_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id),
  item_id       UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  sort_order    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sub_items 索引
CREATE INDEX IF NOT EXISTS idx_sub_items_user ON sub_items(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_items_item ON sub_items(item_id);
CREATE INDEX IF NOT EXISTS idx_sub_items_user_item ON sub_items(user_id, item_id);

-- ============================================================
-- 第二段：sub_items RLS
-- ============================================================

ALTER TABLE sub_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_items_select ON sub_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sub_items_insert ON sub_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sub_items_update ON sub_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sub_items_delete ON sub_items
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 第三段：records 新增 sub_item_id
-- ============================================================

ALTER TABLE records ADD COLUMN IF NOT EXISTS sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_records_sub_item ON records(sub_item_id);

-- ============================================================
-- 第四段：goals 新增 sub_item_id + 重复型字段
-- ============================================================

-- goals 归属子项
ALTER TABLE goals ADD COLUMN IF NOT EXISTS sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL;

-- 重复型目标字段
ALTER TABLE goals ADD COLUMN IF NOT EXISTS repeat_frequency TEXT;

-- repeat_frequency CHECK 约束（幂等：先 DROP 再 ADD）
DO $$
BEGIN
  ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_repeat_frequency_check;
  ALTER TABLE goals ADD CONSTRAINT goals_repeat_frequency_check
    CHECK(repeat_frequency IS NULL OR repeat_frequency IN ('daily', 'weekly', 'monthly'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE goals ADD COLUMN IF NOT EXISTS repeat_count INTEGER;

-- goals 索引
CREATE INDEX IF NOT EXISTS idx_goals_sub_item ON goals(sub_item_id);

-- ============================================================
-- 第五段：goals.measure_type 扩展为包含 repeat
-- ============================================================

-- 先 DROP 旧约束，再 ADD 新约束
DO $$
BEGIN
  ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_measure_type_check;
  ALTER TABLE goals ADD CONSTRAINT goals_measure_type_check
    CHECK(measure_type IN ('boolean', 'numeric', 'repeat'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 将现有默认值 'boolean' 更新为新默认值（保持兼容）
-- 新建目标时默认使用 'boolean'，此处无需额外操作

-- ============================================================
-- 第六段：修改 records.item_id FK 为 ON DELETE SET NULL
-- ============================================================
-- 当前 records.item_id FK 无 ON DELETE 行为（默认 RESTRICT）
-- 需改为 SET NULL 以支持事项删除保护
-- Supabase/PostgreSQL 不能直接 ALTER CONSTRAINT，需先 DROP 再 ADD

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  -- 查找 records(item_id) 上的外键约束名
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  JOIN pg_class fk_rel ON fk_rel.oid = con.confrelid
  WHERE rel.relname = 'records'
    AND att.attname = 'item_id'
    AND con.contype = 'f'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE records DROP CONSTRAINT %I', fk_name);
    EXECUTE 'ALTER TABLE records ADD CONSTRAINT records_item_id_fkey
             FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL';
  END IF;
END $$;

-- ============================================================
-- 第七段：updated_at 触发器（sub_items）
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON sub_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON sub_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 完成
-- ============================================================
-- 验证要点：
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='sub_items' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='records' AND column_name='sub_item_id';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='goals' AND column_name IN ('sub_item_id','repeat_frequency','repeat_count');
--   SELECT conname FROM pg_constraint WHERE conrelid = 'records'::regclass AND contype = 'f';
