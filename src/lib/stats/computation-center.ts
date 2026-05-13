/**
 * 计算中心 — 统一统计查询入口
 *
 * TETO 1.6 核心架构组件。所有模块不直接查 DB，通过此中心请求数据。
 * 内部使用 buildStatsQuery + CORE_METRICS 确保统一口径。
 *
 * 职责：
 * - queryRecords: 按指标口径查询 records 表
 * - queryItemRecords: 查询某事项下的记录
 * - queryAllRecordsForReview: 数据质量审查（含推断数据）
 * - countRecordsInDayRange: 计数（轻量，仅取 count）
 */

import type { createClient } from '@/lib/supabase/server';
import { buildStatsQuery } from './record-filters';
import { CORE_METRICS } from './metric-definitions';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** 查询指定指标在日期范围内的记录，返回可继续链式调用的查询构建器 */
export function queryRecords(
  supabase: SupabaseClient,
  userId: string,
  metricId: string,
  options?: {
    selectFields?: string;
    itemId?: string;
    subItemId?: string;
  }
) {
  const metric = CORE_METRICS[metricId];
  if (!metric) throw new Error(`[computation-center] 未知指标: ${metricId}`);

  return buildStatsQuery(supabase, userId, metric, {
    selectFields: options?.selectFields,
    itemId: options?.itemId,
    subItemId: options?.subItemId,
  });
}

/**
 * 数据质量审查专用：查询日期范围内全量记录（含推断数据）
 * 直接返回数据，不做进一步链式调用。
 */
export async function queryAllRecordsForReview(
  supabase: SupabaseClient,
  userId: string,
  dayIds: string[],
  selectFields: string = 'id, item_id, data_nature, occurred_at'
): Promise<any[]> {
  if (dayIds.length === 0) return [];

  const { data } = await buildStatsQuery(supabase, userId, CORE_METRICS.data_quality_review, {
    selectFields,
  }).in('record_day_id', dayIds);

  return data ?? [];
}

/**
 * 轻量计数：统计指定事项在某日期范围内符合条件的记录数
 * 使用 buildStatsQuery 统一口径后取 data.length。
 */
export async function countRecordsInDayRange(
  supabase: SupabaseClient,
  userId: string,
  metricId: string,
  itemId: string,
  dayIds: string[],
  subItemId?: string
): Promise<number> {
  if (dayIds.length === 0) return 0;

  let q = buildStatsQuery(supabase, userId, CORE_METRICS[metricId], {
    selectFields: 'id',
    itemId,
    subItemId,
  }).in('record_day_id', dayIds);

  const { data } = await q;
  return data?.length ?? 0;
}

/**
 * 批量获取 duration_minutes 记录（支持分页）
 * 返回查询构建器，调用方继续链式 .range() 等
 */
export function queryDurationBatched(
  supabase: SupabaseClient,
  userId: string,
  metricId: string,
  itemId: string,
  dayIds: string[],
  subItemId?: string
) {
  return buildStatsQuery(supabase, userId, CORE_METRICS[metricId], {
    selectFields: 'duration_minutes, record_day_id',
    itemId,
    subItemId,
  })
    .in('record_day_id', dayIds)
    .not('duration_minutes', 'is', null);
}
