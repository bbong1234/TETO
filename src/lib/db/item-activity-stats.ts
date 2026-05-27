import { createClient } from '@/lib/supabase/server';
import type { ItemActivityStats } from '@/types/teto';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function recordMinutes(row: {
  duration_minutes: number | null;
  occurred_at: string | null;
  occurred_at_end: string | null;
  lifecycle_status?: string | null;
}): number {
  if (row.duration_minutes != null) return Number(row.duration_minutes);
  if (!row.occurred_at) return 0;
  const end =
    row.occurred_at_end ??
    (row.lifecycle_status === 'active' ? new Date().toISOString() : null);
  if (!end) return 0;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(row.occurred_at)) / 60000));
}

/**
 * 按事项聚合活动时长：今日 / 本周 / 本月 / 累计
 */
export async function computeItemActivityStats(
  userId: string,
  itemId: string
): Promise<ItemActivityStats> {
  const supabase = await createClient();
  const now = new Date();
  const todayStr = fmtLocalDate(now);
  const weekStart = startOfWeekMonday(now);
  const monthStart = startOfMonth(now);

  const { data, error } = await supabase
    .from('records')
    .select('duration_minutes, occurred_at, occurred_at_end, lifecycle_status')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .eq('type', '发生')
    .not('occurred_at', 'is', null);

  if (error) throw new Error(`计算事项活动统计失败: ${error.message}`);

  let todayMinutes = 0;
  let weekMinutes = 0;
  let monthMinutes = 0;
  let totalMinutes = 0;
  let lastActiveAt: string | null = null;

  for (const row of data ?? []) {
    const mins = recordMinutes(row);
    if (mins <= 0) continue;
    totalMinutes += mins;

    const occurredAt = row.occurred_at as string;
    const occurredDate = fmtLocalDate(new Date(occurredAt));
    const occurredTime = Date.parse(occurredAt);

    if (!lastActiveAt || occurredTime > Date.parse(lastActiveAt)) {
      lastActiveAt = occurredAt;
    }

    if (occurredDate === todayStr) todayMinutes += mins;
    if (occurredTime >= weekStart.getTime()) weekMinutes += mins;
    if (occurredTime >= monthStart.getTime()) monthMinutes += mins;
  }

  return {
    today_minutes: todayMinutes,
    week_minutes: weekMinutes,
    month_minutes: monthMinutes,
    total_minutes: totalMinutes,
    last_active_at: lastActiveAt,
  };
}

/**
 * 批量获取事项累计活动时长（列表卡片用）
 */
export async function fetchItemDurationTotals(
  userId: string,
  itemIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (itemIds.length === 0) return map;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('records')
    .select('item_id, duration_minutes, occurred_at, occurred_at_end, lifecycle_status')
    .eq('user_id', userId)
    .eq('type', '发生')
    .in('item_id', itemIds)
    .not('occurred_at', 'is', null);

  if (error) throw new Error(`获取事项时长汇总失败: ${error.message}`);

  for (const row of data ?? []) {
    const itemId = row.item_id as string;
    if (!itemId) continue;
    const mins = recordMinutes(row);
    map.set(itemId, (map.get(itemId) ?? 0) + mins);
  }

  return map;
}

/**
 * 大类聚合统计：自身 + 所有子事项的 activity 记录
 */
export async function computeCategoryActivityStats(
  userId: string,
  categoryItemId: string,
  childItemIds: string[]
): Promise<ItemActivityStats> {
  const allIds = [categoryItemId, ...childItemIds];
  const supabase = await createClient();
  const now = new Date();
  const todayStr = fmtLocalDate(now);
  const weekStart = startOfWeekMonday(now);
  const monthStart = startOfMonth(now);

  const { data, error } = await supabase
    .from('records')
    .select('duration_minutes, occurred_at, occurred_at_end, lifecycle_status')
    .eq('user_id', userId)
    .eq('type', '发生')
    .in('item_id', allIds)
    .not('occurred_at', 'is', null);

  if (error) throw new Error(`计算大类活动统计失败: ${error.message}`);

  let todayMinutes = 0;
  let weekMinutes = 0;
  let monthMinutes = 0;
  let totalMinutes = 0;
  let lastActiveAt: string | null = null;

  for (const row of data ?? []) {
    const mins = recordMinutes(row);
    if (mins <= 0) continue;
    totalMinutes += mins;

    const occurredAt = row.occurred_at as string;
    const occurredDate = fmtLocalDate(new Date(occurredAt));
    const occurredTime = Date.parse(occurredAt);

    if (!lastActiveAt || occurredTime > Date.parse(lastActiveAt)) {
      lastActiveAt = occurredAt;
    }

    if (occurredDate === todayStr) todayMinutes += mins;
    if (occurredTime >= weekStart.getTime()) weekMinutes += mins;
    if (occurredTime >= monthStart.getTime()) monthMinutes += mins;
  }

  return {
    today_minutes: todayMinutes,
    week_minutes: weekMinutes,
    month_minutes: monthMinutes,
    total_minutes: totalMinutes,
    last_active_at: lastActiveAt,
  };
}
