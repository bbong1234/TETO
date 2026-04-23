import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemById, updateItem, deleteItem } from '@/lib/db/items';
import { getPhasesByItemId } from '@/lib/db/phases';
import { getGoalById, getGoalsByItemId } from '@/lib/db/goals';
import { createClient } from '@/lib/supabase/server';
import type { UpdateItemPayload, ItemAggregation, PhaseAggregation, Goal } from '@/types/teto';

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

    // 获取该事项下的所有目标（1.4 新模型：goals.item_id -> items.id）
    const goals = await getGoalsByItemId(userId, id);

    // 为了向后兼容，也获取旧模型的单个 goal（items.goal_id，@deprecated）
    let goal = null;
    if (item.goal_id) {
      goal = await getGoalById(userId, item.goal_id);
    }

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

    return NextResponse.json({ data: { ...item, phases: phasesWithAgg, goal, goals, aggregation } });
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
