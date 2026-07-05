import type { ActivityContextValue } from '@/app/(dashboard)/records/components/ActivityContextPicker';
import { resolveActivityContextFromRecord, resolveTargetItemId } from '@/lib/activity/item-tree';
import { resolveRecordAnchorDate, dateAndTimeToIso, isoToTimeHHMM } from '@/lib/activity/record-time';
import type { ParsedSemantic } from '@/types/semantic';
import type { Item, Record as TetoRecord, RecordType, UpdateRecordPayload, UserRecordType } from '@/types/teto';
import { USER_RECORD_TYPES } from '@/types/teto';
import { generateContentSummary } from '@/lib/utils/generate-content-summary';
import {
  mergeToolLabelForSave,
  recordHasFinance,
  splitToolLabelForForm,
} from '@/lib/activity/finance-account';

export interface RecordEditFormState {
  content: string;
  type: RecordType;
  tagIds: string[];
  activityContext: ActivityContextValue;
  recordDate: string;
  occurredAt: string;
  occurredAtEnd: string;
  mood: string;
  energy: string;
  status: string;
  note: string;
  location: string;
  peopleStr: string;
  cost: string;
  metricName: string;
  metricValue: string;
  metricUnit: string;
  durationMinutes: string;
  actionText: string;
  eventText: string;
  objectText: string;
  outcomeType: string;
  outcomeDirection: string;
  causeText: string;
  timeText: string;
  timePrecision: string;
  placeType: string;
  moneyDirection: string;
  relationRolesStr: string;
  bodyState: string;
  moneyCurrency: string;
  relatedObjectsStr: string;
  resultText: string;
  toolLabel: string;
  /** 收支账户（v1 落库 tool_label；与属性·工具分离展示） */
  financeAccount: string;
  rawInput: string;
  goalId: string;
}

export const AI_INFERRED_CORRECTION_FIELDS = [
  'item_id',
  'sub_item_id',
  'phase_id',
  'type',
  'mood',
  'energy',
  'status',
  'location',
  'cost',
  'duration_minutes',
  'metric_value',
  'metric_unit',
  'metric_name',
  'outcome_type',
  'outcome_direction',
  'place_type',
  'money_direction',
  'action_text',
  'event_text',
  'object_text',
  'cause_text',
  'time_text',
  'body_state',
  'tool_label',
] as const;

