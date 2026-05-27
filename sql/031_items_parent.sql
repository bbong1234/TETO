-- TETO 1.7: items 表加 parent_item_id，支持大类→事项层级
-- 大类 = parent_item_id IS NULL 的顶层 item
-- 事项 = parent_item_id 指向顶层 item 的子 item

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_parent_item_id_idx ON items(parent_item_id);
