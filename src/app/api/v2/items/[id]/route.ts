import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemMeta } from '@/lib/db/items';
import { updateItemSafely, archiveItemSafely } from '@/lib/domain/item-service';
import { getPhasesByItemId } from '@/lib/db/phases';
import { getGoalsByItemId } from '@/lib/db/goals';
import { getSubItemsByItemId } from '@/lib/db/sub-items';
import { listRecords } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import { buildStatsQuery } from '@/lib/stats/record-filters';
import { CORE_METRICS } from '@/lib/stats/metric-definitions';
import type { UpdateItemPayload, ItemAggregation, Goal, RecordsQuery } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/** 详情页首屏记录条数（feed 默认近 14 天） */
const DETAIL_RECORDS_LIMIT = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const item = await getItemMeta(userId, id);
    if (!item) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '事项不存在或不属于当前用户', ctx.traceId, 404);
    }

    const [phases, goals, sub_items, records] = await Promise.all([
      getPhasesByItemId(userId, id),
      getGoalsByItemId(userId, id),
      getSubItemsByItemId(userId, id),
      listRecords(userId, {
        item_id: id,
        limit: DETAIL_RECORDS_LIMIT,
        order: 'desc',
      } satisfies RecordsQuery),
    ]);

    const statsBundle = await fetchItemStatsBundle(
      userId,
      id,
      sub_items.length > 0,
      goals
    );

    const { aggregation, recent_daily_stats } = statsBundle;

    // 阶段仅返回元数据 + 目标；聚合统计延后按需加载
    const phasesWithGoals = phases.map((phase) => ({
      ...phase,
      aggregation: null,
      goals: goals.filter((g: Goal) => g.phase_id === phase.id),
    }));

    return apiSuccess(
      {
        ...item,
        phases: phasesWithGoals,
        goals,
        sub_items,
        aggregation,
        records,
        recent_daily_stats,
      },
      ctx.traceId
    );
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

async function fetchAllRows(queryBuilder: {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}): Promise<any[]> {
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

type StatsRow = {
  record_day_id: string;
  cost: number | null;
  duration_minutes: number | null;
  metric_value: number | null;
  metric_unit: string | null;
  metric_name: string | null;
  sub_item_id?: string | null;
};

async function fetchItemStatsBundle(
  userId: string,
  itemId: string,
  includeSubItemBreakdown: boolean,
  goals: Goal[]
): Promise<{
  aggregation: ItemAggregation;
  recent_daily_stats: Array<{
    date: string;
    sub_item_id: string | null;
    record_count: number;
    total_duration_minutes: number;
    total_cost: number;
    metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
  }>;
}> {
  const emptyAgg: ItemAggregation = {
    total_cost: 0,
    total_duration_minutes: 0,
    metric_summaries: [],
    record_count: 0,
  };

  const supabase = await createClient();
  const selectFields = includeSubItemBreakdown
    ? 'record_day_id, cost, duration_minutes, metric_value, metric_unit, metric_name, sub_item_id'
    : 'record_day_id, cost, duration_minutes, metric_value, metric_unit, metric_name';

  const q = buildStatsQuery(supabase, userId, CORE_METRICS.item_daily_breakdown, {
    itemId,
    selectFields,
  });

  let rows: StatsRow[];
  try {
    rows = await fetchAllRows(q);
  } catch {
    return { aggregation: emptyAgg, recent_daily_stats: [] };
  }

  if (rows.length === 0) {
    return { aggregation: emptyAgg, recent_daily_stats: [] };
  }

  const aggregation = aggregationFromRows(rows);
  const recent_daily_stats = await dailyStatsFromRows(
    supabase,
    rows,
    includeSubItemBreakdown,
    goals
  );

  return { aggregation, recent_daily_stats };
}

function aggregationFromRows(rows: StatsRow[]): ItemAggregation {
  let totalCost = 0;
  let totalDuration = 0;
  const metricMap = new Map<string, { totalValue: number; unit: string }>();

  for (const row of rows) {
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
    record_count: rows.length,
  };
}

async function dailyStatsFromRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordData: StatsRow[],
  includeSubItemBreakdown: boolean,
  goals: Goal[]
) {
  const dayIds = [...new Set(recordData.map((r) => r.record_day_id))];
  const CHUNK_SIZE = 300;
  const dayData: Array<{ id: string; date: string }> = [];

  for (let i = 0; i < dayIds.length; i += CHUNK_SIZE) {
    const chunk = dayIds.slice(i, i + CHUNK_SIZE);
    const { data } = await supabase.from('record_days').select('id, date').in('id', chunk);
    if (data) dayData.push(...(data as Array<{ id: string; date: string }>));
  }

  const dayMap = new Map(dayData.map((d) => [d.id, d.date]));
  type DayKey = string;
  const dailyMap = new Map<
    DayKey,
    {
      date: string;
      sub_item_id: string | null;
      record_count: number;
      total_duration_minutes: number;
      total_cost: number;
      metrics: Map<string, { total_value: number; metric_unit: string }>;
    }
  >();

  const goalMetricMap = new Map<string, string>();
  for (const g of goals) {
    if (g.metric_name && !goalMetricMap.has(g.metric_name)) {
      goalMetricMap.set(g.metric_name, g.unit || '次');
    }
  }

  for (const row of recordData) {
    const date = dayMap.get(row.record_day_id);
    if (!date) continue;

    const subItemId = includeSubItemBreakdown ? row.sub_item_id || null : null;
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
        day.metrics.set(row.metric_name, {
          total_value: Number(row.metric_value),
          metric_unit: row.metric_unit || '',
        });
      }
    } else if (!row.metric_name && goalMetricMap.size === 1) {
      const valueToAdd =
        row.metric_value != null && row.metric_value > 0 ? Number(row.metric_value) : 1;
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
    .sort(
      (a, b) => a.date.localeCompare(b.date) || (a.sub_item_id || '').localeCompare(b.sub_item_id || '')
    );
}
