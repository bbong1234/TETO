import type { Record as TetoRecord } from '@/types/teto';
import type { DiaryExtractTimePrecision } from '@/lib/activity/diary-extract-records';

export type TimeSegmentLabel = '凌晨' | '早上' | '中午' | '下午' | '晚上';

export interface TimeSegmentInfo {
  label: TimeSegmentLabel;
  sortHour: number;
  sortMinute: number;
  precision: DiaryExtractTimePrecision;
}

const SEGMENT_RULES: Array<{
  label: TimeSegmentLabel;
  keywords: readonly string[];
  sortHour: number;
  sortMinute: number;
}> = [
  { label: '凌晨', keywords: ['凌晨', '深夜'], sortHour: 5, sortMinute: 0 },
  { label: '早上', keywords: ['早上', '早晨', '清晨', '上午', '早间'], sortHour: 9, sortMinute: 0 },
  { label: '中午', keywords: ['中午', '午饭', '午休', '午间'], sortHour: 12, sortMinute: 0 },
  { label: '下午', keywords: ['下午'], sortHour: 15, sortMinute: 0 },
  { label: '晚上', keywords: ['晚上', '傍晚', '黄昏', '夜里', '晚间', '晚饭'], sortHour: 20, sortMinute: 0 },
];

const EXACT_CLOCK_RE = /^(?:\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分?)?)$/;
const APPROX_TIME_RE = /点多|左右|许|大概|约/;

export function normalizeTimeSegment(timeText: string | undefined | null): TimeSegmentInfo | null {
  const trimmed = timeText?.trim() ?? '';
  if (!trimmed) return null;

  if (EXACT_CLOCK_RE.test(trimmed.replace(/\s+/g, ''))) {
    const match = trimmed.match(/(\d{1,2})[:：](\d{1,2})/);
    if (match) {
      return {
        label: '晚上',
        sortHour: Number(match[1]),
        sortMinute: Number(match[2]),
        precision: 'exact',
      };
    }
    const pointMatch = trimmed.match(/(\d{1,2})点(?:(\d{1,2})分?)?/);
    if (pointMatch) {
      return {
        label: '晚上',
        sortHour: Number(pointMatch[1]),
        sortMinute: pointMatch[2] ? Number(pointMatch[2]) : 0,
        precision: 'exact',
      };
    }
  }

  if (APPROX_TIME_RE.test(trimmed)) {
    const pointMatch = trimmed.match(/(\d{1,2})/);
    if (pointMatch) {
      return {
        label: inferSegmentLabelFromHour(Number(pointMatch[1])),
        sortHour: Number(pointMatch[1]),
        sortMinute: 0,
        precision: 'approx',
      };
    }
  }

  for (const rule of SEGMENT_RULES) {
    if (rule.keywords.some((keyword) => trimmed.includes(keyword))) {
      return {
        label: rule.label,
        sortHour: rule.sortHour,
        sortMinute: rule.sortMinute,
        precision: 'fuzzy',
      };
    }
  }

  return null;
}

export function inferSegmentLabelFromHour(hour: number): TimeSegmentLabel {
  if (hour < 6) return '凌晨';
  if (hour < 11) return '早上';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  return '晚上';
}

function isLegacyFuzzyTimeText(timeText: string | undefined | null): boolean {
  const segment = normalizeTimeSegment(timeText);
  return segment?.precision === 'fuzzy';
}

/** 时间线时段列：fuzzy 取标准五段，exact/approx 由 occurred_at 推导 */
export function segmentLabelForRecord(record: Pick<TetoRecord, 'time_text' | 'time_precision' | 'occurred_at'>): string | undefined {
  const fuzzy =
    record.time_precision === 'fuzzy' ||
    (record.time_precision == null && isLegacyFuzzyTimeText(record.time_text));

  if (fuzzy) {
    return segmentLabelForDisplay(record.time_text, 'fuzzy');
  }

  if (record.occurred_at) {
    const d = new Date(record.occurred_at);
    if (!Number.isNaN(d.getTime())) {
      return inferSegmentLabelFromHour(d.getHours());
    }
  }

  const fromText = normalizeTimeSegment(record.time_text);
  if (fromText?.precision === 'fuzzy') {
    return fromText.label;
  }

  return undefined;
}

export function segmentLabelForDisplay(
  timeText: string | undefined | null,
  timePrecision?: DiaryExtractTimePrecision | null
): string | undefined {
  if (timePrecision === 'fuzzy') {
    const segment = normalizeTimeSegment(timeText);
    return segment?.label ?? timeText?.trim() ?? undefined;
  }
  return undefined;
}
