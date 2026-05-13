-- ============================================================
-- 004: records 表三层九组模型 — Phase 1 主链补齐
--
-- 新增 18 个列，补齐"时间 → 发生 → 状态 → 结果"主链，
-- 让记录可独立统计，解决主链断裂、字段混层、统计口径不稳。
--
-- 枚举原则：DB 存英文，前端通过 *_LABELS 映射中文。
-- 前置条件：records 表已存在，003_period_rule_and_data_nature.sql 已执行。
-- ============================================================

-- ============================================================
-- L2-B 时间组
-- ============================================================

-- 1. occurred_at_end —— 结束时间
ALTER TABLE records ADD COLUMN IF NOT EXISTS occurred_at_end TIMESTAMPTZ;
COMMENT ON COLUMN records.occurred_at_end IS '结束时间（与 occurred_at 配对，可空）';

-- 2. time_text —— 原文时间表达
ALTER TABLE records ADD COLUMN IF NOT EXISTS time_text TEXT;
COMMENT ON COLUMN records.time_text IS '原文时间表达（如"昨晚"、"下班路上"、"今天早上"）';

-- 3. time_precision —— 时间精度
ALTER TABLE records ADD COLUMN IF NOT EXISTS time_precision TEXT
  CHECK(time_precision IS NULL OR time_precision IN ('exact','approx','fuzzy','unknown'));
COMMENT ON COLUMN records.time_precision IS '时间精度：exact=精确, approx=大约, fuzzy=模糊, unknown=未知';

-- ============================================================
-- L2-D 发生主干组（核心新增）
-- ============================================================

-- 4. action_text —— 实际动作
ALTER TABLE records ADD COLUMN IF NOT EXISTS action_text TEXT;
COMMENT ON COLUMN records.action_text IS '实际动作（如"开会"、"躺着"、"通勤"、"买咖啡"）';

-- 5. event_text —— 事件表达
ALTER TABLE records ADD COLUMN IF NOT EXISTS event_text TEXT;
COMMENT ON COLUMN records.event_text IS '事件表达（如"会议太长"、"地铁太挤"、"被客户改需求"）';

-- 6. object_text —— 动作/事件指向对象
ALTER TABLE records ADD COLUMN IF NOT EXISTS object_text TEXT;
COMMENT ON COLUMN records.object_text IS '动作或事件指向的对象（如"会议"、"咖啡"、"地铁"、"手机"）';

-- ============================================================
-- L2-G 结果组
-- ============================================================

-- 7. outcome_type —— 结果类型（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS outcome_type TEXT
  CHECK(outcome_type IS NULL OR outcome_type IN ('done','progress','recovered','maintained','interrupted','stagnant','consumed','deviated','no_change'));
COMMENT ON COLUMN records.outcome_type IS '结果类型：done=完成, progress=推进, recovered=恢复, maintained=维持, interrupted=被打断, stagnant=停滞, consumed=消耗, deviated=偏离, no_change=无明显结果';

-- 8. outcome_direction —— 结果方向（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS outcome_direction TEXT
  CHECK(outcome_direction IS NULL OR outcome_direction IN ('positive','neutral','negative'));
COMMENT ON COLUMN records.outcome_direction IS '结果方向：positive=正向, neutral=中性, negative=负向';

-- ============================================================
-- L2-F 因果组
-- ============================================================

-- 9. cause_text —— 原因
ALTER TABLE records ADD COLUMN IF NOT EXISTS cause_text TEXT;
COMMENT ON COLUMN records.cause_text IS '原因（如"因为昨晚没睡好"、"因为会议太长"）';

-- ============================================================
-- L2-H 地点组
-- ============================================================

-- 10. place_type —— 地点类型（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS place_type TEXT
  CHECK(place_type IS NULL OR place_type IN ('home','office','commuting','transport','shop','hospital','school','outdoor','online','other'));
COMMENT ON COLUMN records.place_type IS '地点类型：home=家, office=公司, commuting=路上, transport=交通中, shop=店铺, hospital=医院, school=学校, outdoor=户外, online=线上, other=其他';

