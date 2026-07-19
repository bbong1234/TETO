import type { Record, DayTimeline, TimelineEntry, Item, RecordType } from '@/types/teto';
import { GAP_THRESHOLD_MINUTES } from '@/lib/activity/constants';
import { buildTimelineEntryParts } from './item-tree';
import { segmentLabelForRecord, normalizeTimeSegment } from '@/lib/activity/time-segment';
import { calcNetDurationMinutes, calcNetElapsedSeconds, isSessionPaused } from './session-utils';

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

function buildEntryFields(
  record: Record,
  items?: Item[],
  isCurrent = false,
  subItemTitles?: ReadonlyMap<string, string>
): Pick<TimelineEntry, 'text' | 'tag_path' | 'tag_path_parts' | 'detail_text'> {
  const parts = buildTimelineEntryParts(record, items, { isCurrent, subItemTitles });
  return {
    text: parts.text,
    tag_path: parts.tagPath || undefined,
    tag_path_parts: parts.tagPathParts.length > 0 ? parts.tagPathParts : undefined,
    detail_text: parts.detail || undefined,
  };
}

function isTimedActivityRecord(record: Record): boolean {
  return record.type === '发生' && !!record.occurred_at;
}

function isActiveOccurrence(record: Record): boolean {
  return record.type === '发生' && record.lifecycle_status === 'active' && !record.occurred_at_end;
}

/** 时间线中唯一「进行中」条目的 id（与 CurrentActivityCard 一致） */
export function resolveTimelineCurrentId(
  records: Record[],
  currentActivityId?: string | null
): string | null {
  if (currentActivityId) {
    const match = records.find((r) => r.id === currentActivityId);
    if (match && isActiveOccurrence(match)) {
      return currentActivityId;
    }
  }
  const actives = records.filter(isActiveOccurrence);
  const running = actives.find((r) => {
    const state = r.session_state;
    if (state === 'paused' || state === 'nested_paused') return false;
    return state === 'running' || !state;
  });
  if (running) return running.id;
  if (actives.length === 1) return actives[0].id;
  return null;
}

function resolveDisplayEndIso(record: Record, isCurrent: boolean): string | null | undefined {
  if (isCurrent) return null;
  if (record.occurred_at_end) return record.occurred_at_end;
  if (isSessionPaused(record.session_state) && record.paused_at) {
    return record.paused_at;
  }
  if (
    record.lifecycle_status !== 'active' &&
    record.occurred_at &&
    record.duration_minutes != null
  ) {
    return new Date(
      Date.parse(record.occurred_at) + record.duration_minutes * 60000
    ).toISOString();
  }
  return null;
}

function calcMinutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
}

function calcSecondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}