function splitList(str: string): string[] | null {
  const parts = str
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export function isLegacyRecordType(type: string): boolean {
  return !(USER_RECORD_TYPES as readonly string[]).includes(type);
}

export function recordToFormState(record: TetoRecord, items: Item[]): RecordEditFormState {
  const anchorDate = resolveRecordAnchorDate(record);
  const hasFinance = recordHasFinance(record.cost, record.money_direction);
  const { financeAccount, toolLabel } = splitToolLabelForForm(record.tool_label, hasFinance);
  const moodTag = record.tags?.find((t) => t.type === 'mood');
  const moodFromTag = moodTag?.name ?? '';
  return {
    content: record.content ?? '',
    type: record.type,
    tagIds: record.tags?.map((t) => t.id) ?? [],
    activityContext: {
      ...resolveActivityContextFromRecord(items, record.item_id, record.sub_item_id, {
        itemTitle: record.item?.title ?? undefined,
      }),
      phaseId: record.phase_id || '',
    },
    recordDate: anchorDate,
    occurredAt: isoToTimeHHMM(record.occurred_at),
    occurredAtEnd: isoToTimeHHMM(record.occurred_at_end),
    mood: record.mood || moodFromTag || '',
    energy: record.energy || '',
    status: record.status || '',
    note: record.note || '',
    location: record.location || '',
    peopleStr: (record.people || []).join(', '),
    cost: record.cost != null ? String(record.cost) : '',
    metricName: record.metric_name || '',
    metricValue: record.metric_value != null ? String(record.metric_value) : '',
    metricUnit: record.metric_unit || '',
    durationMinutes: record.duration_minutes != null ? String(record.duration_minutes) : '',
    actionText: record.action_text || '',
    eventText: record.event_text || '',
    objectText: record.object_text || '',
    outcomeType: record.outcome_type || '',
    outcomeDirection: record.outcome_direction || '',
    causeText: record.cause_text || '',
    timeText: record.time_text || '',
    timePrecision: record.time_precision || '',
    placeType: record.place_type || '',
    moneyDirection: record.money_direction || '',
    relationRolesStr: (record.relation_roles || []).join(', '),
    bodyState: record.body_state || '',
    moneyCurrency: record.money_currency || 'CNY',
    relatedObjectsStr: (record.related_objects || []).join(', '),
    resultText: record.result || '',
    toolLabel,
    financeAccount,
    rawInput: record.raw_input || '',
    goalId: record.goal_id || '',
  };
}

export function formStateToUpdatePayload(
  form: RecordEditFormState,
  record: TetoRecord
): UpdateRecordPayload {
  const payload: UpdateRecordPayload = {
    content: form.content,
    type: form.type,
    tag_ids: form.tagIds,
    mood: form.mood || undefined,
    energy: form.energy || undefined,
    status: form.status || undefined,
    note: form.note || undefined,
    location: form.location.trim() || null,
    people: splitList(form.peopleStr),
    cost: form.cost ? parseFloat(form.cost) : null,
    metric_value: form.metricValue ? parseFloat(form.metricValue) : null,
    metric_unit: form.metricUnit.trim() || null,
    metric_name: form.metricName.trim() || null,
    duration_minutes: form.durationMinutes ? parseInt(form.durationMinutes, 10) : null,
    action_text: form.actionText.trim() || undefined,
    event_text: form.eventText.trim() || undefined,
    object_text: form.objectText.trim() || undefined,
    outcome_type: form.outcomeType || undefined,
    outcome_direction: (form.outcomeDirection || undefined) as
      | 'positive'
      | 'neutral'
      | 'negative'
      | undefined,
    cause_text: form.causeText.trim() || undefined,
    time_text: form.timeText.trim() || undefined,
    time_precision: (form.timePrecision || undefined) as
      | 'exact'
      | 'approx'
      | 'fuzzy'
      | 'unknown'
      | undefined,
    place_type: form.placeType || undefined,
    money_direction: (form.moneyDirection || undefined) as 'expense' | 'income' | 'none' | undefined,
    relation_roles: splitList(form.relationRolesStr) ?? undefined,
    body_state: form.bodyState.trim() || undefined,
    money_currency: form.moneyCurrency || undefined,
    result: form.resultText.trim() || undefined,
    item_id: resolveTargetItemId(form.activityContext) || null,
    sub_item_id: form.activityContext.subItemId || null,
    phase_id: form.activityContext.phaseId || null,
    tool_label: mergeToolLabelForSave(
      form.financeAccount,
      form.toolLabel,
      recordHasFinance(
        form.cost ? parseFloat(form.cost) : null,
        form.moneyDirection || null
      )
    ),
    goal_id: form.goalId.trim() || null,
    related_objects: splitList(form.relatedObjectsStr) ?? null,
    occurred_at: form.occurredAt
      ? dateAndTimeToIso(form.recordDate, form.occurredAt)
      : null,
    occurred_at_end: form.occurredAtEnd
      ? dateAndTimeToIso(form.recordDate, form.occurredAtEnd)
      : null,
  };

  const anchorDate = form.recordDate.trim();
  if (anchorDate && anchorDate !== resolveRecordAnchorDate(record)) {
    payload.time_anchor_date = anchorDate;
  }

  if (form.rawInput && form.rawInput !== (record.raw_input || '')) {
    payload.raw_input = form.rawInput;
  }

  const ps = record.parsed_semantic as { needs_clarification?: boolean } | null;
  if (ps?.needs_clarification) {
    payload.parsed_semantic = { ...ps, needs_clarification: false } as unknown as typeof record.parsed_semantic;
  }

  return payload;
}

export function buildCorrectionPayload(
  original: TetoRecord,
  payload: UpdateRecordPayload
): Array<{ field: string; newValue: unknown }> {
  const diffs: Array<{ field: string; newValue: unknown }> = [];
  const orig = original as unknown as Record<string, unknown>;
  const updated = payload as unknown as Record<string, unknown>;

  for (const field of AI_INFERRED_CORRECTION_FIELDS) {
    const oldVal = orig[field];
    const newVal = updated[field];
    if (oldVal == null && newVal == null) continue;
    if (String(oldVal ?? '') === String(newVal ?? '')) continue;
    diffs.push({ field, newValue: newVal ?? null });
  }
  return diffs;
}

export function applyParsedUnitToFormState(
  prev: RecordEditFormState,
  unit: ParsedSemantic,
  rawInput: string,
  typeHint?: string,
  items: Item[] = []
): RecordEditFormState {
  const next: RecordEditFormState = {
    ...prev,
    content: generateContentSummary(unit, rawInput) || rawInput.trim(),
    mood: unit.mood ?? '',
    energy: unit.energy ?? '',
    location: unit.location ?? '',
    peopleStr: unit.people?.length ? unit.people.join(', ') : '',
    cost: unit.cost != null && unit.cost > 0 ? String(unit.cost) : '',
    durationMinutes:
      unit.duration_minutes != null && unit.duration_minutes > 0
        ? String(unit.duration_minutes)
        : '',
    metricName: unit.metric?.name ?? '',
    metricValue: unit.metric?.value != null ? String(unit.metric.value) : '',
    metricUnit: unit.metric?.unit ?? '',
    actionText: unit.action_text ?? '',
    eventText: unit.event_text ?? '',
    objectText: unit.object_text ?? '',
    outcomeType: unit.outcome_type ?? '',
    outcomeDirection: unit.outcome_direction ?? '',
    causeText: unit.cause_text ?? '',
    timeText: unit.time_text ?? '',
    timePrecision: unit.time_precision ?? '',
    placeType: unit.place_type ?? '',
    moneyDirection: unit.money_direction ?? '',
    relationRolesStr: unit.relation_roles?.length ? unit.relation_roles.join(', ') : '',
    bodyState: unit.body_state ?? '',
    resultText: unit.result_text ?? prev.resultText,
  };

  if (typeHint && (USER_RECORD_TYPES as readonly string[]).includes(typeHint)) {
    next.type = typeHint as UserRecordType;
  }

  if (unit.item_hint) {
    const hint = unit.item_hint.toLowerCase();
    const matched =
      items.find((i) => i.title.toLowerCase() === hint) ||
      items.find((i) => i.title.toLowerCase() === hint.replace(/\s+/g, ''));
    if (matched) {
      next.activityContext = resolveActivityContextFromRecord(items, matched.id);
    }
  }

  if (!unit.metric) {
    next.metricName = '';
    next.metricValue = '';
    next.metricUnit = '';
  }

  return next;
}
