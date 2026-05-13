/**
 * 统计指标定义 — 统一统计口径
 *
 * 口径区分：
 * - display（宽松展示口径）：可包含 review_status='unchecked'，用于记录列表、日历、普通展示
 * - insight（严格洞察口径）：默认排除 unchecked/inferred/period_rule/cancelled，
 *   用于目标进度、时间投入、有效行动、趋势洞察、事项活跃度、停滞判断
 *
 * 排除规则与 stats-eligibility.ts 保持一致（双入口：SQL 层由 buildStatsQuery 应用，
 * 内存层由 isEligible() 应用）。修改排除规则时必须同步更新两边。
 */

import type { RecordType, LifecycleStatus } from '@/types/teto'
import { DISPLAY_EXCLUSIONS, INSIGHT_EXCLUSIONS } from './stats-eligibility'

export type MetricCaliber = 'display' | 'insight'

export interface MetricDefinition {
  id: string
  label: string
  description: string
  unit: string
  caliber: MetricCaliber
  dateField: 'time_anchor_date' | 'created_at' | 'occurred_at'
  includeTypes: RecordType[]
  excludeLifecycleStatuses: LifecycleStatus[]
  includeDataNature: ('fact' | 'inferred')[]
  excludePeriodRules: boolean
  excludeReviewStatuses: string[]
  computeBy: 'count' | 'sum_duration' | 'sum_metric' | 'composite'
}

/**
 * 9 个核心指标定义
 */
export const CORE_METRICS: Record<string, MetricDefinition> = {
  // ── 洞察页指标 ──

  activity_heatmap: {
    id: 'activity_heatmap',
    label: '活跃热力图',
    description: '每日记录数量分布（宽松口径，包含未确认记录）',
    unit: '条',
    caliber: 'display',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...DISPLAY_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: DISPLAY_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [],
    computeBy: 'count',
  },

  time_distribution: {
    id: 'time_distribution',
    label: '时间分布',
    description: '记录在一天中的时间分布（宽松口径）',
    unit: '条',
    caliber: 'display',
    dateField: 'occurred_at',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...DISPLAY_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: DISPLAY_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [],
    computeBy: 'count',
  },

  period_comparison: {
    id: 'period_comparison',
    label: '周/月对比',
    description: '本周vs上周、本月vs上月的变化（严格口径）',
    unit: '综合',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'composite',
  },

  // ── 事项页指标 ──

  item_total_effort: {
    id: 'item_total_effort',
    label: '事项总投入',
    description: '某事项下所有有效记录的时长/花费/度量汇总（严格口径）',
    unit: '分钟',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'sum_duration',
  },

  item_daily_breakdown: {
    id: 'item_daily_breakdown',
    label: '事项日维度分解',
    description: '某事项下按日+子事项分解的统计（宽松口径）',
    unit: '综合',
    caliber: 'display',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...DISPLAY_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: DISPLAY_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [],
    computeBy: 'composite',
  },

  // ── 目标引擎指标 ──

  goal_progress: {
    id: 'goal_progress',
    label: '目标进度',
    description: '目标完成百分比（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'sum_metric',
  },

  // ── 活跃度评分指标 ──

  activity_score: {
    id: 'activity_score',
    label: '活跃度评分',
    description: '事项活跃度/停滞判断（严格口径）',
    unit: '分',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '计划', '总结'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'composite',
  },

  plan_achievement: {
    id: 'plan_achievement',
    label: '计划达成率',
    description: '按时完成的计划数 / 总计划数（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['计划'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'count',
  },

  effectiveness: {
    id: 'effectiveness',
    label: '有效性',
    description: '有结果的记录数 / 有时长的记录数（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: [...INSIGHT_EXCLUSIONS.lifecycleStatus] as LifecycleStatus[],
    includeDataNature: ['fact'],
    excludePeriodRules: INSIGHT_EXCLUSIONS.isPeriodRule.length > 0,
    excludeReviewStatuses: [...INSIGHT_EXCLUSIONS.reviewStatus],
    computeBy: 'composite',
  },

  // ── 数据质量审查指标 ──

  data_quality_review: {
    id: 'data_quality_review',
    label: '数据质量审查',
    description: '全量记录审查（含推断数据），用于识别未分配/推断/缺时间等问题',
    unit: '条',
    caliber: 'display',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结', '计划'],
    excludeLifecycleStatuses: [],
    includeDataNature: ['fact', 'inferred'],
    excludePeriodRules: false,
    excludeReviewStatuses: [],
    computeBy: 'count',
  },
}
