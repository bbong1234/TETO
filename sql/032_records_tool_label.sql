-- 记录层「工具/载体」字段（如：不背单词、多邻国）
ALTER TABLE records ADD COLUMN IF NOT EXISTS tool_label text;

COMMENT ON COLUMN records.tool_label IS '工具/载体标签，与子项正交，如 app 名或自学';
