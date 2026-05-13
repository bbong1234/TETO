/**
 * AI 写入策略 — 定义每个记录字段的 AI 写入权限
 *
 * 字段分为三类 owner：
 * - user: 用户完全控制，AI 永不可写（content, type, lifecycle_status, date 等）
 * - shared: 用户和 AI 共享，AI 在特定条件下可写
 * - ai: AI 自有字段，不受用户干预
 *
 * overwriteRule：
 * - never: 永不覆写已有值
 * - if_empty: 只在字段为 null/undefined 时写入（当前 OFFE 行为）
 * - if_unconfirmed: 只在 review_status≠'confirmed' 时写入
 */

export type FieldOwner = 'user' | 'ai' | 'shared'

export type OverwriteRule = 'never' | 'if_empty' | 'if_unconfirmed'

export interface AiFieldPolicy {
  field: string
  owner: FieldOwner
  aiCanWrite: boolean
  requiresReview: boolean    // AI 写入后是否需要 review
  overwriteRule: OverwriteRule
}

/**
 * 定义所有记录字段的 AI 写入策略
 *
 * 策略规则来源：
 * - content → user, never: 内容永不 AI 覆写
 * - type, lifecycle_status, date → user, never: 用户控制的生命周期字段
 * - item_id, sub_item_id → shared, if_empty: AI 可建议但只填空白
 * - metric_value/unit/name → shared, if_empty: AI 可补充度量信息
 * - mood, energy → shared, if_empty: AI 可推断情绪/能量
 * - location, people → shared, if_empty: AI 可提取位置/人物
 * - 三层九组字段 → shared, if_empty: AI 解析的结构化字段
 * - result, status → shared, if_empty: AI 推断
 * - parsed_semantic → ai, never: AI 解析结果，自有
 * - confidence_level → ai, never: AI 信心度
 * - review_status → shared, if_unconfirmed: AI 写入时设为 'unchecked'
 * - data_nature → shared, if_unconfirmed: AI 写入时设为 'inferred'
 * - period_source_id → ai, if_empty: AI 派生记录来源
 */
export const AI_FIELD_POLICIES: Record<string, AiFieldPolicy> = {
  // ── user 字段：AI 永不可写 ──
  content:               { field: 'content',               owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  type:                  { field: 'type',                  owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  lifecycle_status:      { field: 'lifecycle_status',      owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  date:                  { field: 'date',                  owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  occurred_at:           { field: 'occurred_at',           owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  is_starred:            { field: 'is_starred',            owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  sort_order:            { field: 'sort_order',            owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  note:                  { field: 'note',                  owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  raw_input:             { field: 'raw_input',             owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  is_period_rule:        { field: 'is_period_rule',        owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  period_frequency:      { field: 'period_frequency',      owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  period_start_date:     { field: 'period_start_date',     owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },
  period_end_date:       { field: 'period_end_date',       owner: 'user',   aiCanWrite: false, requiresReview: false, overwriteRule: 'never' },

  // ── shared 字段：AI 可在特定条件下写入 ──
  item_id:               { field: 'item_id',               owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  sub_item_id:           { field: 'sub_item_id',           owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  metric_value:          { field: 'metric_value',          owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  metric_unit:           { field: 'metric_unit',           owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  metric_name:           { field: 'metric_name',           owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  cost:                  { field: 'cost',                  owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  duration_minutes:      { field: 'duration_minutes',      owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  occurred_at_end:       { field: 'occurred_at_end',       owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  mood:                  { field: 'mood',                  owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  energy:                { field: 'energy',                owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  location:              { field: 'location',              owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  people:                { field: 'people',                owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  time_anchor_date:      { field: 'time_anchor_date',      owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  time_precision:        { field: 'time_precision',        owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },

  // 三层九组结构化字段
  action_text:           { field: 'action_text',           owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  event_text:            { field: 'event_text',            owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  object_text:           { field: 'object_text',           owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  outcome_type:          { field: 'outcome_type',          owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  outcome_direction:     { field: 'outcome_direction',     owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  cause_text:            { field: 'cause_text',            owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  time_text:             { field: 'time_text',             owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  place_type:            { field: 'place_type',            owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  money_direction:       { field: 'money_direction',       owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  relation_roles:        { field: 'relation_roles',        owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  body_state:            { field: 'body_state',            owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  money_currency:        { field: 'money_currency',        owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  result:                { field: 'result',                owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },
  status:                { field: 'status',                owner: 'shared', aiCanWrite: true,  requiresReview: true,  overwriteRule: 'if_empty' },

  // ── shared 特殊字段：if_unconfirmed ──
  review_status:         { field: 'review_status',         owner: 'shared', aiCanWrite: true,  requiresReview: false, overwriteRule: 'if_unconfirmed' },
  data_nature:           { field: 'data_nature',           owner: 'shared', aiCanWrite: true,  requiresReview: false, overwriteRule: 'if_unconfirmed' },

  // ── ai 字段：AI 自有 ──
  parsed_semantic:       { field: 'parsed_semantic',       owner: 'ai',     aiCanWrite: true,  requiresReview: false, overwriteRule: 'never' },
  confidence_level:      { field: 'confidence_level',      owner: 'ai',     aiCanWrite: true,  requiresReview: false, overwriteRule: 'never' },
  period_source_id:      { field: 'period_source_id',      owner: 'ai',     aiCanWrite: true,  requiresReview: false, overwriteRule: 'if_empty' },
}
