// TETO 类型定义
// 核心数据结构、关系约束与 CRUD 类型

// 语义解析引擎类型 re-export
export type { ParsedSemantic, ParsedResult, TimeAnchor, SemanticMetric, ClauseRelation } from './semantic';
import type { ParsedSemantic } from './semantic';

// ============================================
// 枚举/字面量类型
// ============================================

export const RECORD_TYPES = ['发生', '计划', '想法', '总结'] as const;
export type RecordType = typeof RECORD_TYPES[number];

/** 将旧类型（情绪/花费/结果）映射为4种主类型 */
export function normalizeRecordType(type: string): RecordType {
  if ((RECORD_TYPES as readonly string[]).includes(type)) return type as RecordType;
  if (['情绪', '花费', '结果'].includes(type)) return '发生';
  return '发生';
}

export const RECORD_LINK_TYPES = ['completes', 'derived_from', 'postponed_from', 'related_to'] as const;
export type RecordLinkType = typeof RECORD_LINK_TYPES[number];

export const LIFECYCLE_STATUSES = ['active', 'completed', 'postponed', 'cancelled'] as const;
export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];

export const ITEM_STATUSES = ['活跃', '推进中', '放缓', '停滞', '已完成', '已搁置'] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

// ============================================
// 枚举标签映射（DB 存英文，前端显示中文）
// ============================================

export const OUTCOME_TYPE_LABELS: { [key: string]: string } = {
  done: '完成',
  progress: '推进',
  recovered: '恢复',
  maintained: '维持',
  interrupted: '被打断',
  stagnant: '停滞',
  consumed: '消耗',
  deviated: '偏离',
  no_change: '无明显结果',
};

export const OUTCOME_DIRECTION_LABELS: { [key: string]: string } = {
  positive: '正向',
  neutral: '中性',
  negative: '负向',
};

export const PLACE_TYPE_LABELS: { [key: string]: string } = {
  home: '家', office: '公司', commuting: '路上', transport: '交通中',
  shop: '店铺', hospital: '医院', school: '学校', outdoor: '户外',
  online: '线上', other: '其他',
};

export const MONEY_DIRECTION_LABELS: { [key: string]: string } = {
  expense: '支出', income: '收入', none: '无',
};

// ============================================
// 核心接口
// ============================================

