import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import type { DayTimeline, TimelineEntry } from '@/types/teto';

function formatTimeHHMM(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseSegmentLabel(label: string): { tagPath?: string; actionLabel?: string } {
  const sep = ' · ';
  const idx = label.indexOf(sep);
  if (idx === -1) return { tagPath: label };
  return {
    tagPath: label.slice(0, idx).trim() || undefined,
    actionLabel: label.slice(idx + sep.length).trim() || undefined,
  };
}

function calcDurationSeconds(
  startMs: number,
  endMs: number | null,
  isGap = false,
  nowMs = Date.now()
): number | undefined {
  if (isGap) {
    const end = endMs ?? startMs;
    const secs = Math.max(0, Math.round((end - startMs) / 1000));
    return secs > 0 ? secs : undefined;
  }
  const end = endMs ?? nowMs;
  const secs = Math.max(0, Math.round((end - startMs) / 1000));
  return secs > 0 ? secs : undefined;
}

function hhmmToMs(date: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

/** 块时间轴内、非空白的发生条目（用于判断 DB 是否已拆成多段） */
function blockActivityEntries(
  feed: DayTimeline,
  blockStartMs: number
): TimelineEntry[] {
  return feed.records.filter((e) => {
    if (e.is_gap || e.kind !== 'activity') return false;
    if (e.is_current) return true;
    if (!e.start_time) return false;
    return hhmmToMs(feed.date, e.start_time) >= blockStartMs - 60_000;
  });
}

/**
 * 块时间轴有多段、但今日时间线仍只有一条进行中记录时，按块内各段展开显示。
 * 若 records 已通过 switch 拆成多段，则不再投影，避免重复。
 */
export function expandFeedWithBlockSegments(
  feed: DayTimeline,
  segments: BlockTimelineSegment[],
  currentActivityId: string | null
): DayTimeline {
  if (segments.length <= 1) return feed;

  const blockStartMs = segments[0].startMs;
  const blockEntries = blockActivityEntries(feed, blockStartMs);
  if (blockEntries.length !== 1) return feed;

  const currentIdx = feed.records.findIndex((e) => e.is_current);
  if (currentIdx < 0) return feed;

  const segmentEntries: TimelineEntry[] = segments.map((seg, idx) => {
    const isCurrent = seg.endMs == null;
    const { tagPath, actionLabel } = parseSegmentLabel(seg.label);
    const durationSeconds = calcDurationSeconds(seg.startMs, seg.endMs, seg.isGap);
    const durationMinutes =
      durationSeconds != null ? Math.max(0, Math.round(durationSeconds / 60)) : undefined;

    return {
      id: isCurrent
        ? currentActivityId ?? feed.records[currentIdx]?.id ?? `block-seg-${idx}`
        : `block-seg-${seg.startMs}-${idx}`,
      kind: 'activity',
      record_type: '发生',
      start_time: formatTimeHHMM(seg.startMs),
      end_time: isCurrent ? undefined : formatTimeHHMM(seg.endMs!),
      text: seg.label,
      tag_path: tagPath,
      action_label: actionLabel,
      is_current: isCurrent,
      occurred_at: isCurrent ? new Date(seg.startMs).toISOString() : undefined,
      duration_minutes: durationMinutes,
      duration_seconds: durationSeconds,
    };
  });

  const nextRecords = [...feed.records];
  nextRecords.splice(currentIdx, 1, ...segmentEntries);
  return { ...feed, records: nextRecords };
}

/** 块时间线：将 sessionStorage 段转为与今日时间线相同的 DayTimeline 结构 */
export function blockSegmentsToDayTimeline(
  segments: BlockTimelineSegment[],
  date?: string
): DayTimeline {
  const day =
    date ??
    (segments[0]
      ? new Date(segments[0].startMs).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  const records: TimelineEntry[] = segments.map((seg, idx) => {
    const isCurrent = seg.endMs == null;
    const { tagPath, actionLabel } = parseSegmentLabel(seg.label);
    const durationSeconds = calcDurationSeconds(seg.startMs, seg.endMs, seg.isGap);

    const isGap = Boolean(seg.isGap);
    return {
      id: `block-seg-${seg.startMs}-${idx}`,
      kind: isGap ? ('gap' as const) : ('activity' as const),
      record_type: isGap ? undefined : ('发生' as const),
      start_time: formatTimeHHMM(seg.startMs),
      end_time: isGap || !isCurrent ? formatTimeHHMM(seg.endMs ?? seg.startMs) : undefined,
      text: seg.label,
      tag_path: isGap ? undefined : tagPath,
      action_label: isGap ? undefined : actionLabel,
      is_gap: isGap,
      is_current: isGap ? false : isCurrent,
      occurred_at: isCurrent && !isGap ? new Date(seg.startMs).toISOString() : undefined,
      duration_seconds: durationSeconds,
      duration_minutes:
        durationSeconds != null ? Math.max(0, Math.round(durationSeconds / 60)) : undefined,
    };
  });

  return {
    date: day,
    label: '块时间线',
    record_count: records.length,
    records,
  };
}
