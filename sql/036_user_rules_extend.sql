-- ============================================================
-- 036: 扩展 user_rules 表的规则类型与来源枚举
--
-- 新增：
--   rule_type: no_assign — 「不归类」标记，避免同类词反复被猜
--   source: user_confirm — 用户手动确认/否定后写入
--   source: preset       — 系统内置词典种子
-- ============================================================

-- 移除旧的 rule_type CHECK 约束，改为更宽松版本
ALTER TABLE user_rules
  DROP CONSTRAINT IF EXISTS user_rules_rule_type_check;

ALTER TABLE user_rules
  ADD CONSTRAINT user_rules_rule_type_check
  CHECK (rule_type IN (
    'item_mapping', 'sub_item_mapping', 'type_routing',
    'fuzzy_resolution', 'function_mapping', 'tool_mapping',
    'no_assign'
  ));