export interface RecordDay {
  id: string;
  user_id: string;
  date: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Record {
  id: string;
  user_id: string;
  record_day_id: string;
  content: string;
  type: RecordType;
  occurred_at: string | null;
  status: string | null;
  mood: string | null;
  energy: string | null;
  result: string | null;
  note: string | null;
  item_id: string | null;
  phase_id: string | null;
  sub_item_id: string | null;
  sort_order: number;
  is_starred: boolean;
  cost: number | null;
  metric_value: number | null;
  metric_unit: string | null;
  metric_name: string | null;
  duration_minutes: number | null;
  raw_input?: string | null;
  parsed_semantic?: ParsedSemantic | null;
  time_anchor_date?: string | null;
  linked_record_id?: string | null;
  location?: string | null;
  people?: string[] | null;
  batch_id?: string | null;              // 同源拆分批次 ID
  input_id?: string | null;             // 用户输入编号（TETO 1.6）
  parent_input_id?: string | null;      // 复合句父输入编号
  lifecycle_status?: LifecycleStatus;    // 生命周期状态
  // 规律/历史字段
  data_nature?: 'fact' | 'inferred';      // 数据性质：fact=原始事实, inferred=推断条目
  is_period_rule?: boolean;              // 是否为概括性规律记录
  period_start_date?: string | null;     // 规律起始日
  period_end_date?: string | null;       // 规律结束日
  period_frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular' | null; // 规律频率
  period_expanded?: boolean;             // 规律是否已展开
  period_source_id?: string | null;      // 推断条目的来源规律记录ID
  // === 三层九组 Phase 1 新增 ===
  // L2-B 时间组
  occurred_at_end?: string | null;       // 结束时间
  time_text?: string | null;             // 原文时间表达
  time_precision?: 'exact' | 'approx' | 'fuzzy' | 'unknown' | 'inherited' | null; // 时间精度（inherited=从主记录继承，仅用于排序，不显示）
  // L2-D 发生主干组
  action_text?: string | null;           // 实际动作
  event_text?: string | null;            // 事件表达
  object_text?: string | null;           // 动作/事件指向对象
  // L2-G 结果组
  outcome_type?: string | null;          // 英文枚举
  outcome_direction?: 'positive' | 'neutral' | 'negative' | null; // 结果方向
  // L2-F 因果组
  cause_text?: string | null;            // 原因
  // L2-H 地点组
  place_type?: string | null;            // 英文枚举
  // L2-I 量化组
  money_direction?: 'expense' | 'income' | 'none' | null; // 资金方向
  metrics?: import('./semantic').SemanticMetric[]; // 量化指标数组
  // L2-H 人物组补充
  relation_roles?: string[] | null;      // 关系角色数组
  // L3-J 组织组
  review_status?: 'unchecked' | 'confirmed' | 'corrected' | 'disputed'; // 审核状态
  confidence_level?: 'low' | 'medium' | 'high' | null;      // AI 提取可信度
  // L3 附属属性
  body_state?: string | null;            // 身体状态：累/困/饿/头疼/没精神
  money_currency?: string | null;        // 金额币种，默认 CNY
  // L1-A 原始层
  input_source?: 'manual' | 'ai' | 'quick' | 'edit' | 'import'; // 输入来源
  // === TETO 1.6 录入与计算重构 新增 ===
  input_unit_id?: string | null;          // 反向追溯：本 record 来自哪个 input_unit
  record_quality_tag?: RecordQualityTag | null; // 前端色条标签
  created_at: string;
  updated_at: string;
  // 关联数据（查询时可能附带）
  date?: string;
  tags?: Tag[];
  item?: { id: string; title: string } | null;
  linked_records?: RecordLinkWithPeer[];
}

/**
 * 记录质量标签（前端列表色条）。
 * - ai_high      AI 一次解析、置信度高
 * - clarified    用户在录入时澄清过至少一个字段
 * - corrected    用户事后修正过
 * - ai_failed    AI 解析失败强写默认值
 * - partial      3 轮封顶但仍缺关键字段
 */
export type RecordQualityTag = 'ai_high' | 'clarified' | 'corrected' | 'ai_failed' | 'partial';

export interface Item {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: ItemStatus;
  color: string | null;
  icon: string | null;
  is_pinned: boolean;
  started_at: string | null;
  ended_at: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  // 关联数据
  recent_records?: Record[];
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  type: string | null;
  created_at: string;
}

export interface RecordTag {
  id: string;
  user_id: string;
  record_id: string;
  tag_id: string;
  created_at: string;
}

/** Record-to-Record 微关联 */
export interface RecordLink {
  id: string;
  user_id: string;
  source_id: string;
  target_id: string;
  link_type: RecordLinkType;
  created_at: string;
}

/** 带对方记录摘要的关联（查询时返回） */
export interface RecordLinkWithPeer extends RecordLink {
  peer_id: string;
  peer_content: string;
  peer_type: string;
  peer_occurred_at: string | null;
}

export interface CreateRecordLinkPayload {
  source_id: string;
  target_id: string;
  link_type: RecordLinkType;
}

// ============================================
// API 请求/响应类型 — 创建 payload
// ============================================

/**
 * 创建记录的请求载荷。`content` 和 `date` 为必填。
 *
 * 与 {@link UpdateRecordPayload} 的关系：
 * - Update 中 `content` 变为可选，`date` 不可修改（省略）
 * - Update 中 `occurred_at`、`item_id` 允许传 `null` 以清除值
 * - 其余字段完全相同
 */
export interface CreateRecordPayload {
  content: string;
  date: string;
  type?: RecordType;
  occurred_at?: string;
  status?: string;
  mood?: string;
  energy?: string;
  result?: string;
  note?: string;
  item_id?: string;
  phase_id?: string | null;
  sub_item_id?: string | null;
  sort_order?: number;
  is_starred?: boolean;
  cost?: number | null;
  metric_value?: number | null;
  metric_unit?: string | null;
  metric_name?: string | null;
  duration_minutes?: number | null;
  raw_input?: string | null;
  parsed_semantic?: ParsedSemantic | null;
  time_anchor_date?: string | null;
  linked_record_id?: string | null;
  location?: string | null;
  people?: string[] | null;
  batch_id?: string | null;
  input_id?: string | null;             // TETO 1.6
  parent_input_id?: string | null;
  lifecycle_status?: LifecycleStatus;
  tag_ids?: string[];
  // 规律/历史字段
  data_nature?: 'fact' | 'inferred';
  is_period_rule?: boolean;
  period_start_date?: string | null;
  period_end_date?: string | null;
  period_frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular' | null;
  period_expanded?: boolean;
  period_source_id?: string | null;
  // === 三层九组 Phase 1 新增 ===
  occurred_at_end?: string | null;
  time_text?: string | null;
  time_precision?: 'exact' | 'approx' | 'fuzzy' | 'unknown' | 'inherited' | null;
  action_text?: string | null;
  event_text?: string | null;
  object_text?: string | null;
  outcome_type?: string | null;
  outcome_direction?: 'positive' | 'neutral' | 'negative' | null;
  cause_text?: string | null;
  place_type?: string | null;
  money_direction?: 'expense' | 'income' | 'none' | null;
  metrics?: import('./semantic').SemanticMetric[];
  relation_roles?: string[] | null;
  review_status?: 'unchecked' | 'confirmed' | 'corrected' | 'disputed';
  confidence_level?: 'low' | 'medium' | 'high' | null;
  input_source?: 'manual' | 'ai' | 'quick' | 'edit' | 'import';
  body_state?: string | null;
  money_currency?: string | null;
  // === TETO 1.6 录入与计算重构 新增 ===
  input_unit_id?: string | null;
  record_quality_tag?: RecordQualityTag | null;
}

/** 更新记录载荷。所有字段可选。`occurred_at`、`item_id` 可传 `null` 清除。详见 {@link CreateRecordPayload}。 */
export type UpdateRecordPayload = Omit<CreateRecordPayload, 'content' | 'date' | 'occurred_at' | 'item_id'> & {
  content?: string;
  occurred_at?: string | null;
  item_id?: string | null;
};

export interface CreateItemPayload {
  title: string;
  description?: string;
  status?: ItemStatus;
  color?: string;
  icon?: string;
  is_pinned?: boolean;
  started_at?: string;
  folder_id?: string | null;
}

export interface UpdateItemPayload {
  title?: string;
  description?: string;
  status?: ItemStatus;
  color?: string;
  icon?: string;
  is_pinned?: boolean;
  started_at?: string;
  ended_at?: string;
  folder_id?: string | null;
}

export interface CreateTagPayload {
  name: string;
  color?: string;
  type?: string;
}

export interface UpdateTagPayload {
  name?: string;
  color?: string;
  type?: string;
}

// ============================================
// 查询参数类型
// ============================================

export interface RecordsQuery {
  date?: string;
  date_from?: string;
  date_to?: string;
  item_id?: string;
  sub_item_id?: string;
  type?: RecordType;
  tag_id?: string;
  is_starred?: boolean;
  search?: string;
  limit?: number;
}

export interface ItemsQuery {
  status?: ItemStatus;
  is_pinned?: boolean;
  folder_id?: string | null;
}

/** 洞察 API 可按块计算（GET ?metrics= 逗号分隔）；缺省或未识别则全量 */
export const INSIGHT_METRIC_IDS = [
  'recent_timeline',
  'activity_heatmap',
  'summary',
  'items',
  'goals',
  'time_distribution',
  'comparison',
  'data_review',
] as const;
export type InsightMetricId = (typeof INSIGHT_METRIC_IDS)[number];

export interface InsightsQuery {
  date_from: string;
  date_to: string;
  /** 仅计算这些块；含 summary 时会自动带上摘要依赖的 items/goals/comparison/time_distribution/data_review */
  metrics?: InsightMetricId[];
}

// ============================================
// API 响应类型
// ============================================

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiError {
  error: string;
  details?: string;
}

// ============================================
// 洞察页类型定义（重构后）
// ============================================

// ── 时间线 ──
export interface TimelineEntry {
  id: string;
  start_time?: string;   // "HH:MM" 格式，来自 occurred_at
  end_time?: string;     // "HH:MM" 格式，来自 occurred_at_end
  text: string;          // 优先 action_text + event_text 合并，否则 content
}

export interface DayTimeline {
  date: string;          // YYYY-MM-DD
  label: string;         // "今天" / "昨天" / "5月3日"
  record_count: number;
  records: TimelineEntry[];
}

// ── 活跃热力图 ──
export interface ActivityDay {
  date: string;          // YYYY-MM-DD
  record_count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

// ── 事项活动 ──
export interface ItemActivity {
  item_id: string;
  item_title: string;
  record_count: number;
  total_duration_minutes: number;
  last_record_at: string | null;
}

export interface StagnantItem {
  item_id: string;
  item_title: string;
  stagnation_days: number;
  last_record_at: string | null;
}

export interface ItemTimeRanking {
  item_id: string;
  item_title: string;
  total_duration_minutes: number;
  record_count: number;
  percentage: number;
}

// ── 目标进度 ──
export interface GoalProgress {
  goal_id: string;
  goal_text: string;         // 用户原始目标句
  current_value: number;
  target_value: number;
  unit: string;
  period_label: string;      // "7天" / "本周" / "本月" / "累计"
  is_over_limit?: boolean;   // 仅周期性限制型
  rule_type: GoalRuleType;   // 内部逻辑用，不展示给用户
}

// ── 事实 ──
export interface InsightFact {
  text: string;
  timeScope: string;
  source: string;
  itemId?: string;
}

// ── 周期对比变化 ──
export interface InsightChange {
  label: string;             // "记录数" / "英语记录" / "时长"
  value: number | string;
  unit: string;              // "条" / "h" / "分钟" / "天"
  direction: 'up' | 'down' | 'same';
  scope: 'week' | 'month';  // 周变化 or 月变化
}

// ── 数据待整理 ──
export interface DataReview {
  unassigned_count: number;
  inferred_count: number;
  missing_time_count: number;
  pending_goal_draft_count: number;
}

// 洞察固定返回结构
export interface InsightsData {
  // 今日/昨日时间线（不受日期范围影响）
  recent_timeline: {
    today: DayTimeline;
    yesterday: DayTimeline;
  };

