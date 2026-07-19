import type {
  DiaryExtractCandidate,
  DiaryExtractTimePrecision,
} from '@/lib/activity/diary-extract-records';
import { normalizeTimeSegment } from '@/lib/activity/time-segment';

const TIME_PREFIX_RE =
  /^((?:今天|昨天|明天|上午|下午|中午|晚上|凌晨|早间|午间|晚间|早晨|清晨|傍晚|黄昏|夜里|深夜)?\s*(?:\[\d{1,2}:\d{2}\]|\d{1,2}[:：]\d{2}|\d{1,2}点多|\d{1,2}点(?:\d{1,2}分?)?)?\s*)/;

const LEADING_BRACKET_TIME_RE = /^\[\d{1,2}:\d{2}\]\s*/;

const FUZZY_PREFIX_WORDS = [
  '今天',
  '昨天',
  '明天',
  '早上',
  '上午',
  '中午',
  '下午',
  '晚上',
  '凌晨',
  '早晨',
  '清晨',
  '傍晚',
  '黄昏',
  '夜里',
  '深夜',
  '早间',
  '午间',
  '晚间',
];

export function stripTimePrefixFromText(text: string): string {
  let next = text.trim();
  if (!next) return '';

  next = next.replace(LEADING_BRACKET_TIME_RE, '');
  next = next.replace(TIME_PREFIX_RE, '');

  for (const word of FUZZY_PREFIX_WORDS) {
    if (next.startsWith(word)) {
      const rest = next.slice(word.length).trimStart();
      if (rest.length > 0) {
        next = rest;
        break;
      }
    }
  }

  return next.trim();
}

export function stripRedundantTimePrefix(summary: string, timeText: string): string {
  let next = summary.trim();
  if (!next || !timeText.trim()) return next;

  next = stripTimePrefixFromText(next);

  const time = timeText.trim();
  if (next.startsWith(time)) {
    next = next.slice(time.length).trimStart();
  }

  return next;
}

function inferPrecisionFromTimeText(timeText: string): DiaryExtractTimePrecision {
  const segment = normalizeTimeSegment(timeText);
  if (segment) return segment.precision;
  if (/^\d{1,2}[:：]\d{2}$/.test(timeText.replace(/\s+/g, ''))) return 'exact';
  if (/点多|左右|大概|约/.test(timeText)) return 'approx';
  return 'fuzzy';
}

function extractTimeTextFromRaw(rawInput: string, existing?: string): string | undefined {
  if (existing?.trim()) return existing.trim();

  const bracket = rawInput.match(/^\[(\d{1,2}:\d{2})\]/);
  if (bracket) return bracket[1];

  const clock = rawInput.match(/^(\d{1,2}[:：]\d{2}|\d{1,2}点多|\d{1,2}点(?:\d{1,2}分?)?)/);
  if (clock) return clock[1];

  for (const word of FUZZY_PREFIX_WORDS) {
    if (rawInput.startsWith(word)) return word;
  }

  return undefined;
}

export function normalizeExtractCandidate(candidate: DiaryExtractCandidate): DiaryExtractCandidate {
  const extractedTime = extractTimeTextFromRaw(candidate.raw_input, candidate.time_text);
  const segment = normalizeTimeSegment(extractedTime);

  let time_text = candidate.time_text?.trim() || extractedTime;
  let time_precision = candidate.time_precision;

  if (segment?.precision === 'fuzzy') {
    time_text = segment.label;
    time_precision = 'fuzzy';
  } else if (segment) {
    time_text = extractedTime ?? time_text;
    time_precision = time_precision ?? segment.precision;
  } else if (time_text) {
    time_precision = time_precision ?? inferPrecisionFromTimeText(time_text);
  }

  const raw_input = stripRedundantTimePrefix(candidate.raw_input, time_text ?? '');

  return {
    ...candidate,
    raw_input: raw_input || candidate.raw_input.trim(),
    ...(time_text ? { time_text } : {}),
    ...(time_precision ? { time_precision } : {}),
  };
}

export function normalizeExtractCandidates(candidates: DiaryExtractCandidate[]): DiaryExtractCandidate[] {
  return candidates.map((candidate, index) =>
    normalizeExtractCandidate({
      ...candidate,
      sequence: candidate.sequence ?? index + 1,
    })
  );
}
