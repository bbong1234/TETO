import { buildUnitUpdate } from '@/lib/activity/build-unit-update';
import {
  buildDiaryRecordPayload,
  type DiaryRecordBuildParams,
} from '@/lib/activity/diary-record-from-text';
import type { DiaryExtractCandidate } from '@/lib/activity/diary-extract-records';
import { resolveDiaryCandidateOccurredAt } from '@/lib/activity/diary-candidate-time';
import { normalizeExtractCandidate } from '@/lib/activity/diary-time-normalize';
import type { CreateRecordPayload, Item, Record as TetoRecord, Tag } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';

interface BuildFromCandidateParams {
  candidate: DiaryExtractCandidate;
  anchorDate: string;
  items: Item[];
  tags: Tag[];
  userRules?: UserRule[];
  dayRecords?: TetoRecord[];
  createdInBatch?: TetoRecord[];
  subItems?: DiaryRecordBuildParams['subItems'];
  selectedAttribution?: DiaryRecordBuildParams['selectedAttribution'];
}

function mergeCandidateHints(
  base: CreateRecordPayload,
  candidate: DiaryExtractCandidate,
  resolved: ReturnType<typeof resolveDiaryCandidateOccurredAt>,
  anchorDate: string
): CreateRecordPayload {
  const {
    action_text: _actionText,
    event_text: _eventText,
    object_text: _objectText,
    ...baseWithoutSemanticAction
  } = base;

  return {
    ...baseWithoutSemanticAction,
    raw_input: candidate.raw_input,
    occurred_at: resolved.occurred_at,
    date: anchorDate,
    ...(resolved.time_anchor_date ? { time_anchor_date: resolved.time_anchor_date } : {}),
    ...(candidate.time_text ? { time_text: candidate.time_text } : {}),
    ...(candidate.time_precision ? { time_precision: candidate.time_precision } : {}),
    ...(candidate.location ? { location: candidate.location } : {}),
  };
}

export function buildRecordPayloadFromCandidate(params: BuildFromCandidateParams): CreateRecordPayload {
  const candidate = normalizeExtractCandidate(params.candidate);
  const resolved = resolveDiaryCandidateOccurredAt({
    candidate,
    anchorDate: params.anchorDate,
    dayRecords: params.dayRecords,
    createdInBatch: params.createdInBatch,
  });

  const fallback = mergeCandidateHints(
    buildDiaryRecordPayload({
      text: candidate.raw_input,
      anchorDate: params.anchorDate,
      items: params.items,
      tags: params.tags,
      userRules: params.userRules,
      subItems: params.subItems,
      selectedAttribution: params.selectedAttribution,
    }),
    candidate,
    resolved,
    params.anchorDate
  );

  return {
    ...fallback,
    type: '发生',
    input_source: 'ai',
    review_status: fallback.review_status ?? 'unchecked',
  };
}

export async function buildRecordPayloadFromCandidateWithParse(
  params: BuildFromCandidateParams & { items: Item[] }
): Promise<CreateRecordPayload> {
  const candidate = normalizeExtractCandidate(params.candidate);
  const fallback = buildRecordPayloadFromCandidate({ ...params, candidate });

  try {
    const parseInput = [candidate.time_text, candidate.raw_input].filter(Boolean).join(' ');
    const parseRes = await fetch('/api/v2/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: parseInput,
        date: params.anchorDate,
        items: params.items.map((item) => ({ id: item.id, title: item.title })),
      }),
    });

    if (!parseRes.ok) return fallback;

    const json = await parseRes.json();
    const unit = json?.data?.parsed?.units?.[0] as Record<string, unknown> | undefined;
    const typeHint = json?.data?.type_hints?.[0] as string | undefined;
    if (!unit || typeHint !== '发生') return fallback;

    const update = buildUnitUpdate(unit, typeHint);
    const {
      action_text: _actionText,
      event_text: _eventText,
      object_text: _objectText,
      ...parseFields
    } = update;

    const updateTimePrecision =
      typeof parseFields.time_precision === 'string' ? parseFields.time_precision : undefined;

    return {
      ...fallback,
      ...parseFields,
      raw_input: candidate.raw_input,
      date: params.anchorDate,
      time_text: candidate.time_text ?? (typeof parseFields.time_text === 'string' ? parseFields.time_text : undefined),
      time_precision:
        candidate.time_precision ??
        (updateTimePrecision as CreateRecordPayload['time_precision']),
      location: candidate.location ?? (typeof parseFields.location === 'string' ? parseFields.location : undefined),
      parsed_semantic: unit as unknown as CreateRecordPayload['parsed_semantic'],
      input_source: 'ai',
    };
  } catch {
    return fallback;
  }
}