  // 活跃热力图（180天）
  activity_heatmap: {
    days: ActivityDay[];
  };

  // 本期摘要（3-5条核心事实）
  summary: {
    headline_facts: InsightFact[];
  };

  // 当前日期范围元信息
  range: {
    date_from: string;
    date_to: string;
    label: string;           // "近 7 天" / "近 30 天" / "本月" / "自定义"
  };

  // 事项活动
  items: {
    active_items: ItemActivity[];
    time_ranking: ItemTimeRanking[];
    stagnant_items: StagnantItem[];
  };

  // 目标进度
  goals: {
    progress: GoalProgress[];
  };

  // 时间分布
  time_distribution: {
    morning: number;    // 6-12点
    afternoon: number;  // 12-18点
    evening: number;    // 18-22点
    night: number;      // 22-6点
  };

  // 周期对比
  comparison: {
    changes: InsightChange[];
  };

  // 数据待整理
  data_review: DataReview;

  // 事实来源（完整列表，含底部 AI 润色用）
  facts: InsightFact[];
}

// ============ 目标与阶段 ============

// 目标状态
export const GOAL_STATUSES = ['草稿', '进行中', '已完成', '暂停', '放弃'] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

// 阶段状态（最小可用版：3个核心状态）
export const PHASE_STATUSES = ['进行中', '已结束', '停滞'] as const;
export type PhaseStatus = typeof PHASE_STATUSES[number];

// 目标规则类型
export const GOAL_RULE_TYPES = ['一次性完成', '周期性达成', '周期性限制'] as const;
export type GoalRuleType = typeof GOAL_RULE_TYPES[number];

// 目标操作符
export const GOAL_OPERATORS = ['>=', '<=', '=', 'between', 'before', 'after', 'complete'] as const;
export type GoalOperator = typeof GOAL_OPERATORS[number];

// 目标周期
export const GOAL_PERIODS = ['无', '每天', '每周', '每月', '每年', '本周', '本月'] as const;
export type GoalPeriod = typeof GOAL_PERIODS[number];

// 目标来源
export const GOAL_SOURCES = ['手动创建', '从记录生成', '系统建议'] as const;
export type GoalSource = typeof GOAL_SOURCES[number];

// 目标进度来源
export const GOAL_PROGRESS_SOURCES = ['记录统计', '手动更新', '暂无'] as const;
export type GoalProgressSource = typeof GOAL_PROGRESS_SOURCES[number];

// 目标接口
export interface Goal {
  id: string;
  user_id: string;
  item_id: string | null;
  phase_id: string | null;
  sub_item_id: string | null;
  title: string;
  description: string | null;
  status: GoalStatus;

