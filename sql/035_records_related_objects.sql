-- 035_records_related_objects.sql
-- 为记录增加「涉及对象」字段，用于存储弱关联的公司名、人名、客户名等对象线索
-- 这些对象先于事项存在，可以在持续跟进后升级为正式事项

ALTER TABLE records ADD COLUMN IF NOT EXISTS related_objects text[] DEFAULT '{}';

-- 同时为 review_status 增加枚举说明（不修改约束，保留文档性注释）
-- 'unchecked': 新创建，AI 建议未确认
-- 'confirmed': 用户或高置信自动确认
-- 'corrected': 用户纠正了 AI 建议
-- 'disputed': 用户标记为不确定

COMMENT ON COLUMN records.related_objects IS
  '弱关联对象线索，存储记录中提到但未升级为正式 item 的公司名、人名、客户名等';
