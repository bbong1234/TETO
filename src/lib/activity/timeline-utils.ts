import type { Record, DayTimeline, TimelineEntry, Item } from '@/types/teto';
import { buildRecordDisplayLabel } from './item-tree';

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

/**
 * 从记录列表构建今日时间线（含进行中记录与空白时间段）
 */
export function buildDayTimelineFromRecords(
  records: Record[],
  date: string,
  label = '今天',
  items: Item[] = []
): DayTimeline {
  const timed = records
    .filter(isTimedActivityRecord)
    .sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''));

  const entries: TimelineEntry[] = [];
  let prevEndIso: string | null = null;

  for (const record of timed) {
    const startIso = record.occurred_at!;
    const isCurrent = record.lifecycle_status === 'active' && !record.occurred_at_end;

    if (prevEndIso) {
      const gapMinutes = calcMinutesBetween(prevEndIso, startIso);
      if (gapMinutes >= 5) {
        entries.push({
          id: `gap:${prevEndIso}:${startIso}`,
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

  return {
    date,
    label,
    record_count: timed.length,
    records: entries,
  };
}