  goal_text: string;               // 用户原始目标句
  rule_type: GoalRuleType;         // 3类规则
  operator: GoalOperator;          // 比较操作符

  metric_name: string | null;      // 防串库指标名
  target_value: number | null;     // 目标值（等同于 target_min）
  target_min: number | null;       // 达成目标值 / 区间下限
  target_max: number | null;       // 限制上限 / 区间上限
  unit: string | null;             // 计量单位
  period: GoalPeriod | null;       // 周期

  start_date: string | null;       // 起算日
  end_date: string | null;         // 结束日（如习惯持续30天）
  deadline: string | null;         // 截止日

  source: GoalSource;              // 来源
  confirmation_required: boolean;  // 是否需要确认
  progress_source: GoalProgressSource;  // 进度来源
  current_value: number | null;    // 当前值（手动更新型）

  created_at: string;
  updated_at: string;
}

// 阶段接口
export interface Phase {
  id: string;
  user_id: string;
  item_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: PhaseStatus;
  is_historical: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 动态附加（API 返回时计算）
  aggregation?: PhaseAggregation | null;
  goals?: Goal[];  // 该阶段下的目标列表
}

/**
 * 创建目标载荷。`title` 为必填。
 *
 * 与 {@link UpdateGoalPayload} 的关系：
 * - Update 中 `title` 变为可选
 * - Update 中 `item_id` 允许传 `null` 以清除值
 * - 其余字段完全相同
 */
// 创建目标请求
export interface CreateGoalPayload {
  title: string;
  description?: string;
  status?: GoalStatus;
  item_id?: string;
  phase_id?: string | null;
  sub_item_id?: string | null;
  goal_text?: string;
  rule_type?: GoalRuleType;
  operator?: GoalOperator;
  metric_name?: string | null;
  target_value?: number | null;
  target_min?: number | null;
  target_max?: number | null;
  unit?: string | null;
  period?: GoalPeriod | null;
  start_date?: string | null;
  end_date?: string | null;
  deadline?: string | null;
  source?: GoalSource;
  confirmation_required?: boolean;
  progress_source?: GoalProgressSource;
  current_value?: number | null;
}

/** 更新目标载荷。所有字段可选。`item_id` 可传 `null` 清除。详见 {@link CreateGoalPayload}。 */
export type UpdateGoalPayload = Omit<CreateGoalPayload, 'title' | 'item_id'> & {
  title?: string;
  item_id?: string | null;
};

/**
 * 创建阶段载荷。`item_id` 和 `title` 为必填。
 *
 * 与 {@link UpdatePhasePayload} 的关系：
 * - Update 中省略 `item_id`（不可变更归属），`title` 变为可选
 * - 其余字段完全相同
 */
// 创建阶段请求
export interface CreatePhasePayload {
  item_id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status?: PhaseStatus;
  is_historical?: boolean;
  sort_order?: number;
}

/** 更新阶段载荷。所有字段可选，`item_id` 不可修改。详见 {@link CreatePhasePayload}。 */
export type UpdatePhasePayload = Omit<CreatePhasePayload, 'item_id' | 'title'> & {
  title?: string;
};

// 查询参数
export interface GoalsQuery {
  status?: GoalStatus;
  item_id?: string;
  phase_id?: string;
  sub_item_id?: string;
  rule_type?: GoalRuleType;
  source?: GoalSource;
}

export interface PhasesQuery {
  item_id?: string;
  status?: PhaseStatus;
  is_historical?: boolean;
}

// 文件夹接口
export interface ItemFolder {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 创建文件夹请求
export interface CreateItemFolderPayload {
  name: string;
  color?: string;
  sort_order?: number;
}

// 更新文件夹请求
export interface UpdateItemFolderPayload {
  name?: string;
  color?: string;
  sort_order?: number;
}

// 事项聚合数据
export interface ItemAggregation {
  total_cost: number;
  total_duration_minutes: number;
  metric_summaries: {
    metric_name: string;
    total_value: number;
    metric_unit: string;
  }[];
  record_count: number;
}

// ============ 子项 ============

// 子项接口
export interface SubItem {
  id: string;
  user_id: string;
  item_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 动态附加（查询时计算）
  record_count?: number;
  goal_count?: number;
  last_record_at?: string | null;
}

// 创建子项请求
export interface CreateSubItemPayload {
  item_id: string;
  title: string;
  description?: string;
  sort_order?: number;
}

// 更新子项请求
export interface UpdateSubItemPayload {
  title?: string;
  description?: string | null;
  sort_order?: number;
}

// 子项查询参数
export interface SubItemsQuery {
  item_id?: string;
}

// ============ 统一目标引擎输出 ============

export interface GoalEngineResult {
  goal_id: string;
  goal_title: string;
  rule_type: GoalRuleType;
  unit: string;

