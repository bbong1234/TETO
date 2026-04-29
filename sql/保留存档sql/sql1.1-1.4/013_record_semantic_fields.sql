-- ============================================================
-- 013: records 表补全语义解析持久化字段
--
-- TypeScript 接口 Record 中已定义以下 4 个字段，
-- 但数据库中缺少对应列，导致 Supabase .insert() 静默丢弃这些数据。
-- 此迁移补全缺失的列，使 AI 语义解析结果能够持久化。
-- ============================================================

-- 1. parsed_semantic —— AI 语义解析的完整 JSON 结果
ALTER TABLE records ADD COLUMN IF NOT EXISTS parsed_semantic JSONB NULL;

COMMENT ON COLUMN records.parsed_semantic IS 'AI 语义解析结果（DeepSeek LLM 输出的 ParsedSemantic JSON）';

-- 2. linked_record_id —— 单条记录的直接关联 ID（简化引用）
ALTER TABLE records ADD COLUMN IF NOT EXISTS linked_record_id UUID NULL;

COMMENT ON COLUMN records.linked_record_id IS '直接关联的记录 ID（简化引用，完整关联用 record_links 表）';

-- 3. location —— 地点信息
ALTER TABLE records ADD COLUMN IF NOT EXISTS location TEXT NULL;

COMMENT ON COLUMN records.location IS '地点（如"公司"、"公园"），由 AI 解析或手动输入';

-- 4. people —— 相关人物
ALTER TABLE records ADD COLUMN IF NOT EXISTS people TEXT[] NULL;

COMMENT ON COLUMN records.people IS '相关人物数组（如 ["小明", "同事"]），由 AI 解析或手动输入';

-- ============================================================
-- 索引（按需查询场景）
-- ============================================================

-- location 过滤索引（部分索引，仅非空行）
CREATE INDEX IF NOT EXISTS idx_records_location
  ON records(location)
  WHERE location IS NOT NULL;

-- people 数组包含查询索引（GIN 索引，支持 && 数组重叠查询）
CREATE INDEX IF NOT EXISTS idx_records_people
  ON records USING GIN (people)
  WHERE people IS NOT NULL;
