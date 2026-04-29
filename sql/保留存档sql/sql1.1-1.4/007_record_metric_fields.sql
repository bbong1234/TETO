-- ============================================================
-- TETO 1.4 记录结构化统计字段（最小版）
-- 文件：007_record_metric_fields.sql
-- 说明：给 records 表新增 metric_value / metric_unit / metric_name / duration_minutes
--       仅字段，不加索引；索引留到 P2/P3 确认查询路径后再补
-- ============================================================

-- 1. metric_value —— 数值（如 30、5、45）
ALTER TABLE records ADD COLUMN IF NOT EXISTS metric_value NUMERIC(12,2) NULL;

-- 2. metric_unit —— 计量单位（如 个、次、页、公里、分钟、元）
ALTER TABLE records ADD COLUMN IF NOT EXISTS metric_unit TEXT NULL;

-- 3. metric_name —— 统计对象，即"什么东西"（如 单词、俯卧撑、阅读、跑步距离）
--    注意与 unit 严格区分：name 是"什么东西"，unit 是"计量单位"
ALTER TABLE records ADD COLUMN IF NOT EXISTS metric_name TEXT NULL;

-- 4. duration_minutes —— 时长（分钟），独立于 metric 体系，记录行为持续时间
ALTER TABLE records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NULL;
