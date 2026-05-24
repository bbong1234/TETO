import type { Record, TodayActivityStats } from '@/types/teto';
import { buildDayTimelineFromRecords } from './timeline-utils';

function recordDurationMinutes(record: Record, nowIso: string): number {
  if (record.duration_minutes != null) return record.duration_minutes;
  if (!record.occurred_at) return 0;
  const end = record.occurred_at_end ?? nowIso;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(record.occurred_at)) / 60000));
}

/**
 * 从今日记录计算轻量统计
 */
export function computeTodayActivityStats(
  records: Record[],
  date: string,
  currentActivity: Record | null
): TodayActivityStats {
  const nowIso = new Date().toISOString();
  const timed = records.filter(
    (r) => r.type === '发生' && r.occurred_at && (r.occurred_at_end || r.lifecycle_status === 'active')
  );

  let recordedMinutes = 0;
  const categoryMap = new Map<string, number>();
  const itemMap = new Map<string, { title: string; minutes: number }>();

  for (const record of timed) {
    const mins = recordDurationMinutes(record, nowIso);
    recordedMinutes += mins;

    if (record.category) {
      categoryMap.set(record.category, (categoryMap.get(record.category) ?? 0) + mins);
    }

    if (record.item_id && record.item?.title) {
      const existing = itemMap.get(record.item_id);
      if (existing) {
        existing.minutes += mins;
      } else {
        itemMap.set(record.item_id, { title: record.item.title, minutes: mins });
      }
    }
  }

  const timeline = buildDayTimelineFromRecords(records, date);
  const gapMinutes = timeline.records
    .filter((e) => e.is_gap)
    .reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);

  let currentElapsed = 0;
  if (currentActivity?.occurred_at) {
    currentElapsed = recordDurationMinutes(currentActivity, nowIso);
  }

  return {
    date,
    recorded_minutes: recordedMinutes,
    gap_minutes: gapMinutes,
    current_elapsed_minutes: currentElapsed,
    by_category: Array.from(categoryMap.entries())
      .map(([category, minutes]) => ({ category, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    by_item: Array.from(itemMap.entries())
      .map(([item_id, v]) => ({ item_id, item_title: v.title, minutes: v.minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0分钟';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分`;
}
