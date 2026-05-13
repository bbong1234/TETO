import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemById } from '@/lib/db/items';
import { updateItemSafely, archiveItemSafely } from '@/lib/domain/item-service';
import { getPhasesByItemId } from '@/lib/db/phases';
import { getGoalsByItemId } from '@/lib/db/goals';
import { getSubItemsByItemId } from '@/lib/db/sub-items';
import { listRecords } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import { buildStatsQuery } from '@/lib/stats/record-filters';
import { CORE_METRICS } from '@/lib/stats/metric-definitions';
import type { UpdateItemPayload, ItemAggregation, PhaseAggregation, Goal, RecordsQuery } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const item = await getItemById(userId, id);
    if (!item) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '事项不存在或不属于当前用户', ctx.traceId, 404);
    }

    // 获取关联的阶段列表
    const phases = await getPhasesByItemId(userId, id);

    // 获取该事项下的所有目标（1.5 新模型：goals.item_id -> items.id）
    const goals = await getGoalsByItemId(userId, id);

    // 获取该事项下的所有子项
    const sub_items = await getSubItemsByItemId(userId, id);

    // 计算事项级聚合数据
    const aggregation = await computeItemAggregation(userId, id);

    // 计算每个阶段的聚合数据 + 附带阶段目标
    const phasesWithAgg = await Promise.all(
      phases.map(async (phase) => {
        let aggregation = null;
        if (phase.start_date && phase.end_date) {
          aggregation = await computePhaseAggregation(userId, id, phase.start_date, phase.end_date);
        }
        // 该阶段下的目标（goals.phase_id = phase.id）
        const phaseGoals = goals.filter((g: Goal) => g.phase_id === phase.id);
        return { ...phase, aggregation, goals: phaseGoals };
      })
    );

    // 获取关联的记录列表（无上限，支持大量历史数据导入后的完整展示）
    const recordsQuery: RecordsQuery = { item_id: id, limit: 0 };
    const records = await listRecords(userId, recordsQuery);

    // 获取近30天每日统计数据（供基础数据看板使用）
    // 当事项有子项时，按子项维度聚合
    const recentDailyStats = await computeRecentDailyStats(userId, id, sub_items.length > 0, goals);

    return apiSuccess({ ...item, phases: phasesWithAgg, goals, sub_items, aggregation, records, recent_daily_stats: recentDailyStats }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateItemPayload = await request.json();

    const supabase = await createClient();
    const result = await updateItemSafely({ userId, id, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const result = await archiveItemSafely({ userId, id, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * 分页获取 Supabase 查询的所有行，突破默认 1000 行限制
 */
async function fetchAllRows(queryBuilder: any): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

/**
 * 计算事项级聚合数据
 */
async function computeItemAggregation(userId: string, itemId: string): Promise<ItemAggregation> {
  const supabase = await createClient();

  // P4: 使用 item_total_effort 指标定义的统一口径查询
  const q = buildStatsQuery(supabase, userId, CORE_METRICS.item_total_effort, {
    itemId,
    selectFields: 'cost, duration_minutes, metric_value, metric_unit, metric_name',
  });

  let data: any[];
  try {
    data = await fetchAllRows(q);
  } catch {
    return { total_cost: 0, total_duration_minutes: 0, metric_summaries: [], record_count: 0 };
  }

  if (data.length === 0) {
    return { total_cost: 0, total_duration_minutes: 0, metric_summaries: [], record_count: 0 };
  }

  let totalCost = 0;
  let totalDuration = 0;
  const metricMap = new Map<string, { totalValue: number; unit: string }>();

  for (const row of data) {
    if (row.cost != null) totalCost += Number(row.cost);
    if (row.duration_minutes != null) totalDuration += Number(row.duration_minutes);
    if (row.metric_value != null && row.metric_name) {
      const name = row.metric_name;
      const existing = metricMap.get(name);
      if (existing) {
        existing.totalValue += Number(row.metric_value);
      } else {
        metricMap.set(name, { totalValue: Number(row.metric_value), unit: row.metric_unit || '' });
      }
    }
  }

  return {
    total_cost: totalCost,
    total_duration_minutes: totalDuration,
    metric_summaries: Array.from(metricMap.entries()).map(([name, { totalValue, unit }]) => ({
      metric_name: name,
      total_value: totalValue,
      metric_unit: unit,
    })),
    record_count: data.length,
  };
}

/**
 * 计算每日统计数据（供基础数据看板）
 * 查询该事项下所有记录日的统计（不限制天数，支持历史数据）
 * 返回每天的记录数、时长、metric 聚合
 */
async function computeRecentDailyStats(
  userId: string,
  itemId: string,
  includeSubItemBreakdown: boolean = false,
  goals: Goal[] = []
): Promise<Array<{
  date: string;
  sub_item_id: string | null;
  record_count: number;
  total_duration_minutes: number;
  total_cost: number;
  metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
}>> {
  const supabase = await createClient();

  // P4: 使用 item_daily_breakdown 指标定义的统一口径查询
  const selectFields = includeSubItemBreakdown
    ? 'record_day_id, cost, duration_minutes, metric_value, metric_unit, metric_name, sub_item_id'
    : 'record_day_id, cost, duration_minutes, metric_value, metric_unit, metric_name';

  const q = buildStatsQuery(supabase, userId, CORE_METRICS.item_daily_breakdown, {
    itemId,
    selectFields,
  });

  let recordData: any[];
  try {
    recordData = await fetchAllRows(q);
  } catch {
    return [];
  }

  if (recordData.length === 0) return [];

  // 收集所有不重复的 record_day_id
  const dayIds = [...new Set(recordData.map((r: { record_day_id: string }) => r.record_day_id))];

  // 分批查询 record_day 的日期（避免 .in() 大数组 URL 超长）
  const CHUNK_SIZE = 300;
  let dayData: Array<{ id: string; date: string }> = [];
  for (let i = 0; i < dayIds.length; i += CHUNK_SIZE) {
    const chunk = dayIds.slice(i, i + CHUNK_SIZE);
    const { data } = await supabase
      .from('record_days')
      .select('id, date')
      .in('id', chunk);
    if (data) dayData.push(...(data as Array<{ id: string; date: string }>));
  }

  const dayMap = new Map(dayData.map((d) => [d.id, d.date]));

  // 按 (日期, sub_item_id) 聚合（如果启用子项分组）或按日期聚合
  type DayKey = string; // date 或 "date|sub_item_id"
  const dailyMap = new Map<DayKey, {
    date: string;
    sub_item_id: string | null;
    record_count: number;
    total_duration_minutes: number;
    total_cost: number;
    metrics: Map<string, { total_value: number; metric_unit: string }>;
  }>();

  // 构建目标 metric_name → unit 映射（用于记录缺少 metric 时的回退）
  const goalMetricMap = new Map<string, string>();
  for (const g of goals) {
    if (g.metric_name && !goalMetricMap.has(g.metric_name)) {
      goalMetricMap.set(g.metric_name, g.unit || '次');
    }
  }

  for (const row of recordData) {
    const date = dayMap.get(row.record_day_id);
    if (!date) continue;

    const subItemId = includeSubItemBreakdown ? (row.sub_item_id || null) : null;
    const key: DayKey = includeSubItemBreakdown ? `${date}|${subItemId || ''}` : date;

    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date,
        sub_item_id: subItemId,
        record_count: 0,
        total_duration_minutes: 0,
        total_cost: 0,
        metrics: new Map(),
      });
    }

    const day = dailyMap.get(key)!;
    day.record_count++;
    if (row.duration_minutes != null) day.total_duration_minutes += Number(row.duration_minutes);
    if (row.cost != null) day.total_cost += Number(row.cost);
    if (row.metric_value != null && row.metric_name) {
      const existing = day.metrics.get(row.metric_name);
      if (existing) {
        existing.total_value += Number(row.metric_value);
      } else {
        day.metrics.set(row.metric_name, { total_value: Number(row.metric_value), metric_unit: row.metric_unit || '' });
      }
    } else if (!row.metric_name && goalMetricMap.size === 1) {
      // 记录缺少 metric_name 时，仅当目标有唯一 metric 时才继承（避免多目标重复计算）
      // 使用记录实际的 metric_value（若有），否则计为 1 次
      const valueToAdd = (row.metric_value != null && row.metric_value > 0) ? Number(row.metric_value) : 1;
      const [metricName, metricUnit] = goalMetricMap.entries().next().value!;
      const existing = day.metrics.get(metricName);
      if (existing) {
        existing.total_value += valueToAdd;
      } else {
        day.metrics.set(metricName, { total_value: valueToAdd, metric_unit: metricUnit });
      }
    }
  }

  return Array.from(dailyMap.entries())
    .map(([, day]) => ({
      date: day.date,
      sub_item_id: day.sub_item_id,
      record_count: day.record_count,
      total_duration_minutes: day.total_duration_minutes,
      total_cost: day.total_cost,
      metrics: Array.from(day.metrics.entries()).map(([name, { total_value, metric_unit }]) => ({
        metric_name: name,
        total_value,
        metric_unit,
      })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.sub_item_id || '').localeCompare(b.sub_item_id || ''));
}

/**
 * 计算阶段时间范围内的聚合数据
 */
async function computePhaseAggregation(
  userId: string,
  itemId: string,
  startDate: string,
  endDate: string
): Promise<PhaseAggregation> {
  const supabase = await createClient();

  // 使用 inner join 替代两步查询（record_days → .in()），同时用 fetchAllRows 突破 1000 行限制
  const q = buildStatsQuery(supabase, userId, CORE_METRICS.item_total_effort, {
    selectFields: 'cost, duration_minutes, metric_value, metric_unit, metric_name, record_days!inner(date)',
    itemId,
  })
    .gte('record_days.date', startDate)
    .lte('record_days.date', endDate);

  let data: any[];
  try {
    data = await fetchAllRows(q);
  } catch {
    return { total_cost: 0, total_duration_minutes: 0, metric_summaries: [], record_count: 0 };
  }

  if (data.length === 0) {
    return { total_cost: 0, total_duration_minutes: 0, metric_summaries: [], record_count: 0 };
  }

  let totalCost = 0;
  let totalDuration = 0;
  const metricMap = new Map<string, { totalValue: number; unit: string }>();

  for (const row of data) {
    if (row.cost != null) totalCost += Number(row.cost);
    if (row.duration_minutes != null) totalDuration += Number(row.duration_minutes);
    if (row.metric_value != null && row.metric_name) {
      const name = row.metric_name;
      const existing = metricMap.get(name);
      if (existing) {
        existing.totalValue += Number(row.metric_value);
      } else {
        metricMap.set(name, { totalValue: Number(row.metric_value), unit: row.metric_unit || '' });
      }
    }
  }

  return {
    total_cost: totalCost,
    total_duration_minutes: totalDuration,
    metric_summaries: Array.from(metricMap.entries()).map(([name, { totalValue, unit }]) => ({
      metric_name: name,
      total_value: totalValue,
      metric_unit: unit,
    })),
    record_count: data.length,
  };
}
