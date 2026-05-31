import type { Record, DayTimeline, TimelineEntry, Item, RecordType } from '@/types/teto';
import { GAP_THRESHOLD_MINUTES } from '@/lib/activity/constants';
import { buildRecordDisplayLabel } from './item-tree';

/** 记录是否归属某日（与记录页分组、feed 构建共用） */
export function recordBelongsToDay(record: Record, date: string): boolean {
  if (record.type === '计划') {
    if (record.time_anchor_date) {
      return record.time_anchor_date === date;
    }
  }
  if (record.occurred_at) {
    const d = new Date(record.occurred_at);
    if (!Number.isNaN(d.getTime())) {
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (local === date) return true;
    }
  }
  if (record.created_at) {
    const d = new Date(record.created_at);
    if (!Number.isNaN(d.getTime())) {
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (local === date && (record.type === '想法' || record.type === '总结')) {
        return true;
      }
    }
  }
  return record.date === date;
}

/** 记录页分组用的展示日期 */
export function getRecordDisplayDate(record: Record): string {
  if (record.type === '计划' && record.time_anchor_date) {
    return record.time_anchor_date;
  }
  if (record.occurred_at) {
    const d = new Date(record.occurred_at);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  if (record.created_at && (record.type === '想法' || record.type === '总结')) {
    const d = new Date(record.created_at);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return record.date ?? '';
}

function formatTimeHHMM(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function buildEntryText(record: Record, items?: Item[]): string {
  const label = buildRecordDisplayLabel(record, items);
  if (label) return label;
  const semantic = [record.action_text, record.event_text].filter(Boolean);
  if (semantic.length > 0) return semantic.join('、');
  return record.content;
}

function isTimedActivityRecord(record: Record): boolean {
  return record.type === '发生' && !!record.occurred_at;
}

function calcMinutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
}

function recordOnDate(record: Record, date: string): boolean {
  return recordBelongsToDay(record, date);
}

function isActivePlan(record: Record): boolean {
  return record.type === '计划' && (!record.lifecycle_status || record.lifecycle_status === 'active');
}

function occurredOnDate(record: Record, date: string): boolean {
  if (!record.occurred_at) return false;
  const d = new Date(record.occurred_at);
  if (Number.isNaN(d.getTime())) return false;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === date;
}

function sortKeyForEntry(entry: TimelineEntry): string {
  if (entry.is_pinned) return 'z-pinned';
  if (entry.is_gap && entry.start_time) return entry.start_time;
  if (entry.start_time) return entry.start_time;
  return 'z-untimed';
}

function feedKindForType(type: RecordType): TimelineEntry['kind'] {
  if (type === '计划') return 'plan';
  if (type === '想法') return 'idea';
  if (type === '总结') return 'summary';
  return 'activity';
}

function buildActivityEntries(
  records: Record[],
  date: string,
  items: Item[] = [],
  includeGaps = true
): TimelineEntry[] {
  const timed = records
    .filter(isTimedActivityRecord)
    .filter((r) => occurredOnDate(r, date))
    .sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''));

  const entries: TimelineEntry[] = [];
  let prevEndIso: string | null = null;

  for (const record of timed) {
    const startIso = record.occurred_at!;
    const isCurrent = record.lifecycle_status === 'active' && !record.occurred_at_end;

    if (includeGaps && prevEndIso) {
      const gapMinutes = calcMinutesBetween(prevEndIso, startIso);
      if (gapMinutes >= GAP_THRESHOLD_MINUTES) {
        entries.push({
          id: `gap:${prevEndIso}:${startIso}`,
          kind: 'gap',
          start_time: formatTimeHHMM(prevEndIso),
          end_time: formatTimeHHMM(startIso),
          text: '空白时间',
          is_gap: true,
          duration_minutes: gapMinutes,
        });
      }
    }

    const endIso = record.occurred_at_end;
    let duration: number | undefined;
    if (record.duration_minutes != null) {
      duration = record.duration_minutes;
    } else if (record.occurred_at_end) {
      duration = calcMinutesBetween(record.occurred_at!, record.occurred_at_end);
    } else if (isCurrent) {
      duration = calcMinutesBetween(record.occurred_at!, new Date().toISOString());
    }

    entries.push({
      id: record.id,
      kind: 'activity',
      record_type: '发生',
      start_time: formatTimeHHMM(startIso),
      end_time: isCurrent ? undefined : formatTimeHHMM(endIso),
      text: buildEntryText(record, items),
      is_current: isCurrent,
      occurred_at: isCurrent ? startIso : undefined,
      duration_minutes: duration,
      item_title: record.item?.title,
    });

    if (record.occurred_at_end) {
      prevEndIso = record.occurred_at_end;
    } else if (isCurrent) {
      prevEndIso = null;
    }
  }

  return entries;
}