-- ============================================================
-- L2-I 量化组
-- ============================================================

-- 11. money_direction —— 资金方向（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS money_direction TEXT
  CHECK(money_direction IS NULL OR money_direction IN ('expense','income','none'));
COMMENT ON COLUMN records.money_direction IS '资金方向：expense=支出, income=收入, none=无';

-- 12. metrics —— 多指标数组（默认空数组）
ALTER TABLE records ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN records.metrics IS '量化指标数组，格式: [{"name":"时长","value":40,"unit":"分钟"},{"name":"步数","value":6000,"unit":"步"}]，默认空数组 []';

-- ============================================================
-- L2-H 人物组补充
-- ============================================================

-- 13. relation_roles —— 关系角色数组
ALTER TABLE records ADD COLUMN IF NOT EXISTS relation_roles TEXT[];
COMMENT ON COLUMN records.relation_roles IS '关系角色数组（如 ["同事","家人","客户","朋友","领导"]），与 people 互补';

-- ============================================================
-- L3-J 组织组
-- ============================================================

-- 14. review_status —— 审核状态（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unchecked'
  CHECK(review_status IN ('unchecked','confirmed','corrected'));
COMMENT ON COLUMN records.review_status IS '审核状态：unchecked=未检查, confirmed=已确认, corrected=已纠错';

-- 15. confidence_level —— AI 提取可信度（英文枚举）
ALTER TABLE records ADD COLUMN IF NOT EXISTS confidence_level TEXT
  CHECK(confidence_level IS NULL OR confidence_level IN ('low','medium','high'));
COMMENT ON COLUMN records.confidence_level IS 'AI 提取可信度：low=低, medium=中, high=高';

-- ============================================================
-- L1-A 原始层
-- ============================================================

-- 16. input_source —— 输入来源
ALTER TABLE records ADD COLUMN IF NOT EXISTS input_source TEXT DEFAULT 'manual'
  CHECK(input_source IN ('manual','ai','quick','edit','import'));
COMMENT ON COLUMN records.input_source IS '输入来源：manual=手动, ai=AI生成, quick=快速录入, edit=编辑, import=导入';

-- ============================================================
-- RECORD_TYPE 扩展：补齐 DB CHECK 与 TS 枚举的对齐
-- DB 侧 1.3 建表时已有 7 种 CHECK，但 TS 侧只暴露了 4 种。
-- 此处不改动 DB（已有完整 CHECK），仅由 TS 侧补齐。
-- ============================================================
-- 注意：1.3 建表 SQL 中 type 的 CHECK 已包含：
--   '发生','计划','情绪','想法','花费','总结','结果'
-- 无需 ALTER。TS 侧将同步扩展。

-- ============================================================
-- 索引
-- ============================================================

-- outcome_type 索引（统计查询高频）
CREATE INDEX IF NOT EXISTS idx_records_outcome_type
  ON records(outcome_type) WHERE outcome_type IS NOT NULL;

-- place_type 索引
CREATE INDEX IF NOT EXISTS idx_records_place_type
  ON records(place_type) WHERE place_type IS NOT NULL;

-- review_status 索引
CREATE INDEX IF NOT EXISTS idx_records_review_status
  ON records(review_status) WHERE review_status != 'unchecked';

-- input_source 索引
CREATE INDEX IF NOT EXISTS idx_records_input_source
  ON records(input_source) WHERE input_source != 'manual';

-- ============================================================
-- 验证：
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--     WHERE table_name = 'records'
--       AND column_name IN (
--         'occurred_at_end','time_text','time_precision',
--         'action_text','event_text','object_text',
--         'outcome_type','outcome_direction',
--         'cause_text','place_type',
--         'money_direction','metrics',
--         'relation_roles',
--         'review_status','confidence_level',
--         'input_source'
--       )
--     ORDER BY ordinal_position;
--   期望：16 rows
-- ============================================================
