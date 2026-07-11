import type {
  BlockTimelineSegment,
  BlockTimelineSegmentMeta,
} from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import type { ActivityContextValue } from '@/lib/activity/activity-context-types';
import { resolveActivityContextFromRecord } from '@/lib/activity/item-tree';
import type { Record as TetoRecord, Item, Tag } from '@/types/teto';

function functionTagIdFromRecord(activity: TetoRecord): string | null {
  return activity.tags?.find((t) => t.type === 'function')?.id ?? null;
}

/** 块时间：activity 可能只有大类，当前段 meta 才是完整归属 */
export function resolveBlockAttributionItemIds(
  activity: TetoRecord,
  lockedCategoryItemId: string | null | undefined,
  segmentMeta: BlockTimelineSegmentMeta | null | undefined
): { item_id: string | null; sub_item_id: string | null } {
  const actItem = activity.item_id ?? null;
  const actSub = activity.sub_item_id ?? null;
  const segItem = segmentMeta?.item_id ?? null;
  const segSub = segmentMeta?.sub_item_id ?? null;

  /** 块时间开放段 meta 为归属真源，禁止 activity 上陈旧 sub_item_id 泄漏到 UI */
  if (segmentMeta && segItem) {
    return { item_id: segItem, sub_item_id: segSub ?? null };
  }

  if (!segItem) {
    return { item_id: actItem, sub_item_id: actSub };
  }

  const actIsLockedCategoryOnly =
    Boolean(lockedCategoryItemId) && actItem === lockedCategoryItemId && segItem !== lockedCategoryItemId;

  if (actIsLockedCategoryOnly || !actItem) {
    return { item_id: segItem, sub_item_id: segSub ?? null };
  }

  if (segItem !== actItem || (segSub ?? '') !== (actSub ?? '')) {
    return { item_id: segItem, sub_item_id: segSub ?? null };
  }

  return { item_id: actItem, sub_item_id: actSub };
}

/** 块时间停止/落库：按段 meta 解析 item/sub，禁止跨事项继承 activity.sub_item_id */
export function resolveSegmentAttributionForPersist(
  activity: TetoRecord,
  seg: BlockTimelineSegment,
  lockedCategoryItemId: string | null | undefined
): { item_id: string | null; sub_item_id: string | null } {
  return resolveBlockAttributionItemIds(activity, lockedCategoryItemId, {
    item_id: seg.item_id,
    sub_item_id: seg.sub_item_id,
    action_text: seg.action_text,
    tag_ids: seg.tag_ids,
  });
}

export function resolveOpenBlockSegmentMeta(
  segments: BlockTimelineSegment[]
): BlockTimelineSegmentMeta | null {
  const last = [...segments].reverse().find((s) => !s.isGap);
  if (!last) return null;
  return {
    item_id: last.item_id,
    sub_item_id: last.sub_item_id,
    action_text: last.action_text,
    tag_ids: last.tag_ids,
  };
}

/** PATCH 前合并段 meta，避免 activity 只有大类时动作切换把事项归属冲掉 */
export function resolveBlockPatchBaseline(
  activity: TetoRecord,
  lockedCategoryItemId: string | null | undefined,
  segments: BlockTimelineSegment[]
): TetoRecord {
  const segMeta = resolveOpenBlockSegmentMeta(segments);
  const { item_id, sub_item_id } = resolveBlockAttributionItemIds(
    activity,
    lockedCategoryItemId,
    segMeta
  );
  /** 开放段 meta 存在时 sub_item_id 以段为准（含 null），禁止回退到 activity 陈旧子项 */
  const segmentIsAttributionSource = Boolean(segMeta?.item_id);
  return {
    ...activity,
    item_id: item_id ?? activity.item_id,
    sub_item_id: segmentIsAttributionSource
      ? (sub_item_id ?? null)
      : (sub_item_id ?? activity.sub_item_id ?? null),
  };
}

/** 撤销快照：合并当前段 meta，避免只存 DB 上的大类 item_id */
export function buildBlockUndoSnapshotActivity(
  baseline: TetoRecord,
  segments: BlockTimelineSegment[],
  allTags: Tag[]
): TetoRecord {
  const openMeta = resolveOpenBlockSegmentMeta(segments);
  if (!openMeta) return baseline;

  const fnFromMeta =
    openMeta.tag_ids?.length
      ? allTags.filter((t) => openMeta.tag_ids!.includes(t.id) && t.type === 'function')
      : [];
  const nonFn = (baseline.tags ?? []).filter((t) => t.type !== 'function');
  const mergedTags = fnFromMeta.length > 0 ? [...nonFn, ...fnFromMeta] : nonFn;

  return {
    ...baseline,
    item_id: openMeta.item_id ?? baseline.item_id,
    sub_item_id: openMeta.sub_item_id ?? baseline.sub_item_id ?? null,
    action_text: openMeta.action_text ?? baseline.action_text ?? null,
    tags: mergedTags,
  };
}

export function resolveBlockActionTagId(
  activity: TetoRecord,
  segmentMeta: BlockTimelineSegmentMeta | null | undefined
): string | null {
  if (segmentMeta) {
    if (segmentMeta.tag_ids?.length) return segmentMeta.tag_ids[0];
    return null;
  }
  return functionTagIdFromRecord(activity);
}

