/**
 * 指标解释器 — 人类可读的筛选规则说明
 *
 * 用于 diagnostics 和调试
 */

import { CORE_METRICS } from './metric-definitions'

/**
 * 给定一个指标 ID，返回人类可读的筛选规则说明
 */
export function explainMetric(metricId: string): string {
  const m = CORE_METRICS[metricId]
  if (!m) return `未知指标: ${metricId}`

  const lines: string[] = []
  lines.push(`指标: ${m.label} (${m.id})`)
  lines.push(`说明: ${m.description}`)
  lines.push(`口径: ${m.caliber === 'display' ? '宽松展示' : '严格洞察'}`)
  lines.push(`日期字段: ${m.dateField}`)
  lines.push(`包含类型: ${m.includeTypes.join(', ')}`)
  if (m.excludeLifecycleStatuses.length) {
    lines.push(`排除状态: ${m.excludeLifecycleStatuses.join(', ')}`)
  }
  lines.push(`数据性质: ${m.includeDataNature.join(', ')}`)
  if (m.excludePeriodRules) {
    lines.push(`排除规律记录: 是`)
  }
  if (m.excludeReviewStatuses.length) {
    lines.push(`排除审核状态: ${m.excludeReviewStatuses.join(', ')}`)
  }
  lines.push(`计算方式: ${m.computeBy}`)

  return lines.join('\n')
}

/**
 * 返回某个指标的筛选规则摘要（用于 API 响应）
 */
export function getMetricFilterSummary(metricId: string): Record<string, any> {
  const m = CORE_METRICS[metricId]
  if (!m) return { error: `未知指标: ${metricId}` }

  return {
    id: m.id,
    label: m.label,
    caliber: m.caliber,
    includeTypes: m.includeTypes,
    excludeLifecycleStatuses: m.excludeLifecycleStatuses,
    includeDataNature: m.includeDataNature,
    excludePeriodRules: m.excludePeriodRules,
    excludeReviewStatuses: m.excludeReviewStatuses,
    dateField: m.dateField,
  }
}
