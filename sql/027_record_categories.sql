-- TETO 1.7: 记录分类字段（大类 / 子类）
-- 请在 Supabase SQL Editor 中执行

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

CREATE INDEX IF NOT EXISTS idx_records_category
  ON records(user_id, category)
  WHERE category IS NOT NULL;
