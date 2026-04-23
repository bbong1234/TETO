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

export const RECORD_LINK_TYPES = ['completes', 'derived_from', 'postponed_from', 'related_to'] as const;
export type RecordLinkType = typeof RECORD_LINK_TYPES[number];

export const LIFECYCLE_STATUSES = ['active', 'completed', 'postponed', 'cancelled'] as const;
export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];

export const ITEM_STATUSES = ['活跃', '推进中', '放缓', '停滞', '已完成', '已搁置'] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

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
  goal_id: string | null;
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
  lifecycle_status?: LifecycleStatus;    // 生命周期状态
  created_at: string;
  updated_at: string;
  // 关联数据（查询时可能附带）
  date?: string;
  tags?: Tag[];
  item?: { id: string; title: string } | null;
  linked_records?: RecordLink[];         // 微关联记录
}

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
  /** @deprecated 1.4 中目标通过 goals.item_id 反向关联，此字段将在后续版本移除 */
  goal_id: string | null;
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

export interface CreateRecordLinkPayload {
  source_id: string;
  target_id: string;
  link_type: RecordLinkType;
}

// ============================================
// API 请求/响应类型 — 创建 payload
// ============================================

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
  goal_id?: string;
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
  lifecycle_status?: LifecycleStatus;
  tag_ids?: string[];
}

export interface UpdateRecordPayload {
  content?: string;
  type?: RecordType;
  occurred_at?: string | null;
  status?: string;
  mood?: string;
  energy?: string;
  result?: string;
  note?: string;
  item_id?: string | null;
  phase_id?: string | null;
  goal_id?: string | null;
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
  lifecycle_status?: LifecycleStatus;
  tag_ids?: string[];
}

export interface CreateItemPayload {
  title: string;
  description?: string;
  status?: ItemStatus;
  color?: string;
  icon?: string;
  is_pinned?: boolean;
  started_at?: string;
  goal_id?: string;
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
  goal_id?: string | null;
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

export interface InsightsQuery {
  date_from: string;
  date_to: string;
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

// 洞察固定返回结构
export interface InsightsData {
  record_overview: {
    total_7d: number;
    total_30d: number;
    type_distribution: { type: string; count: number }[];
    tag_distribution: { tag_name: string; count: number }[];
    daily_counts: { date: string; count: number }[];
  };
  item_overview: {
    active_count: number;
    top_items: { id: string; title: string; record_count: number }[];
    stale_items: { id: string; title: string; last_record_at: string | null }[];
  };
  phaseInsights?: {
    recentPhases: Phase[];
    statusDistribution: { status: string; count: number }[];
    itemsWithPhaseChanges: { item_id: string; item_title: string; phase_count: number }[];
  };
  goalInsights?: {
    totalGoals: number;
    statusDistribution: { status: string; count: number }[];
    goalsWithAssociations: { goal_id: string; goal_title: string; item_count: number; record_count: number }[];
  };
}

// ============ 目标与阶段 ============

// 目标状态（中文化）
export const GOAL_STATUSES = ['进行中', '已达成', '已放弃', '已暂停'] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

// 阶段状态（最小可用版：3个核心状态）
export const PHASE_STATUSES = ['进行中', '已结束', '停滞'] as const;
export type PhaseStatus = typeof PHASE_STATUSES[number];

// 度量类型
export const GOAL_MEASURE_TYPES = ['boolean', 'numeric'] as const;
export type GoalMeasureType = typeof GOAL_MEASURE_TYPES[number];

// 目标接口
export interface Goal {
  id: string;
  user_id: string;
  item_id: string | null;
  phase_id: string | null;
  title: string;
  description: string | null;
  status: GoalStatus;
  measure_type: GoalMeasureType;
  target_value: number | null;
  current_value: number | null;
  // 量化引擎 Benchmark 字段
  metric_name: string | null;     // 关联指标名（如 '单词', '听读'），用于防串库精准匹配
  unit: string | null;            // 计量单位（如 '个', '分'）
  daily_target: number | null;    // 日均期望值（如 110）
  start_date: string | null;      // 起算日（如 '2024-12-23'）
  deadline_date: string | null;   // 截止日（可选，如 '2026-12-31'）
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

// 创建目标请求
export interface CreateGoalPayload {
  title: string;
  description?: string;
  status?: GoalStatus;
  item_id?: string;
  phase_id?: string | null;
  measure_type?: GoalMeasureType;
  target_value?: number | null;
  current_value?: number | null;
  // 量化引擎 Benchmark 字段
  metric_name?: string | null;
  unit?: string | null;
  daily_target?: number | null;
  start_date?: string | null;
  deadline_date?: string | null;
}

// 更新目标请求
export interface UpdateGoalPayload {
  title?: string;
  description?: string;
  status?: GoalStatus;
  item_id?: string | null;
  phase_id?: string | null;
  measure_type?: GoalMeasureType;
  target_value?: number | null;
  current_value?: number | null;
  // 量化引擎 Benchmark 字段
  metric_name?: string | null;
  unit?: string | null;
  daily_target?: number | null;
  start_date?: string | null;
  deadline_date?: string | null;
}

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

// 更新阶段请求
export interface UpdatePhasePayload {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status?: PhaseStatus;
  is_historical?: boolean;
  sort_order?: number;
}

// 查询参数
export interface GoalsQuery {
  status?: GoalStatus;
  item_id?: string;
  phase_id?: string;
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

// ============ 量化目标引擎输出 ============

export interface GoalEngineResult {
  goal_id: string;
  goal_title: string;
  unit: string;
  daily_target: number;
  start_date: string;

  // 时间维度
  total_passed_days: number;       // 从 start_date 到今天的天数
  remaining_days: number | null;   // 到 deadline_date 的剩余天数（无 deadline 则 null）

  // 今日
  today_actual: number;            // 今日 metric_value 合计

  // 累计
  total_expected: number;          // total_passed_days × daily_target
  total_actual: number;            // 历史全部 metric_value 求和
  deficit: number;                 // total_actual - total_expected（负数=欠债）

  // 比率
  completion_rate: number;         // total_actual / total_expected（如 0.5076）

  // 均值
  daily_average: number;           // total_actual / total_passed_days
  avg_7d: number;                  // 近7天日均
  avg_30d: number;                 // 近30天日均

  // 配速器（仅当 target_value + deadline_date 存在时有值）
  total_target: number | null;
  dynamic_daily_pacer: number | null;  // (total_target - total_actual) / remaining_days

  // 周/月投射
  weekly_target: number;           // daily_target × 7
  monthly_target: number;          // daily_target × 30
  weekly_projection: number;       // daily_average × 7
  monthly_projection: number;      // daily_average × 30
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
