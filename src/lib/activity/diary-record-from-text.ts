import type { UserRule } from '@/lib/db/user-rules';
import { dateAndTimeToIso } from '@/lib/activity/record-time';
import { parseQuickCreateHints } from '@/lib/activity/quick-create-parser';
import {
  buildQuickCreateAttributionOptions,
  pickDefaultAttributionOptionId,
  type QuickCreateAttributionOption,
} from '@/lib/activity/quick-create-preview';
import { matchPresetsByText } from '@/lib/utils/item-match';
import { inferTimeFromText, inferTimeRangeFromText } from '@/lib/utils/record-unit-mapper';
import type { CreateRecordPayload, Item, SubItem, Tag } from '@/types/teto';

export interface DiaryRecordBuildParams {
  text: string;
  anchorDate: string;
  items: Item[];
  tags: Tag[];
  userRules?: UserRule[];
  subItems?: SubItem[];
  selectedAttribution?: QuickCreateAttributionOption | null;
}

export interface DiaryRecordPreview {
  timeLabel?: string;
  itemLabel?: string;
  actionLabel?: string;
  costLabel?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatClock(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function resolveDiaryRecordOccurredAt(anchorDate: string, text: string): string {
  const range = inferTimeRangeFromText(text);
  if (range) {
    return dateAndTimeToIso(anchorDate, formatClock(range.start.hour, range.start.minute));
  }
  const point = inferTimeFromText(text);
  if (point) {
    return dateAndTimeToIso(anchorDate, formatClock(point.hour, point.minute));
  }
  const now = new Date();
  return dateAndTimeToIso(anchorDate, `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
}

function resolveAttribution(
  text: string,
  items: Item[],
  tags: Tag[],
  userRules: UserRule[],
  subItems: SubItem[],
  selectedAttribution?: QuickCreateAttributionOption | null
): {
  itemId?: string;
  subItemId?: string | null;
  tagIds?: string[];
  actionText?: string;
  reviewStatus: 'unchecked' | 'confirmed';
} {
  const options = buildQuickCreateAttributionOptions(text, items, userRules, tags, { subItems });
  const defaultId = pickDefaultAttributionOptionId(options);
  const picked =
    selectedAttribution ??
    options.find((option) => option.id === defaultId) ??
    options[0] ??
    null;

  const presets = matchPresetsByText(text, userRules);

  let itemId: string | undefined;
  let subItemId: string | null = null;

  if (picked?.isNoAssign) {
    itemId = undefined;
  } else if (picked?.id?.startsWith('l1:')) {
    itemId = picked.itemId ?? undefined;
  } else if (picked?.itemId !== undefined && picked.itemId !== null) {
    itemId = picked.itemId;
    subItemId = picked.subItemId ?? null;
  } else {
    itemId = presets.itemId ?? undefined;
  }

  const tagIds =
    picked?.functionTagId
      ? [picked.functionTagId]
      : presets.functionTagId
        ? [presets.functionTagId]
        : undefined;

  const actionText =
    tagIds?.length === 1
      ? tags.find((tag) => tag.id === tagIds[0] && tag.type === 'function')?.name.trim() || undefined
      : undefined;

  const reviewStatus =
    picked?.isNoAssign || picked?.id === 'unassigned' || !itemId ? 'unchecked' : 'confirmed';

  return { itemId, subItemId, tagIds, actionText, reviewStatus };
}

export function buildDiaryRecordPreview(params: DiaryRecordBuildParams): DiaryRecordPreview {
  const trimmed = params.text.trim();
  if (!trimmed) return {};

  const occurredAt = resolveDiaryRecordOccurredAt(params.anchorDate, trimmed);
  const occurred = new Date(occurredAt);
  const timeLabel = Number.isNaN(occurred.getTime())
    ? undefined
    : `${pad2(occurred.getHours())}:${pad2(occurred.getMinutes())}`;

  const attribution = resolveAttribution(
    trimmed,
    params.items,
    params.tags,
    params.userRules ?? [],
    params.subItems ?? [],
    params.selectedAttribution
  );

  const hints = parseQuickCreateHints(trimmed);
  const options = buildQuickCreateAttributionOptions(
    trimmed,
    params.items,
    params.userRules ?? [],
    params.tags,
    { subItems: params.subItems ?? [] }
  );
  const defaultId = pickDefaultAttributionOptionId(options);
  const picked =
    params.selectedAttribution ??
    options.find((option) => option.id === defaultId) ??
    options[0];

  return {
    timeLabel,
    itemLabel: picked?.label,
    actionLabel: attribution.actionText,
    costLabel:
      hints.cost != null && hints.cost > 0
        ? `${hints.moneyDirection === 'income' ? '+' : '-'}¥${hints.cost}`
        : undefined,
  };
}

export function buildDiaryRecordPayload(params: DiaryRecordBuildParams): CreateRecordPayload {
  const trimmed = params.text.trim();
  const occurredAt = resolveDiaryRecordOccurredAt(params.anchorDate, trimmed);
  const hints = parseQuickCreateHints(trimmed);
  const attribution = resolveAttribution(
    trimmed,
    params.items,
    params.tags,
    params.userRules ?? [],
    params.subItems ?? [],
    params.selectedAttribution
  );

  return {
    raw_input: trimmed,
    content: '',
    type: '发生',
    date: params.anchorDate,
    occurred_at: occurredAt,
    lifecycle_status: 'completed',
    input_source: 'manual',
    review_status: attribution.reviewStatus,
    ...(attribution.itemId ? { item_id: attribution.itemId } : {}),
    ...(attribution.subItemId ? { sub_item_id: attribution.subItemId } : {}),
    ...(attribution.tagIds ? { tag_ids: attribution.tagIds } : {}),
    ...(attribution.actionText ? { action_text: attribution.actionText } : {}),
    ...(hints.cost != null && hints.cost > 0
      ? {
          cost: hints.cost,
          money_direction: hints.moneyDirection ?? 'expense',
        }
      : {}),
    ...(hints.durationMinutes != null && hints.durationMinutes > 0
      ? { duration_minutes: hints.durationMinutes }
      : {}),
    ...(hints.bodyState ? { body_state: hints.bodyState } : {}),
    ...(hints.timePrecision ? { time_precision: hints.timePrecision } : {}),
  };
}
