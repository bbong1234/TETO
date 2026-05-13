/**
 * 记录筛选器 — 基于 MetricDefinition 构建统一统计查询
 *
 * 核心原则：
 * 1. SQL NULL 兼容：NULL ≠ 'cancelled' 结果为 NULL（非 TRUE），
 *    旧记录无 lifecycle_status/data_nature/is_period_rule/review_status 字段，
 *    需使用 .or() 包含 null 的情况
 * 2. 所有查询加 .eq('user_id', userId)
 * 3. 不修改数据，只构建查询
 */

import type { MetricDefinition } from './metric-definitions'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

/**
 * 根据 MetricDefinition 构建统计查询
 *
 * @returns Supabase 查询构建器（已应用筛选规则和 select，调用方可继续链式调用 .in()/.order() 等）
 */
export function buildStatsQuery(
  supabase: SupabaseClient,
  userId: string,
  metric: MetricDefinition,
  options?: {
    itemId?: string
    subItemId?: string
    phaseId?: string
    selectFields?: string
  }
) {
  const fields = options?.selectFields ?? '*'
  let q = supabase
    .from('records')
    .select(fields)
    .eq('user_id', userId)

  // type 过滤
  if (metric.includeTypes.length > 0) {
    q = q.in('type', metric.includeTypes)
  }

  // lifecycle_status 过滤（null 兼容：null 按 active 处理，不被排除）
  if (metric.excludeLifecycleStatuses.length > 0) {
    for (const status of metric.excludeLifecycleStatuses) {
      // .or() 包含 null 的情况：lifecycle_status 为 null 的旧记录视为 active，不应被排除
      q = q.or(`lifecycle_status.is.null,lifecycle_status.neq.${status}`)
    }
  }

  // data_nature 过滤（null 兼容：null 按 fact 处理）
  if (metric.includeDataNature.length > 0) {
    if (metric.includeDataNature.includes('fact')) {
      // data_nature 为 null 的旧记录视为 fact，需要包含
      q = q.or(`data_nature.is.null,data_nature.in.(${metric.includeDataNature.join(',')})`)
    } else {
      q = q.in('data_nature', metric.includeDataNature)
    }
  }

  // is_period_rule 过滤（null 兼容：null 按 false 处理，不被排除）
  if (metric.excludePeriodRules) {
    // is_period_rule 为 null 的旧记录视为 false，不应被排除
    q = q.or('is_period_rule.is.null,is_period_rule.neq.true')
  }

  // review_status 过滤（null 兼容：null 按 confirmed 处理，不被排除）
  if (metric.excludeReviewStatuses.length > 0) {
    for (const rs of metric.excludeReviewStatuses) {
      // review_status 为 null 的旧记录视为 confirmed，不应被排除
      q = q.or(`review_status.is.null,review_status.neq.${rs}`)
    }
  }

  // 实体范围过滤
  if (options?.itemId) {
    q = q.eq('item_id', options.itemId)
  }
  if (options?.subItemId) {
    q = q.eq('sub_item_id', options.subItemId)
  }
  if (options?.phaseId) {
    q = q.eq('phase_id', options.phaseId)
  }

  return q
}
