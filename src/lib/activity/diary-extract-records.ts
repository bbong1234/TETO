import type { Record as TetoRecord } from '@/types/teto';
import { resolveRecordOriginalText } from '@/lib/activity/record-form';
import {
  normalizeExtractCandidate,
  normalizeExtractCandidates,
} from '@/lib/activity/diary-time-normalize';

export type DiaryExtractTimePrecision = 'exact' | 'approx' | 'fuzzy';

export interface DiaryExtractCandidate {
  id: string;
  sourceExcerpt: string;
  raw_input: string;
  time_text?: string;
  time_precision?: DiaryExtractTimePrecision;
  location?: string;
  confidence: number;
  skipReason?: string;
  afterExcerpt?: string;
  sequence?: number;
}

export interface DiaryExtractResult {
  candidates: DiaryExtractCandidate[];
  is_fallback: boolean;
}

const TIME_PRECISIONS = new Set<DiaryExtractTimePrecision>(['exact', 'approx', 'fuzzy']);

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function normalizeCandidate(raw: unknown, index: number): DiaryExtractCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const sourceExcerpt = typeof item.sourceExcerpt === 'string' ? item.sourceExcerpt.trim() : '';
  const rawInput = typeof item.raw_input === 'string' ? item.raw_input.trim() : '';
  if (!sourceExcerpt || !rawInput) return null;

  const timePrecision =
    typeof item.time_precision === 'string' &&
    TIME_PRECISIONS.has(item.time_precision as DiaryExtractTimePrecision)
      ? (item.time_precision as DiaryExtractTimePrecision)
      : undefined;

  const candidate: DiaryExtractCandidate = {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `candidate-${index}`,
    sourceExcerpt,
    raw_input: rawInput,
    time_text: typeof item.time_text === 'string' && item.time_text.trim() ? item.time_text.trim() : undefined,
    time_precision: timePrecision,
    location: typeof item.location === 'string' && item.location.trim() ? item.location.trim() : undefined,
    confidence: clampConfidence(item.confidence),
    skipReason:
      typeof item.skipReason === 'string' && item.skipReason.trim() ? item.skipReason.trim() : undefined,
    afterExcerpt:
      typeof item.afterExcerpt === 'string' && item.afterExcerpt.trim()
        ? item.afterExcerpt.trim()
        : undefined,
    sequence: typeof item.sequence === 'number' && Number.isFinite(item.sequence) ? item.sequence : index + 1,
  };

  return normalizeExtractCandidate(candidate);
}

export function parseExtractRecordsResponse(raw: string): DiaryExtractCandidate[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  try {
    const parsed = JSON.parse(jsonText) as { candidates?: unknown[] } | unknown[];
    const list = Array.isArray(parsed) ? parsed : parsed?.candidates;
    if (!Array.isArray(list)) return [];
    return normalizeExtractCandidates(
      list
        .map((item, index) => normalizeCandidate(item, index))
        .filter((item): item is DiaryExtractCandidate => item != null)
    );
  } catch {
    return [];
  }
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\d{1,2}:\d{2}\]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isSimilarText(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function filterDuplicateCandidates(
  candidates: DiaryExtractCandidate[],
  dayRecords: TetoRecord[]
): DiaryExtractCandidate[] {
  const existingTexts = dayRecords.map((record) => resolveRecordOriginalText(record) || record.content || '');

  return candidates.map((candidate) => {
    if (candidate.skipReason) return candidate;

    const duplicate = existingTexts.some((text) => isSimilarText(text, candidate.raw_input));
    if (duplicate) {
      return { ...candidate, skipReason: '与时间线已有记录相似' };
    }
    return candidate;
  });
}

export function buildExtractRecordsPrompt(params: {
  date: string;
  diaryPlainText: string;
  recordsSummary?: string;
  linkedRecordIds?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const linked =
    params.linkedRecordIds && params.linkedRecordIds.length > 0
      ? params.linkedRecordIds.join(', ')
      : '无';

  const systemPrompt = `你是个人日记分析助手。用户会把当天日记和时间线摘要发给你，请从中抽取可写入时间线的事实事件。

规则：
1. 只抽取可核实的行为/行程/消费（去了、做了、买了、见了），跳过纯感受、反思、计划、疑问
2. 不得捏造日记未出现的信息；地点、动作必须来自原文
3. raw_input 禁止包含任何时间词或钟点，只写事件本身（如「去了西湖」「在公司吃了烧鸭饭」「去接妹妹」）
4. 时间只写入 time_text；有 [HH:mm] 日记标记时用精确钟点（如 20:30）；「11点多」等写 approx；「早上/中午/下午/晚上/凌晨」写 fuzzy
5. 若事件在日记中明确发生在另一事件之后，填 afterExcerpt 为参照事件原文片段
6. 按日记出现顺序填写 sequence（从 1 递增）
7. 若事件已在时间线摘要中出现，或已在 linkedRecordIds 中关联，输出 skipReason 说明重复，confidence 设为 0
8. 不确定的事件不要输出
9. 只输出 JSON，不要 markdown

输出格式：
{
  "candidates": [
    {
      "id": "c1",
      "sourceExcerpt": "日记原文片段",
      "raw_input": "去了西湖",
      "time_text": "早上",
      "time_precision": "fuzzy",
      "location": "西湖",
      "afterExcerpt": "",
      "sequence": 1,
      "confidence": 0.85
    }
  ]
}`;

  const userPrompt = [
    `日期：${params.date}`,
    '',
    '已有时间线摘要：',
    params.recordsSummary?.trim() || '（暂无）',
    '',
    `已关联 recordId：${linked}`,
    '',
    '日记正文：',
    params.diaryPlainText.trim() || '（空）',
  ].join('\n');

  return { systemPrompt, userPrompt };
}

export { normalizeExtractCandidate, normalizeExtractCandidates };