function buildTimedFeedEntry(record: Record, items?: Item[]): TimelineEntry | null {
  if (!record.occurred_at) return null;
  const kind = feedKindForType(record.type);
  const start = formatTimeHHMM(record.occurred_at);
  const end = formatTimeHHMM(record.occurred_at_end);
  return {
    id: record.id,
    kind,
    record_type: record.type,
    start_time: start,
    end_time: end,
    text: buildEntryText(record, items),
    item_title: record.item?.title,
    time_label: record.time_text ?? undefined,
  };
}

function buildUntimedFeedEntry(record: Record, items?: Item[]): TimelineEntry {
  const kind = feedKindForType(record.type);
  return {
    id: record.id,
    kind,
    record_type: record.type,
    text: buildEntryText(record, items),
    item_title: record.item?.title,
    time_label: record.time_text ?? undefined,
  };
}

/**
 * 从记录列表构建单日动态 feed（发生 + 空白 + 计划 + 想法，总结作回顾展示）
 * @param options.includeGaps 是否在相邻活动间插入空白时间（事项详情页应设为 false）
 */
export function buildDayFeedFromRecords(
  records: Record[],
  date: string,
  label = '今天',
  items: Item[] = [],
  options?: { includeGaps?: boolean }
): DayTimeline {
  const includeGaps = options?.includeGaps !== false;
  const dayRecords = records.filter((r) => recordOnDate(r, date));

  const pinnedPlans = dayRecords.filter(
    (r) => r.type === '计划' && isActivePlan(r) && !occurredOnDate(r, date)
  );

  const pinnedIds = new Set(pinnedPlans.map((r) => r.id));

  const activityEntries = buildActivityEntries(dayRecords, date, items, includeGaps);

  const timedOthers: TimelineEntry[] = [];
  for (const record of dayRecords) {
    if (pinnedIds.has(record.id)) continue;
    if (record.type === '发生') continue;
    if (!occurredOnDate(record, date)) continue;
    const entry = buildTimedFeedEntry(record, items);
    if (entry) timedOthers.push(entry);
  }

  const mergedTimed = [...activityEntries, ...timedOthers].sort((a, b) => {
    const ka = sortKeyForEntry(a);
    const kb = sortKeyForEntry(b);
    return ka.localeCompare(kb);
  });

  const pinnedEntries: TimelineEntry[] = pinnedPlans.map((record) => ({
    ...buildUntimedFeedEntry(record, items),
    is_pinned: true,
    kind: 'plan',
    record_type: '计划',
  }));

  const untimed: TimelineEntry[] = [];
  for (const record of dayRecords) {
    if (pinnedIds.has(record.id)) continue;
    if (record.type === '发生') continue;
    if (occurredOnDate(record, date)) continue;
    if (record.type === '计划' && !isActivePlan(record)) continue;
    untimed.push(buildUntimedFeedEntry(record, items));
  }

  const allEntries = [...pinnedEntries, ...mergedTimed, ...untimed];

  return {
    date,
    label,
    record_count: dayRecords.length,
    records: allEntries,
  };
}

/**
 * 从记录列表构建活动时间线（仅发生 + 空白，兼容旧调用）
 */
export function buildDayTimelineFromRecords(
  records: Record[],
  date: string,
  label = '今天',
  items: Item[] = [],
  options?: { includeGaps?: boolean }
): DayTimeline {
  const feed = buildDayFeedFromRecords(records, date, label, items, options);
  return {
    ...feed,
    records: feed.records.filter(
      (e) => e.kind === 'activity' || e.kind === 'gap' || e.is_gap
    ),
    record_count: records.filter(
      (r) => r.type === '发生' && recordOnDate(r, date)
    ).length,
  };
}

export { GAP_THRESHOLD_MINUTES };
