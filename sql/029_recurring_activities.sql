-- TETO 1.7: 常用事项（重复活动模板）
-- 请在 Supabase SQL Editor 中执行

CREATE TABLE IF NOT EXISTS recurring_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  subcategory VARCHAR(50),
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_activities_user_id ON recurring_activities(user_id);

ALTER TABLE recurring_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_user_isolation ON recurring_activities;
CREATE POLICY recurring_user_isolation ON recurring_activities
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
