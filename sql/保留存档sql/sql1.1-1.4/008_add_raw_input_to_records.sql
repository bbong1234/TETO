-- ============================================================
-- TETO 1.4 记录原始输入字段
-- 文件：008_add_raw_input_to_records.sql
-- 说明：给 records 表新增 raw_input 字段
--       raw_input 存用户输入的原始自然语言（如"中午吃猪脚饭花了30块"）
--       content 继续存归类后的主题（如"午饭"），两条都保留，不丢信息
-- ============================================================

ALTER TABLE records ADD COLUMN IF NOT EXISTS raw_input TEXT;

COMMENT ON COLUMN records.raw_input IS '用户输入的原始自然语言文本，未经结构化处理';