export function resolveBlockDisplayContext(
  items: Item[],
  activity: TetoRecord,
  lockedCategoryItemId: string | null | undefined,
  pendingItem: { item_id: string; sub_item_id: string | null } | null,
  segmentMeta: BlockTimelineSegmentMeta | null | undefined
): ActivityContextValue {
  const lockedCat = lockedCategoryItemId
    ? items.find((i) => i.id === lockedCategoryItemId)
    : undefined;

  const emptyUnderLocked = (): ActivityContextValue => ({
    categoryItemId: lockedCategoryItemId ?? '',
    categoryTitle: lockedCat?.title,
    itemId: '',
    subItemId: '',
  });

  if (pendingItem) {
    const pendingCtx = resolveActivityContextFromRecord(
      items,
      pendingItem.item_id,
      pendingItem.sub_item_id ?? undefined
    ) as ActivityContextValue;
    if (
      lockedCategoryItemId &&
      pendingCtx.categoryItemId &&
      pendingCtx.categoryItemId !== lockedCategoryItemId
    ) {
      return emptyUnderLocked();
    }
    return pendingCtx;
  }

  const { item_id, sub_item_id } = resolveBlockAttributionItemIds(
    activity,
    lockedCategoryItemId,
    segmentMeta
  );

  const contextValue = resolveActivityContextFromRecord(
    items,
    item_id,
    sub_item_id
  ) as ActivityContextValue;

  if (lockedCategoryItemId && contextValue.categoryItemId !== lockedCategoryItemId) {
    return emptyUnderLocked();
  }

  return contextValue;
}

function resolveFunctionTagForDisplay(
  activity: TetoRecord,
  tags: Tag[],
  segmentMeta: BlockTimelineSegmentMeta | null | undefined
): Tag | undefined {
  const id = resolveBlockActionTagId(activity, segmentMeta);
  if (!id) return undefined;
  return (
    activity.tags?.find((t) => t.id === id && t.type === 'function') ??
    tags.find((t) => t.id === id && t.type === 'function')
  );
}

/** 块时间 UI 展示用：合并当前段 meta，避免只读到 DB 上的大类归属 */
export function buildBlockDisplayRecord(
  activity: TetoRecord,
  tags: Tag[],
  lockedCategoryItemId: string | null | undefined,
  segmentMeta: BlockTimelineSegmentMeta | null | undefined
): TetoRecord {
  if (!lockedCategoryItemId || !segmentMeta) {
    return activity;
  }

  const { item_id, sub_item_id } = resolveBlockAttributionItemIds(
    activity,
    lockedCategoryItemId,
    segmentMeta
  );

  const actionTag = resolveFunctionTagForDisplay(activity, tags, segmentMeta);
  const segmentAction = segmentMeta.action_text?.trim();
  const mergedAction = segmentMeta
    ? segmentAction || actionTag?.name?.trim() || null
    : segmentAction || activity.action_text?.trim() || actionTag?.name?.trim();

  const nonFunctionTags = (activity.tags ?? []).filter((t) => t.type !== 'function');
  const mergedTags = actionTag ? [...nonFunctionTags, actionTag] : nonFunctionTags;

  return {
    ...activity,
    item_id,
    sub_item_id,
    tags: mergedTags,
    action_text: mergedAction ?? null,
    content: mergedAction ?? '',
  };
}

type BlockAttributionFields = Pick<
  TetoRecord,
  'item_id' | 'sub_item_id' | 'tags' | 'action_text' | 'content'
>;

function serverAttributionIsCategoryOnly(
  record: TetoRecord,
  lockedCategoryItemId: string
): boolean {
  const hasChildItem = Boolean(record.item_id && record.item_id !== lockedCategoryItemId);
  const hasSubItem = Boolean(record.sub_item_id);
  const hasFunctionTag = Boolean(record.tags?.some((t) => t.type === 'function'));
  const hasActionText = Boolean(record.action_text?.trim());
  return !hasChildItem && !hasSubItem && !hasFunctionTag && !hasActionText;
}

/** 块时间 PATCH 回包可能只有大类：保留客户端已知的更细归属 */
export function mergeBlockAttributionFromServer(
  prev: TetoRecord,
  updated: TetoRecord,
  lockedCategoryItemId: string | null | undefined
): BlockAttributionFields {
  if (!lockedCategoryItemId) {
    return {
      item_id: updated.item_id ?? prev.item_id,
      sub_item_id: updated.sub_item_id ?? prev.sub_item_id,
      tags: updated.tags?.length ? updated.tags : prev.tags,
      action_text: updated.action_text !== undefined ? updated.action_text : prev.action_text,
      content: updated.content ?? prev.content,
    };
  }

  const updatedIsCategoryOnly = serverAttributionIsCategoryOnly(updated, lockedCategoryItemId);
  const prevHasSpecificItem =
    Boolean(prev.item_id && prev.item_id !== lockedCategoryItemId) ||
    Boolean(prev.sub_item_id);
  const prevHasAction =
    Boolean(prev.tags?.some((t) => t.type === 'function')) || Boolean(prev.action_text?.trim());

  if (updatedIsCategoryOnly && (prevHasSpecificItem || prevHasAction)) {
    return {
      item_id: prev.item_id ?? updated.item_id,
      sub_item_id: prev.sub_item_id ?? updated.sub_item_id,
      tags: prev.tags?.length ? prev.tags : updated.tags,
      action_text: prev.action_text !== undefined ? prev.action_text : updated.action_text,
      content: prev.content ?? updated.content,
    };
  }

  return {
    item_id: updated.item_id ?? prev.item_id,
    sub_item_id: updated.sub_item_id !== undefined ? updated.sub_item_id : prev.sub_item_id,
    tags: updated.tags?.length ? updated.tags : prev.tags,
    action_text: updated.action_text !== undefined ? updated.action_text : prev.action_text,
    content: updated.content ?? prev.content,
  };
}
