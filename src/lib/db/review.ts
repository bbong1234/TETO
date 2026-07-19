import { createClient } from '@/lib/supabase/server';
import type { ReviewSummary, ReviewPeriod } from '@/types/teto';
import { calcNetDurationMinutes } from '@/lib/activity/session-utils';
import { listActivityEvents } from '@/lib/db/activity-events';

function periodRange(period: ReviewPeriod, anchor?: string): { date_from: string; date_to: string; label: string } {
  const now = anchor ? new Date(anchor) : new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${y}-${pad(m + 1)}-${pad(d)}`;

  if (period === 'day') {
    return { date_from: today, date_to: today, label: '今日复盘' };
  }
  if (period === 'week') {
    const dayOfWeek = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(d - dayOfWeek + 1);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      date_from: `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
      date_to: `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`,
      label: '本周复盘',
    };
  }
  const monthStart = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    date_from: monthStart,
    date_to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
    label: '本月复盘',
  };
}

export async function computeReviewSummary(
  userId: string,
  period: ReviewPeriod,
  anchor?: string
): Promise<ReviewSummary> {
  const supabase = await createClient();
  const { date_from, date_to, label } = periodRange(period, anchor);

  const { data: days } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', date_from)
    .lte('date', date_to);

  const dayIds = (days ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length === 0) {
    return {
      period,
      date_from,
      date_to,
      label,
      headline: '本期暂无记录',
      sessions_count: 0,
      total_minutes: 0,
      milestones: [],
      ideas_count: 0,
      top_items: [],
      unassigned_count: 0,
    };
  }

  const { data: records } = await supabase
    .from('records')
    .select('id, item_id, content, type, duration_minutes, occurred_at, occurred_at_end, lifecycle_status, review_status')
    .eq('user_id', userId)
    .in('record_day_id', dayIds);

  const rows = records ?? [];
  const occurrenceRows = rows.filter((r: any) => r.type === '发生' && r.lifecycle_status === 'completed');
  const ideaRows = rows.filter((r: any) => r.type === '想法');
  const unassigned = rows.filter((r: any) => !r.item_id && r.review_status === 'unchecked').length;

  let totalMinutes = 0;
  const itemMap = new Map<string, number>();
  for (const r of occurrenceRows) {
    const mins = r.duration_minutes ?? calcNetDurationMinutes(r as import('@/types/teto').Record);
    totalMinutes += mins;
    if (r.item_id) {
      itemMap.set(r.item_id, (itemMap.get(r.item_id) ?? 0) + mins);
    }
  }

  const itemIds = [...itemMap.keys()];
  const itemTitles = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('items')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', itemIds);
    for (const item of items ?? []) {
      itemTitles.set(item.id, item.title);
    }
  }

  const top_items = [...itemMap.entries()]
    .map(([item_id, minutes]) => ({
      item_id,
      item_title: itemTitles.get(item_id) ?? item_id,
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const milestones: string[] = [];
  for (const r of occurrenceRows.slice(0, 20)) {
    try {
      const events = await listActivityEvents(userId, r.id);
      for (const ev of events) {
        if (ev.event_type === 'milestone' && ev.content.trim()) {
          milestones.push(ev.content.trim());
        }
      }
    } catch {
      /* ignore */
    }
  }

  const headline =
    occurrenceRows.length === 0
      ? '本期暂无完成的活动'
      : `共 ${occurrenceRows.length} 次活动，累计 ${Math.round(totalMinutes)} 分钟`;

  return {
    period,
    date_from,
    date_to,
    label,
    headline,
    sessions_count: occurrenceRows.length,
    total_minutes: Math.round(totalMinutes),
    milestones: milestones.slice(0, 10),
    ideas_count: ideaRows.length,
    top_items,
    unassigned_count: unassigned,
  };
}

export async function computeAllReviewSummaries(userId: string): Promise<ReviewSummary[]> {
  return Promise.all([
    computeReviewSummary(userId, 'day'),
    computeReviewSummary(userId, 'week'),
    computeReviewSummary(userId, 'month'),
  ]);
}
