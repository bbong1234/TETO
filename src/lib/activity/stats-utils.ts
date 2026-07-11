import type { Record, TodayActivityStats, Item } from '@/types/teto';
import { buildDayTimelineFromRecords } from './timeline-utils';
import { buildItemPathLabel, resolveCategoryTitleForItem } from './item-tree';
import { calcNetElapsedSeconds } from './session-utils';

/** 统计：未挂大类的记录/事项 */
export const STATS_UNCATEGORIZED_LABEL = '未归类';
/** 统计：活动间隙（与时间线「空白时间」同源，非事项大类） */
export const STATS_GAP_LABEL = '空白时间';

function recordDurationSeconds(record: Record, nowIso: string): number {
  if (!record.occurred_at) {
    if (record.duration_minutes != null && record.duration_minutes > 0) {
      return record.duration_minutes * 60;
    }
    return 0;
  }
  const netSecs = calcNetElapsedSeconds(record, nowIso);
  if (netSecs > 0) return netSecs;
  if (record.duration_minutes != null && record.duration_minutes > 0) {
    return record.duration_minutes * 60;
  }
  return 0;
}

/**
 * 从今日记录计算轻量统计（时长以秒为基准，避免不足 1 分钟被舍成 0）
 */
export function computeTodayActivityStats(
  records: Record[],
  date: string,
  currentActivity: Record | null,
  items: Item[] = []
): TodayActivityStats {
  const nowIso = new Date().toISOString();
  const timed = records.filter(
    (r) => r.type === '发生' && r.occurred_at && (r.occurred_at_end || r.lifecycle_status === 'active')
  );

  let recordedSeconds = 0;
  const categoryMap = new Map<string, { seconds: number; is_uncategorized?: boolean }>();
  const itemMap = new Map<string, { title: string; seconds: number }>();

  const addCategory = (key: string, seconds: number, is_uncategorized?: boolean) => {
    const prev = categoryMap.get(key);
    if (prev) {
      prev.seconds += seconds;
    } else {
      categoryMap.set(key, { seconds, is_uncategorized });
    }
  };

  for (const record of timed) {
    const secs = recordDurationSeconds(record, nowIso);
    if (secs <= 0) continue;
    recordedSeconds += secs;

    if (record.item_id) {
      const resolvedCat = resolveCategoryTitleForItem(items, record.item_id);
      const catTitle = resolvedCat ?? record.category ?? STATS_UNCATEGORIZED_LABEL;
      const isUncategorized = !resolvedCat && !record.category;
      addCategory(catTitle, secs, isUncategorized);

      const itemTitle =
        buildItemPathLabel(items, record.item_id) || record.item?.title || '未命名';
      const existing = itemMap.get(record.item_id);
      if (existing) {
        existing.seconds += secs;
      } else {
        itemMap.set(record.item_id, { title: itemTitle, seconds: secs });
      }
    } else if (record.category) {
      addCategory(record.category, secs);
    } else {
      addCategory(STATS_UNCATEGORIZED_LABEL, secs, true);
    }
  }

  const timeline = buildDayTimelineFromRecords(records, date, '今天', items);
  const gapSeconds = timeline.records
    .filter((e) => e.is_gap)
    .reduce(
      (sum, e) => sum + (e.duration_seconds ?? (e.duration_minutes ?? 0) * 60),
      0
    );

  let currentElapsedSeconds = 0;
  if (currentActivity?.occurred_at) {
    currentElapsedSeconds = recordDurationSeconds(currentActivity, nowIso);
  }

  const by_category: TodayActivityStats['by_category'] = Array.from(categoryMap.entries())
    .map(([category, v]) => ({
      category,
      seconds: v.seconds,
      is_uncategorized: v.is_uncategorized,
    }))
    .filter((row) => row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  if (gapSeconds > 0) {
    by_category.push({
      category: STATS_GAP_LABEL,
      seconds: gapSeconds,
      is_gap: true,
    });
  }

  return {
    date,
    recorded_seconds: recordedSeconds,
    gap_seconds: gapSeconds,
    current_elapsed_seconds: currentElapsedSeconds,
    by_category,
    by_item: Array.from(itemMap.entries())
      .map(([item_id, v]) => ({ item_id, item_title: v.title, seconds: v.seconds }))
      .filter((row) => row.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds),
  };
}

/** 时间线/统计：秒级时长文案（秒 / 分+秒 / 时+分+秒） */
export function formatTimelineDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe <= 0) return '0秒';

  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  if (h > 0) return `${h}小时${m}分钟${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

/** 统计展示：与时间线一致的秒级时长 */
export function formatStatDuration(totalSeconds: number): string {
  return formatTimelineDuration(totalSeconds);
}

/** 进行中活动时钟：不足 1 小时 MM:SS，否则 H:MM:SS */
export function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0分钟';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分`;
}