  // ── 计算可追溯（TETO 1.6 P1） ──
  computation_id?: string;
  explain?: string;

  // ── 通用时间维度 ──
  start_date: string | null;
  total_passed_days: number;
  remaining_days: number | null;       // 到 deadline 的剩余天数

  // ── 当前周期（周期性目标） ──
  current_period_start: string | null;
  current_period_end: string | null;
  current_period_actual: number;       // 当前周期实际值
  current_period_target: number;       // 当前周期目标值
  current_period_progress: number;     // 0~1

  // ── 累计维度（一次性完成） ──
  today_actual: number;                // 今日 metric_value 合计
  total_actual: number;                // 累计实际值
  total_target: number | null;         // 累计目标值
  total_expected: number | null;       // 基于日均累计应达
  deficit: number | null;              // total_actual - total_expected

  // ── 通用指标 ──
  completion_rate: number | null;      // 完成率
  completion_rate_7d: number | null;   // 近7天完成度
  completion_rate_30d: number | null;  // 近30天完成度
  daily_average: number | null;        // 日均
  avg_7d: number | null;              // 近7天日均
  avg_30d: number | null;             // 近30天日均
  deficit_7d: number | null;          // 近7天窗口差额
  deficit_30d: number | null;         // 近30天窗口差额
  dynamic_daily_pacer: number | null;  // 配速器