function resolveDurationSeconds(
  record: Record,
  isCurrent: boolean,
  endIso: string | null | undefined
): number | undefined {
  if (isCurrent) {
    const secs = calcNetElapsedSeconds(record);
    return secs > 0 ? secs : undefined;
  }
  if (endIso && record.occurred_at) {
    const hasPause = (record.paused_total_seconds ?? 0) > 0 || !!record.paused_at;
    const secs = hasPause
      ? calcNetElapsedSeconds({ ...record, occurred_at_end: endIso })
      : calcSecondsBetween(record.occurred_at, endIso);
    return secs > 0 ? secs : undefined;
  }
  if (record.duration_minutes != null && record.duration_minutes > 0) {
    return record.duration_minutes * 60;
  }
  return undefined;
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isFuzzyActivityRecord(record: Record): boolean {
  if (record.time_precision === 'fuzzy') return true;
  if (record.time_precision != null) return false;
  return normalizeTimeSegment(record.time_text)?.precision === 'fuzzy';
}

function sortKeyForEntry(entry: TimelineEntry): string {
  if (entry.is_pinned) return 'z-pinned';
  if (entry.is_gap && entry.start_time) return entry.start_time;
  if (entry.start_time) return entry.start_time;
  if (entry.time_label && entry.record_type === '发生') {
    const segment = normalizeTimeSegment(entry.time_label);
    const base = segment
      ? `${pad2(segment.sortHour)}:${pad2(segment.sortMinute)}`
      : 'z-fuzzy';
    if (entry.occurred_at) {
      const hhmm = formatTimeHHMM(entry.occurred_at);
      if (hhmm) return `${base}-${hhmm}`;
    }
    return base;
  }
  if (entry.occurred_at) {
    const hhmm = formatTimeHHMM(entry.occurred_at);
    if (hhmm) return hhmm;
  }
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
  includeGaps = true,
  currentActivityId?: string | null,
  subItemTitles?: ReadonlyMap<string, string>
): TimelineEntry[] {
  const timed = records
    .filter(isTimedActivityRecord)
    .filter((r) => occurredOnDate(r, date))
    .sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''));

  const currentId = resolveTimelineCurrentId(timed, currentActivityId);
  const entries: TimelineEntry[] = [];
  let prevEndIso: string | null = null;

  for (const record of timed) {
    const startIso = record.occurred_at!;
    const isCurrent = record.id === currentId;

    if (includeGaps && prevEndIso && Date.parse(startIso) > Date.parse(prevEndIso)) {
      const gapSeconds = calcSecondsBetween(prevEndIso, startIso);
      const gapMinutes = Math.round(gapSeconds / 60);
      if (gapMinutes >= GAP_THRESHOLD_MINUTES) {
        entries.push({
          id: `gap:${prevEndIso}:${startIso}`,
          kind: 'gap',
          start_time: formatTimeHHMM(prevEndIso),
          end_time: formatTimeHHMM(startIso),
          text: '空白时间',
          is_gap: true,
          duration_minutes: gapMinutes,
          duration_seconds: gapSeconds,
        });
      }
    }

    const displayEndIso = resolveDisplayEndIso(record, isCurrent);
    const endIso = displayEndIso ?? record.occurred_at_end;
    const hasPause = (record.paused_total_seconds ?? 0) > 0 || !!record.paused_at;
    let duration: number | undefined;
    if (record.duration_minutes != null && !isCurrent) {
      duration = record.duration_minutes;
    } else if (endIso) {
      duration = hasPause
        ? calcNetDurationMinutes({ ...record, occurred_at_end: endIso })
        : calcMinutesBetween(record.occurred_at!, endIso);
    } else if (isCurrent) {
      duration = hasPause
        ? calcNetDurationMinutes(record)
        : calcMinutesBetween(record.occurred_at!, new Date().toISOString());
    }
    const durationSeconds = resolveDurationSeconds(record, isCurrent, endIso ?? undefined);
    if (durationSeconds != null && (duration == null || duration === 0)) {
      duration = Math.max(0, Math.round(durationSeconds / 60));
    }

    const isFuzzy = isFuzzyActivityRecord(record);
    const segmentLabel = segmentLabelForRecord(record);

    entries.push({
      id: record.id,
      kind: 'activity',
      record_type: '发生',
      start_time: isFuzzy ? undefined : formatTimeHHMM(startIso),
      end_time: isCurrent ? undefined : formatTimeHHMM(endIso),
      time_label: segmentLabel,
      ...buildEntryFields(record, items, isCurrent, subItemTitles),
      is_current: isCurrent,
      occurred_at: isFuzzy || isCurrent ? startIso : undefined,
      duration_minutes: duration,
      duration_seconds: durationSeconds,
      item_title: record.item?.title,
      is_unassigned: !record.item_id,
    });

    const chainEndIso = endIso ?? null;
    if (chainEndIso) {
      prevEndIso = chainEndIso;
    } else if (isCurrent) {
      prevEndIso = null;
    } else if (!prevEndIso || Date.parse(startIso) > Date.parse(prevEndIso)) {
      // 瞬时记录（无结束时间）：用开始时间推进链，避免重复空白段
      prevEndIso = startIso;
    }
  }

  return entries;
}

