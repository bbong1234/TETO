-- 025_schema_alignment.sql
-- TETO 1.6 — TS 与 SQL 模型对齐修复
--
-- 涉及问题（仅事实，不猜）：
-- 1. corrections 表 016 建表时缺 user_id 列，但应用层已在按 user_id 查/写
-- 2. records.review_status CHECK 约束不含 'disputed'，但 src/types/teto.ts 定义了
-- 3. records.time_precision CHECK 约束不含 'inherited'，但 src/types/teto.ts 定义了
-- 4. records 缺少 input_unit_id 反向关联（024 之后才补）
-- 5. records 缺少 record_quality_tag 列（前端色条用）
--
-- 全部幂等。重复执行不会出错。

-- ============================================================
-- 1. corrections 表补 user_id 列
-- ============================================================

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS user_id UUID;

-- 历史数据回填（从 records.user_id 取）
UPDATE corrections c
SET user_id = r.user_id
FROM records r
WHERE c.record_id = r.id AND c.user_id IS NULL;

-- 加非空约束（仅在已无 NULL 的情况下）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM corrections WHERE user_id IS NULL) THEN
    ALTER TABLE corrections ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections(user_id);

-- 收紧 RLS：直接按 user_id 过滤，比 016 的 record_id IN (SELECT ...) 更高效
DO $$
BEGIN
  -- 016 的旧 policy
  EXECUTE 'DROP POLICY IF EXISTS corrections_user_policy ON corrections';
  EXECUTE 'DROP POLICY IF EXISTS corrections_user_select ON corrections';
  EXECUTE 'DROP POLICY IF EXISTS corrections_user_insert ON corrections';
  EXECUTE 'DROP POLICY IF EXISTS corrections_user_update ON corrections';
  EXECUTE 'DROP POLICY IF EXISTS corrections_user_delete ON corrections';
END $$;

CREATE POLICY corrections_user_select ON corrections FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY corrections_user_insert ON corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY corrections_user_update ON corrections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY corrections_user_delete ON corrections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. records.review_status CHECK 加入 'disputed'
-- ============================================================

DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'records'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%review_status%'
  LOOP
    EXECUTE format('ALTER TABLE records DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE records ADD CONSTRAINT records_review_status_check
  CHECK (review_status IN ('unchecked','confirmed','corrected','disputed'));

-- ============================================================
-- 3. records.time_precision CHECK 加入 'inherited'
-- ============================================================

DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'records'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%time_precision%'
  LOOP
    EXECUTE format('ALTER TABLE records DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE records ADD CONSTRAINT records_time_precision_check
  CHECK (time_precision IS NULL OR time_precision IN ('exact','approx','fuzzy','unknown','inherited'));

-- ============================================================
-- 4. records 关联 input_units（反向追溯：record → 来自哪个 unit）
-- ============================================================

ALTER TABLE records ADD COLUMN IF NOT EXISTS input_unit_id UUID;

-- 仅在 input_units 表已存在的情况下加外键
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'input_units'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'records_input_unit_id_fkey'
  ) THEN
    ALTER TABLE records ADD CONSTRAINT records_input_unit_id_fkey
      FOREIGN KEY (input_unit_id) REFERENCES input_units(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_records_input_unit_id
  ON records(input_unit_id) WHERE input_unit_id IS NOT NULL;

COMMENT ON COLUMN records.input_unit_id IS '反向追溯：本 record 来自哪个 input_unit（024 表）';

-- ============================================================
-- 5. records 加 record_quality_tag（前端色条用）
-- ============================================================

ALTER TABLE records ADD COLUMN IF NOT EXISTS record_quality_tag TEXT;

DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'records'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%record_quality_tag%'
  LOOP
    EXECUTE format('ALTER TABLE records DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE records ADD CONSTRAINT records_record_quality_tag_check
  CHECK (record_quality_tag IS NULL OR record_quality_tag IN (
    'ai_high',     -- 全 AI 解析、整体置信度高
    'clarified',   -- 用户在录入时澄清过至少一个字段
    'corrected',   -- 用户事后修正过
    'ai_failed',   -- AI 解析失败强写默认值
    'partial'      -- 3 轮封顶后仍缺关键字段
  ));

CREATE INDEX IF NOT EXISTS idx_records_record_quality_tag
  ON records(record_quality_tag) WHERE record_quality_tag IS NOT NULL;

COMMENT ON COLUMN records.record_quality_tag IS '记录质量标签（前端色条）：ai_high / clarified / corrected / ai_failed / partial';