  // ── 超限预警（周期性限制专用） ──
  is_over_limit: boolean | null;       // 是否已超限
  remaining_budget: number | null;     // 剩余预算（target_max - actual）
  projected_period_total: number | null; // 预计本期总量

  // ── 周/月投射 ──
  weekly_target: number | null;
  monthly_target: number | null;
  weekly_projection: number | null;
  monthly_projection: number | null;
}

// ============ AI 目标解析输出 ============

export interface ParsedGoalSuggestion {
  goal_text: string;
  rule_type: GoalRuleType;
  operator: GoalOperator;
  period: GoalPeriod | null;
  target_min: number | null;
  target_max: number | null;
  metric_name: string | null;
  unit: string | null;
  deadline: string | null;
}

export interface ParsedGoal {
  is_fuzzy: boolean;
  fuzzy_reason: string | null;
  suggestions: ParsedGoalSuggestion[];
  parsed: ParsedGoalSuggestion | null;
  suggested_item_name: string | null;
  confidence: number;
}

// 阶段聚合数据（阶段时间范围内的汇总）
export interface PhaseAggregation {
  total_cost: number;
  total_duration_minutes: number;
  metric_summaries: {
    metric_name: string;
    total_value: number;
    metric_unit: string;
  }[];
  record_count: number;
}