function buildTimedFeedEntry(
  record: Record,
  items?: Item[],
  subItemTitles?: ReadonlyMap<string, string>
): TimelineEntry | null {
  if (!record.occurred_at) return null;
  const kind = feedKindForType(record.type);
  const start = formatTimeHHMM(record.occurred_at);
  const end = formatTimeHHMM(record.occurred_at_end);
  const segmentLabel =
    record.type === '发生' ? segmentLabelForRecord(record) : record.time_text ?? undefined;
  return {
    id: record.id,
    kind,
    record_type: record.type,
    start_time: start,
    end_time: end,
    ...buildEntryFields(record, items, false, subItemTitles),
    item_title: record.item?.title,
    time_label: segmentLabel,
    is_unassigned: !record.item_id,
  };
}

function buildUntimedFeedEntry(
  record: Record,
  items?: Item[],
  subItemTitles?: ReadonlyMap<string, string>
): TimelineEntry {
  const kind = feedKindForType(record.type);
  return {
    id: record.id,
    kind,
    record_type: record.type,
    ...buildEntryFields(record, items, false, subItemTitles),
    item_title: record.item?.title,
    time_label: record.time_text ?? undefined,
    is_unassigned: !record.item_id,
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
  options?: {
    includeGaps?: boolean;
    currentActivityId?: string | null;
    subItemTitles?: ReadonlyMap<string, string>;
  }
): DayTimeline {
  const includeGaps = options?.includeGaps !== false;
  const subItemTitles = options?.subItemTitles;
  const dayRecords = records.filter((r) => recordOnDate(r, date));

  const pinnedPlans = dayRecords.filter(
    (r) => r.type === '计划' && isActivePlan(r) && !occurredOnDate(r, date)
  );

  const pinnedIds = new Set(pinnedPlans.map((r) => r.id));

  const activityEntries = buildActivityEntries(
    dayRecords,
    date,
    items,
    includeGaps,
    options?.currentActivityId,
    subItemTitles
  );

  const timedOthers: TimelineEntry[] = [];
  for (const record of dayRecords) {
    if (pinnedIds.has(record.id)) continue;
    if (record.type === '发生') continue;
    if (!occurredOnDate(record, date)) continue;
    const entry = buildTimedFeedEntry(record, items, subItemTitles);
    if (entry) timedOthers.push(entry);
  }

  const mergedTimed = [...activityEntries, ...timedOthers].sort((a, b) => {
    const ka = sortKeyForEntry(a);
    const kb = sortKeyForEntry(b);
    return ka.localeCompare(kb);
  });

  const pinnedEntries: TimelineEntry[] = pinnedPlans.map((record) => ({
    ...buildUntimedFeedEntry(record, items, subItemTitles),
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
    untimed.push(buildUntimedFeedEntry(record, items, subItemTitles));
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

export { GAP_THRESHOLD_MINUTES, sortKeyForEntry };

/** 今日时间线多选：可批量删除的真实记录条目（非空白、非投影段；进行中记录也可选） */
export function getTimelineEntrySelectRejectReason(entry: TimelineEntry): string | null {
  if (entry.is_gap) return 'is_gap';
  if (entry.is_pinned) return 'is_pinned';
  if (entry.id.startsWith('gap:')) return 'id_gap';
  if (entry.id.startsWith('block-seg-')) return 'id_block_seg';
  if (entry.id.startsWith('optimistic-block-seg-')) {
    // 块时间停止拆段：已完成的乐观记录与真实记录同等可选
    if (!entry.is_current && entry.end_time) return null;
    return 'id_optimistic_block_seg';
  }
  if (entry.id.startsWith('session:')) return 'id_session';
  if (entry.id.startsWith('optimistic-')) {
    if (!entry.is_current && entry.end_time) return null;
    return 'id_optimistic';
  }
  if (
    entry.kind === 'activity' ||
    entry.record_type === '发生' ||
    Boolean(entry.start_time && entry.end_time)
  ) {
    return null;
  }
  return 'kind_mismatch';
}

export function isTimelineEntrySelectable(entry: TimelineEntry): boolean {
  return getTimelineEntrySelectRejectReason(entry) === null;
}
