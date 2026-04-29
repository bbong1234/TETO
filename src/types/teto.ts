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
  lifecycle_status?: LifecycleStatus;    // 生命周期状态
  // 规律/历史字段
  data_nature?: 'fact' | 'inferred';      // 数据性质：fact=原始事实, inferred=推断条目
  is_period_rule?: boolean;              // 是否为概括性规律记录
  period_start_date?: string | null;     // 规律起始日
  period_end_date?: string | null;       // 规律结束日
  period_frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular' | null; // 规律频率
  period_expanded?: boolean;             // 规律是否已展开
  period_source_id?: string | null;      // 推断条目的来源规律记录ID
  created_at: string;
  updated_at: string;
  // 关联数据（查询时可能附带）
  date?: string;
  tags?: Tag[];
  item?: { id: string; title: string } | null;
  linked_records?: RecordLinkWithPeer[];
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
}

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
    /** 画像卡片数据：活跃事项 + 完成率 */
    portraits?: {
      id: string;
      title: string;
      record_count: number;
      completion_rate: number | null;  // null = 无量化目标
      deficit: number | null;          // 欠债量，null = 无目标
      last_record_at: string | null;
    }[];
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
  // 时间段分布（展示各时段的记录占比，不下结论）
  time_distribution?: {
    morning: number;    // 6-12点记录数
    afternoon: number;  // 12-18点记录数
    evening: number;    // 18-22点记录数
    night: number;      // 22-6点记录数
  };
  // 各事项时长占比排名（展示分布，不下结论）
  item_time_ranking?: Array<{
    item_id: string;
    item_title: string;
    total_duration_minutes: number;
    record_count: number;
    percentage: number;  // 占总时长的百分比
  }>;
  // 非事项区统计（未关联事项的记录）
  unassigned_stats?: {
    unassigned_count: number;
    unassigned_duration_minutes: number;
    unassigned_cost: number;
    total_count: number;
  };
  // 统计4主轴
  four_axes?: {
    // 主轴1：行动vs目标（各事项的记录数+目标进度）
    action_vs_goal: Array<{
      item_id: string;
      item_title: string;
      record_count: number;
      total_duration_minutes: number;
      has_goal: boolean;
      goal_title: string | null;
      goal_progress: number | null;  // 0~100 百分比，null=无量化目标
      deficit: number | null;        // 距目标还差多少
      deficit_unit: string | null;
    }>;
    // 主轴2：时间vs计划（计划类记录的完成率）
    time_vs_plan: {
      total_plans: number;
      completed_plans: number;
      completion_rate: number;      // 0~100
      overdue_plans: number;        // 已过期未完成
    };
    // 主轴3：投入vs效果（有结果记录的占比）
    effort_vs_result: {
      total_records_with_duration: number;
      total_hours: number;
      records_with_result: number;
      result_rate: number;         // 0~100 有结果记录占比
    };
    // 主轴4：近期时间分布（已有item_time_ranking，此处为7天摘要）
    recent_time_summary: {
      total_hours_7d: number;
      total_hours_30d: number;
      change_percent: number | null;  // 近7天vs前7天变化百分比
      top_item_title: string | null;
      top_item_hours: number | null;
    };
  };
  // 固定时间对比（本周vs上周/本月vs上月）
  period_comparison?: {
    this_week: { record_count: number; total_hours: number; total_cost: number };
    last_week: { record_count: number; total_hours: number; total_cost: number };
    this_month: { record_count: number; total_hours: number; total_cost: number };
    last_month: { record_count: number; total_hours: number; total_cost: number };
  };
  // 口径化指标（5大核心指标按事项计算）
  metrics_by_item?: Array<{
    item_id: string;
    item_title: string;
    activity: number;         // 活跃度 0~100
    effort: number;           // 投入 0~100（相对于最大值）
    stagnation_days: number;  // 停滞天数
    plan_achievement: number; // 计划达成率 0~100
    effectiveness: number;   // 效果 0~100
  }>;
  // 推断数据统计
  inferred_stats?: {
    total_records: number;       // 范围内总记录数
    inferred_count: number;      // 推断记录数
    fact_count: number;          // 事实记录数
    inferred_ratio: number;      // 推断占比 0~100
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
export const GOAL_MEASURE_TYPES = ['boolean', 'numeric', 'repeat'] as const;
export type GoalMeasureType = typeof GOAL_MEASURE_TYPES[number];

// 重复频率
export const REPEAT_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type RepeatFrequency = typeof REPEAT_FREQUENCIES[number];

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
  measure_type: GoalMeasureType;
  target_value: number | null;
  current_value: number | null;
  // 量化引擎 Benchmark 字段
  metric_name: string | null;     // 关联指标名（如 '单词', '听读'），用于防串库精准匹配
  unit: string | null;            // 计量单位（如 '个', '分'）
  daily_target: number | null;    // 日均期望值（如 110）
  start_date: string | null;      // 起算日（如 '2024-12-23'）
  deadline_date: string | null;   // 截止日（可选，如 '2026-12-31'）
  // 重复型目标字段
  repeat_frequency: RepeatFrequency | null;  // 重复频率（daily/weekly/monthly）
  repeat_count: number | null;               // 每周期完成次数
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
  sub_item_id?: string | null;
  measure_type?: GoalMeasureType;
  target_value?: number | null;
  current_value?: number | null;
  // 量化引擎 Benchmark 字段
  metric_name?: string | null;
  unit?: string | null;
  daily_target?: number | null;
  start_date?: string | null;
  deadline_date?: string | null;
  // 重复型目标字段
  repeat_frequency?: RepeatFrequency | null;
  repeat_count?: number | null;
}

