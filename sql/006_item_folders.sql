-- ============================================================
-- TETO 1.4 事项文件夹收纳功能
-- 文件：006_item_folders.sql
-- 说明：新增 item_folders 表，items 表增加 folder_id 字段
-- ============================================================

-- 1. 创建文件夹表
CREATE TABLE IF NOT EXISTS item_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  name        TEXT        NOT NULL,
  color       TEXT        DEFAULT NULL,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. items 表增加 folder_id 字段
ALTER TABLE items ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES item_folders(id) ON DELETE SET NULL;

-- 3. 文件夹触发器（自动更新 updated_at）
DROP TRIGGER IF EXISTS trg_item_folders_updated_at ON item_folders;
CREATE TRIGGER trg_item_folders_updated_at
  BEFORE UPDATE ON item_folders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. RLS
ALTER TABLE item_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_folders_select ON item_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY item_folders_insert ON item_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY item_folders_update ON item_folders FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY item_folders_delete ON item_folders FOR DELETE USING (auth.uid() = user_id);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_item_folders_user ON item_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_folder ON items(folder_id);
