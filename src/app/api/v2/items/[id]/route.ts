import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemById, updateItem, deleteItem } from '@/lib/db/items';
import { getPhasesByItemId } from '@/lib/db/phases';
import { getGoalsByItemId } from '@/lib/db/goals';
import { getSubItemsByItemId } from '@/lib/db/sub-items';
import { listRecords } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import type { UpdateItemPayload, ItemAggregation, PhaseAggregation, Goal, RecordsQuery } from '@/types/teto';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const item = await getItemById(userId, id);
    if (!item) {
      return NextResponse.json({ error: '事项不存在或不属于当前用户' }, { status: 404 });
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

    // 获取关联的记录列表（最近 50 条，按时间倒序）
    const recordsQuery: RecordsQuery = { item_id: id, limit: 50 };
    const records = await listRecords(userId, recordsQuery);

    // 获取近30天每日统计数据（供基础数据看板使用）
    const recentDailyStats = await computeRecentDailyStats(userId, id);

    return NextResponse.json({ data: { ...item, phases: phasesWithAgg, goals, sub_items, aggregation, records, recent_daily_stats: recentDailyStats } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateItemPayload = await request.json();

    const item = await updateItem(userId, id, body);
    return NextResponse.json({ data: item });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    // deleteItem 已改为软删除（内部处理记录置空），无需在此重复操作
    await deleteItem(userId, id);
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 计算事项级聚合数据
 */
async function computeItemAggregation(userId: string, itemId: string): Promise<ItemAggregation> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('records')
    .select('cost, duration_minutes, metric_value, metric_unit, metric_name')
    .eq('user_id', userId)
    .eq('item_id', itemId);

  if (error || !data || data.length === 0) {
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
 * 计算近30天每日统计数据（供基础数据看板）
 * 返回每天的记录数、时长、metric 聚合
 */
async function computeRecentDailyStats(
  userId: string,
  itemId: string
): Promise<Array<{
  date: string;
  record_count: number;
  total_duration_minutes: number;
  total_cost: number;
  metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
}>> {
  const supabase = await createClient();

  // 计算近30天的日期范围
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // 获取日期范围内的 record_days
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id, date')
    .eq('user_id', userId)
    .gte('date', fmtDate(thirtyDaysAgo))
    .lte('date', fmtDate(now));

  if (!dayData || dayData.length === 0) return [];

  const dayMap = new Map(dayData.map((d: { id: string; date: string }) => [d.id, d.date]));
  const dayIds = [...dayMap.keys()];

  // 获取该事项下这些天的记录
  const { data, error } = await supabase
    .from('records')
    .select('record_day_id, cost, duration_minutes, metric_value, metric_unit, metric_name')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .in('record_day_id', dayIds);

  if (error || !data || data.length === 0) return [];

  // 按日期聚合
  const dailyMap = new Map<string, {
    record_count: number;
    total_duration_minutes: number;
    total_cost: number;
    metrics: Map<string, { total_value: number; metric_unit: string }>;
  }>();

  for (const row of data) {
    const date = dayMap.get(row.record_day_id);
    if (!date) continue;

    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        record_count: 0,
        total_duration_minutes: 0,
        total_cost: 0,
        metrics: new Map(),
      });
    }

    const day = dailyMap.get(date)!;
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
    }
  }

  return Array.from(dailyMap.entries())
    .map(([date, day]) => ({
      date,
      record_count: day.record_count,
      total_duration_minutes: day.total_duration_minutes,
      total_cost: day.total_cost,
      metrics: Array.from(day.metrics.entries()).map(([name, { total_value, metric_unit }]) => ({
        metric_name: name,
        total_value,
        metric_unit,
      })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

  // 获取该事项下，时间范围在阶段内的记录
  // 通过 record_days 的 date 过滤
  const { data: dayData } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!dayData || dayData.length === 0) {
    return { total_cost: 0, total_duration_minutes: 0, metric_summaries: [], record_count: 0 };
  }

  const dayIds = dayData.map((d: { id: string }) => d.id);

  const { data, error } = await supabase
    .from('records')
    .select('cost, duration_minutes, metric_value, metric_unit, metric_name')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .in('record_day_id', dayIds);

  if (error || !data || data.length === 0) {
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
