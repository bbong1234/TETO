-- 用户自定义「工具/载体」选项（记录仍用 records.tool_label 存选中项名称）
CREATE TABLE IF NOT EXISTS user_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_user_tools_user_id ON user_tools(user_id, sort_order);

ALTER TABLE user_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_tools_select ON user_tools
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_tools_insert ON user_tools
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_tools_update ON user_tools
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY user_tools_delete ON user_tools
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE user_tools IS '用户自定义工具/载体选项，供录入时选择';
