import { dateAndTimeToIso } from '@/lib/activity/record-time';
import type { DiaryExtractCandidate } from '@/lib/activity/diary-extract-records';
import { normalizeTimeSegment } from '@/lib/activity/time-segment';
import { resolveRecordOriginalText } from '@/lib/activity/record-form';
import { resolveTemporalFields } from '@/lib/utils/record-unit-mapper';
import type { Record as TetoRecord } from '@/types/teto';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function findAnchorOccurredAt(
  afterExcerpt: string | undefined,
  dayRecords: TetoRecord[],
  createdInBatch: TetoRecord[]
): string | null {
  const needle = afterExcerpt?.trim();
  if (!needle) return null;
  const normalizedNeedle = normalizeForMatch(needle);

  const pool = [...dayRecords, ...createdInBatch];
  for (const record of pool) {
    const text = resolveRecordOriginalText(record) || record.content || '';
    if (!text) continue;
    if (normalizeForMatch(text).includes(normalizedNeedle)) {
      return record.occurred_at ?? null;
    }
  }
  return null;
}

function addMinutesToIso(iso: string, minutes: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export interface ResolvedCandidateTime {
  occurred_at: string;
  time_text?: string;
  time_precision?: DiaryExtractCandidate['time_precision'];
  time_anchor_date?: string;
}

export function resolveDiaryCandidateOccurredAt(params: {
  candidate: DiaryExtractCandidate;
  anchorDate: string;
  dayRecords?: TetoRecord[];
  createdInBatch?: TetoRecord[];
}): ResolvedCandidateTime {
  const { candidate, anchorDate } = params;
  const dayRecords = params.dayRecords ?? [];
  const createdInBatch = params.createdInBatch ?? [];
  const sequenceOffset = Math.max(0, (candidate.sequence ?? 1) - 1);

  if (candidate.time_precision !== 'fuzzy') {
    const temporal = resolveTemporalFields(anchorDate, '发生', {
      time_text: candidate.time_text ?? candidate.raw_input,
      time_precision: candidate.time_precision,
      location: candidate.location,
    });

    const anchorOccurredAt = findAnchorOccurredAt(candidate.afterExcerpt, dayRecords, createdInBatch);
    let occurredAt = temporal.occurredAt;
    if (anchorOccurredAt && occurredAt && Date.parse(occurredAt) <= Date.parse(anchorOccurredAt)) {
      occurredAt = addMinutesToIso(anchorOccurredAt, 1 + sequenceOffset);
    } else if (!occurredAt && anchorOccurredAt) {
      occurredAt = addMinutesToIso(anchorOccurredAt, 1 + sequenceOffset);
    }

    return {
      occurred_at: occurredAt ?? dateAndTimeToIso(anchorDate, `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`),
      time_text: candidate.time_text,
      time_precision: candidate.time_precision,
      ...(temporal.anchorDate ? { time_anchor_date: temporal.anchorDate } : {}),
    };
  }

  const segment = normalizeTimeSegment(candidate.time_text);
  const anchorOccurredAt = findAnchorOccurredAt(candidate.afterExcerpt, dayRecords, createdInBatch);

  if (anchorOccurredAt) {
    return {
      occurred_at: addMinutesToIso(anchorOccurredAt, 1 + sequenceOffset),
      time_text: segment?.label ?? candidate.time_text,
      time_precision: 'fuzzy',
      time_anchor_date: anchorDate,
    };
  }

  const sortHour = segment?.sortHour ?? 12;
  const sortMinute = (segment?.sortMinute ?? 0) + sequenceOffset;

  return {
    occurred_at: dateAndTimeToIso(anchorDate, `${pad2(sortHour)}:${pad2(Math.min(sortMinute, 59))}`),
    time_text: segment?.label ?? candidate.time_text,
    time_precision: 'fuzzy',
    time_anchor_date: anchorDate,
  };
}

export function sortCandidatesForCreation(candidates: DiaryExtractCandidate[]): DiaryExtractCandidate[] {
  return [...candidates].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}