// 更新目标请求
export interface UpdateGoalPayload {
  title?: string;
  description?: string;
  status?: GoalStatus;
  item_id?: string | null;
  phase_id?: string | null;
  sub_item_id?: string | null;
  measure_type?: GoalMeasureType;
  target_value?: number | null;
  current_value?: number | null;
  // 量化引擎 Benchmark 字段
  metric_name?: string | null;
  unit?: string | null;
  daily_target?: number | null;
  start_date?: string | null;
  deadline_date?: string | null;
  // 重复型目标字段
  repeat_frequency?: RepeatFrequency | null;
  repeat_count?: number | null;
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
  sub_item_id?: string;
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

// ============ 用户规则 ============

// 规则类型
export const RULE_TYPES = ['item_mapping', 'sub_item_mapping', 'type_routing', 'fuzzy_resolution'] as const;
export type RuleType = typeof RULE_TYPES[number];

// 规则来源
export const RULE_SOURCES = ['ai_learned', 'user_set', 'system_default'] as const;
export type RuleSource = typeof RULE_SOURCES[number];

// 规则置信度
export const RULE_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type RuleConfidence = typeof RULE_CONFIDENCES[number];

// 用户规则接口
export interface UserRule {
  id: string;
  user_id: string;
  rule_type: RuleType;
  trigger_pattern: string;
  target_id: string | null;
  target_type: 'item' | 'sub_item' | null;
  confidence: RuleConfidence;
  source: RuleSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRulePayload {
  rule_type: RuleType;
  trigger_pattern: string;
  target_id?: string | null;
  target_type?: 'item' | 'sub_item' | null;
  confidence?: RuleConfidence;
  source?: RuleSource;
  is_active?: boolean;
}

export interface UpdateUserRulePayload {
  rule_type?: RuleType;
  trigger_pattern?: string;
  target_id?: string | null;
  target_type?: 'item' | 'sub_item' | null;
  confidence?: RuleConfidence;
  source?: RuleSource;
  is_active?: boolean;
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

// 重复型目标引擎输出
export interface RepeatGoalEngineResult {
  goal_id: string;
  goal_title: string;
  repeat_frequency: RepeatFrequency;
  repeat_count: number;            // 每周期期望次数
  // 当前周期
  current_period_start: string;
  current_period_end: string;
  current_period_actual: number;   // 当前周期内完成次数
  current_period_progress: number; // current_period_actual / repeat_count
  // 最近7天/30天
  count_7d: number;
  count_30d: number;
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
