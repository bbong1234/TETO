-- TETO 1.8: 活动会话 + 事件流
-- 请在 Supabase SQL Editor 中执行

-- 会话字段（复用 records 表作为会话容器）
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS paused_total_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_state TEXT NOT NULL DEFAULT 'running'
    CHECK (session_state IN ('running', 'paused', 'nested_paused'));

CREATE INDEX IF NOT EXISTS idx_records_parent_session ON records(user_id, parent_session_id)
  WHERE parent_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_records_session_state ON records(user_id, session_state)
  WHERE lifecycle_status = 'active';

-- 活动事件流
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'progress', 'idea', 'plan', 'milestone',
    'ai_user', 'ai_reply',
    'pause', 'resume', 'sub_start', 'sub_end',
    'structured'
  )),
  content TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(user_id, session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(user_id, event_type, occurred_at DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_events_user_isolation ON activity_events;
CREATE POLICY activity_events_user_isolation ON activity_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Item 默认职能/工具预设
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS default_function_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_tool_label TEXT;

-- UserRule 扩展：metadata 存职能 tag_id / tool_label
ALTER TABLE user_rules
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 扩展 rule_type 约束（含 function_mapping / tool_mapping）
ALTER TABLE user_rules DROP CONSTRAINT IF EXISTS user_rules_rule_type_check;
ALTER TABLE user_rules ADD CONSTRAINT user_rules_rule_type_check
  CHECK (rule_type IN (
    'item_mapping', 'sub_item_mapping', 'type_routing', 'fuzzy_resolution',
    'function_mapping', 'tool_mapping'
  ));

-- 项目笔记增强
ALTER TABLE project_notes
  ADD COLUMN IF NOT EXISTS note_type TEXT NOT NULL DEFAULT 'knowledge'
    CHECK (note_type IN ('knowledge', 'review', 'insight', 'reflection', 'milestone')),
  ADD COLUMN IF NOT EXISTS source_event_id UUID REFERENCES activity_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS record_id UUID REFERENCES records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_notes_type ON project_notes(user_id, note_type);

-- 用户画像（滚动派生）
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_hours JSONB NOT NULL DEFAULT '[]'::jsonb,
  avg_focus_minutes NUMERIC,
  top_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  interrupt_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  mood_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_user_isolation ON user_profiles;
CREATE POLICY user_profiles_user_isolation ON user_profiles
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
