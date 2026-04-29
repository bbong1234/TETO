-- ============================================================
-- TETO 1.3 · 删除 chain 相关结构迁移脚本
-- 文件：009_drop_chain_structure.sql
-- 说明：chain 概念正式删除后，清理数据库中所有 chain 相关结构
--       包括：触发器、外键字段、索引、RLS 策略、表
-- 执行顺序（先删依赖，后删主体）：
--   1. 删除 record_chain_item 一致性触发器
--   2. records 表删除 chain_id 字段
--   3. chains 表删除 RLS 策略
--   4. chains 表删除 updated_at 触发器
--   5. 删除 chains 表
--   6. 删除相关索引
-- ============================================================

-- -----------------------------------------------------------
-- 1. 删除 chain/item 一致性触发器
-- -----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_record_chain_item_consistency ON records;
DROP FUNCTION IF EXISTS check_record_chain_item_consistency();

-- -----------------------------------------------------------
-- 2. records 表删除 chain_id 字段（外键引用 chains，需先删）
-- -----------------------------------------------------------
ALTER TABLE records DROP COLUMN IF EXISTS chain_id;

-- -----------------------------------------------------------
-- 3. chains 表删除 RLS 策略
-- -----------------------------------------------------------
DROP POLICY IF EXISTS chains_select ON chains;
DROP POLICY IF EXISTS chains_insert ON chains;
DROP POLICY IF EXISTS chains_update ON chains;
DROP POLICY IF EXISTS chains_delete ON chains;

-- -----------------------------------------------------------
-- 4. chains 表删除 updated_at 触发器
-- -----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_chains_updated_at ON chains;

-- -----------------------------------------------------------
-- 5. 删除 chains 表
-- -----------------------------------------------------------
DROP TABLE IF EXISTS chains;

-- -----------------------------------------------------------
-- 6. 删除相关索引（如果存在）
-- -----------------------------------------------------------
DROP INDEX IF EXISTS idx_chains_user_item;
DROP INDEX IF EXISTS idx_records_chain;
