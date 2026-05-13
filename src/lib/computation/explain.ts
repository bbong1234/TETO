/**
 * computation/explain.ts — TETO 1.6 计算解释器
 *
 * 为每次计算提供可追溯的透明度：
 * - none：仅返回数值
 * - summary：返回数值 + 公式摘要 + 排除记录数量
 * - full：额外返回每条被排除记录的原因和 computation_id 反查
 */

import { CORE_METRICS, type MetricDefinition } from '@/lib/stats/metric-definitions';
import { COMPUTATION, COMPUTATION_VERSION, COMPUTATION_IDS } from '@/lib/computation';
import { isEligible, type EligibilityResult } from '@/lib/stats/stats-eligibility';
import type { Record as TetoRecord } from '@/types/teto';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

/** 解释模式 */
export type ExplainMode = 'none' | 'summary' | 'full';

/** 被排除的单条记录说明 */
export interface ExcludedRecord {
  recordId: string;
  reason: string;
  field?: string;
}

/** 计算解释结果 */
export interface ExplainResult {
  metricId: string;
  metricLabel: string;
  value: number | null;
  unit: string;
  mode: ExplainMode;
  computationVersion: string;
  computationId: string;
  formula: string;
  caliber: string;
  // summary 模式额外输出
  totalRecords?: number;
  excludedCount?: number;
  // full 模式额外输出
  excludedRecords?: ExcludedRecord[];
}

// ═══════════════════════════════════════════════════════════
// metricId → computationId 映射
// ═══════════════════════════════════════════════════════════

const METRIC_TO_COMPUTATION: Record<string, string> = {
  activity_heatmap: COMPUTATION_IDS.metrics,
  time_distribution: COMPUTATION_IDS.comparison,
  period_comparison: COMPUTATION_IDS.comparison,
  item_total_effort: COMPUTATION_IDS.metrics,
  item_daily_breakdown: COMPUTATION_IDS.time_windows,
  goal_progress: COMPUTATION_IDS.metrics,
  activity_score: COMPUTATION_IDS.metrics,
  plan_achievement: COMPUTATION_IDS.metrics,
  effectiveness: COMPUTATION_IDS.metrics,
};

// ═══════════════════════════════════════════════════════════
// 核心函数
// ═══════════════════════════════════════════════════════════

/**
 * 对一次指标计算生成解释
 *
 * @param metricId  — 指标 ID（如 'goal_progress'）
 * @param value     — 计算出的数值
 * @param records   — 参与计算的原始记录（用于 full 模式排查）
 * @param mode      — 解释深度
 */
export function explainComputation(
  metricId: string,
  value: number | null,
  records?: Pick<TetoRecord, 'id' | 'type' | 'lifecycle_status' | 'data_nature' | 'is_period_rule' | 'review_status'>[],
  mode: ExplainMode = 'summary'
): ExplainResult {
  const metric: MetricDefinition | undefined = CORE_METRICS[metricId];
  if (!metric) {
    return {
      metricId,
      metricLabel: metricId,
      value,
      unit: '',
      mode,
      computationVersion: COMPUTATION_VERSION,
      computationId: METRIC_TO_COMPUTATION[metricId] ?? COMPUTATION_IDS.metrics,
      formula: '',
      caliber: 'unknown',
    };
  }

  const base: ExplainResult = {
    metricId: metric.id,
    metricLabel: metric.label,
    value,
    unit: metric.unit,
    mode,
    computationVersion: COMPUTATION_VERSION,
    computationId: METRIC_TO_COMPUTATION[metric.id] ?? COMPUTATION_IDS.metrics,
    formula: metric.description,
    caliber: metric.caliber,
  };

  // none 模式：到此为止
  if (mode === 'none') {
    return base;
  }

  // summary / full：需要 records 来计算排除数量
  if (!records || records.length === 0) {
    return { ...base, totalRecords: 0, excludedCount: 0 };
  }

  const caliber = metric.caliber;
  const excluded: ExcludedRecord[] = [];

  for (const record of records) {
    const eligibility: EligibilityResult = isEligible(
      {
        type: record.type,
        lifecycle_status: record.lifecycle_status,
        data_nature: record.data_nature,
        is_period_rule: record.is_period_rule,
        review_status: record.review_status,
      },
      caliber
    );

    if (!eligibility.eligible) {
      excluded.push({
        recordId: record.id,
        reason: eligibility.exclusionReason ?? 'unknown',
      });
    }
  }

  base.totalRecords = records.length;
  base.excludedCount = excluded.length;

  // full 模式：返回每条排除原因的详情
  if (mode === 'full') {
    base.excludedRecords = excluded;
  }

  return base;
}

/**
 * 获取指标的人类可读摘要（不含数据）
 */
export function getMetricSummary(metricId: string): {
  label: string;
  description: string;
  caliber: string;
  unit: string;
  computationId: string;
} | null {
  const metric = CORE_METRICS[metricId];
  if (!metric) return null;
  return {
    label: metric.label,
    description: metric.description,
    caliber: metric.caliber,
    unit: metric.unit,
    computationId: METRIC_TO_COMPUTATION[metricId] ?? COMPUTATION_IDS.metrics,
  };
}
