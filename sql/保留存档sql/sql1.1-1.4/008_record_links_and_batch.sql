-- ============================================================
-- TETO 1.4 Record 微关联 + 批次拆分 + 生命周期状态
-- 文件：008_record_links_and_batch.sql
-- ============================================================

-- 1. record_links 关联表（独立表 + 类型枚举）
CREATE TABLE record_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN (
    'completes',       -- source 完成了 target（计划→发生）
    'derived_from',    -- source 衍生自 target（同源拆分）
    'postponed_from',  -- source 是 target 的推迟版
    'related_to'       -- 通用双向关联
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, link_type)
);
CREATE INDEX idx_record_links_source ON record_links(source_id);
CREATE INDEX idx_record_links_target ON record_links(target_id);

-- 2. records 表新增 batch_id（同一输入拆分出的记录共享）
ALTER TABLE records ADD COLUMN IF NOT EXISTS batch_id UUID NULL;
CREATE INDEX idx_records_batch_id ON records(batch_id) WHERE batch_id IS NOT NULL;

-- 3. records 表补充 lifecycle_status 列（生命周期状态，用于 Todo 流转）
-- 注意：records 表已有 status 列（进行中/已完成/已暂停），此处新增独立列避免冲突
ALTER TABLE records ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active'
  CHECK (lifecycle_status IN ('active', 'completed', 'postponed', 'cancelled'));
