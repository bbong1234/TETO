-- ============================================================
-- 1.5: 创建 user_rules 表
--
-- user_rules 承接用户修正后沉淀的归类规则，
-- 以及 AI 学习到的关键词→事项/子项映射。
--
-- 规则类型：
--   item_mapping     — 关键词→事项映射（如"背单词"→英语）
--   sub_item_mapping — 关键词→子项映射（如"听力"→英语.听读）
--   type_routing     — 关键词→记录类型分流（如"明天"→计划）
--   fuzzy_resolution — 常见模糊表达→默认解释
-- ============================================================

CREATE TABLE IF NOT EXISTS user_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('item_mapping', 'sub_item_mapping', 'type_routing', 'fuzzy_resolution')),
  trigger_pattern TEXT NOT NULL,           -- 触发模式（关键词/表达式）
  target_id UUID,                          -- 目标对象ID（事项/子项的ID）
  target_type TEXT,                        -- 'item' | 'sub_item'
  confidence TEXT DEFAULT 'high',          -- 'high' | 'medium' | 'low'
  source TEXT DEFAULT 'ai_learned',        -- 'ai_learned' | 'user_set' | 'system_default'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按用户+触发模式快速查找
CREATE INDEX IF NOT EXISTS idx_user_rules_user_trigger
  ON user_rules(user_id, trigger_pattern);

-- 索引：按用户+规则类型查找
CREATE INDEX IF NOT EXISTS idx_user_rules_user_type
  ON user_rules(user_id, rule_type);

-- 索引：按用户+活跃状态
CREATE INDEX IF NOT EXISTS idx_user_rules_user_active
  ON user_rules(user_id, is_active) WHERE is_active = true;

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_user_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_rules_updated_at ON user_rules;
CREATE TRIGGER trg_user_rules_updated_at
  BEFORE UPDATE ON user_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_user_rules_updated_at();

-- ============================================================
-- RLS 策略
-- ============================================================

ALTER TABLE user_rules ENABLE ROW LEVEL SECURITY;

-- 用户只能看自己的规则
CREATE POLICY "用户查看自己的规则"
  ON user_rules FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能插入自己的规则
CREATE POLICY "用户插入自己的规则"
  ON user_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的规则
CREATE POLICY "用户更新自己的规则"
  ON user_rules FOR UPDATE
  USING (auth.uid() = user_id);

-- 用户只能删除自己的规则
CREATE POLICY "用户删除自己的规则"
  ON user_rules FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 验证：
--   SELECT * FROM user_rules WHERE user_id = auth.uid();
--   期望：返回当前用户的规则列表
-- ============================================================
