-- 多条笔记：JSON 数组
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 回填旧随手记：原文进 raw_input，清空 content
UPDATE records
SET raw_input = content, content = ''
WHERE input_source = 'quick'
  AND (raw_input IS NULL OR trim(raw_input) = '')
  AND content IS NOT NULL
  AND trim(content) <> '';

UPDATE records
SET notes = jsonb_build_array(note)
WHERE (notes IS NULL OR notes = '[]'::jsonb)
  AND note IS NOT NULL
  AND trim(note) <> '';
