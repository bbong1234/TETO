'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item, Record as TetoRecord } from '@/types/teto';
import { buildTimelineTagPath } from '@/lib/activity/item-tree';
import { isOptimisticRecordId, isActiveTimingRecord } from '@/lib/activity/records-mutation';
import { UNASSIGNED_ACTIVE_PLACEHOLDER } from '@/lib/activity/recent-context';
import { STATS_GAP_LABEL } from '@/lib/activity/stats-utils';
import type {
  BlockTimelineSegment,
  BlockTimelineSegmentMeta,
} from '@/app/(dashboard)/records/components/BlockSessionTimeline';

export type { BlockTimelineSegment, BlockTimelineSegmentMeta };

interface StoredBlockSegments {
  activityId: string;
  segments: BlockTimelineSegment[];
}

export function segmentMetaFromActivity(
  activity: Pick<TetoRecord, 'item_id' | 'sub_item_id' | 'action_text' | 'tags'>
): BlockTimelineSegmentMeta {
  const fnTagIds =
    activity.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? [];
  return {
    item_id: activity.item_id,
    sub_item_id: activity.sub_item_id,
    action_text: activity.action_text,
    tag_ids: fnTagIds.length > 0 ? fnTagIds : undefined,
  };
}

export function buildBlockSegmentLabel(
  items: Item[],
  activity: Pick<
    TetoRecord,
    | 'item_id'
    | 'sub_item_id'
    | 'content'
    | 'action_text'
    | 'category'
    | 'subcategory'
    | 'item'
    | 'tags'
  >,
  actionLabel?: string,
  subItemTitles?: ReadonlyMap<string, string>
): string {
  const tagPath = buildTimelineTagPath(activity, items, { subItemTitles });
  const action = actionLabel?.trim() || activity.action_text?.trim();
  if (tagPath && action) return `${tagPath} · ${action}`;
  if (tagPath) return tagPath;
  if (action) return action;
  const content = activity.content?.trim();
  return content || UNASSIGNED_ACTIVE_PLACEHOLDER;
}

export function resolveBlockSegmentSubItemTitles(
  subItemId: string | null | undefined,
  opts?: {
    subItemTitle?: string | null;
    subItemTitles?: ReadonlyMap<string, string>;
  }
): ReadonlyMap<string, string> | undefined {
  if (!subItemId) return undefined;
  const title = opts?.subItemTitle?.trim() || opts?.subItemTitles?.get(subItemId);
  if (!title) return undefined;
  return new Map([[subItemId, title]]);
}

export function mergeBlockSegmentSubItemTitles(
  subItemId: string | null | undefined,
  subItemTitle?: string | null,
  subItemTitles?: ReadonlyMap<string, string>
): ReadonlyMap<string, string> | undefined {
  const merged = new Map(subItemTitles ?? []);
  if (subItemId && subItemTitle?.trim()) {
    merged.set(subItemId, subItemTitle.trim());
  }
  return merged.size > 0 ? merged : undefined;
}

/** 从已有段 label 解析三级 SubItem 标题（动作 PATCH 时 subItemTitles 可能尚未入库） */
export function subItemTitleFromSegmentLabel(
  segments: BlockTimelineSegment[],
  subItemId: string
): string | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.isGap) continue;
    if (seg.sub_item_id !== subItemId) continue;
    const pathPart = seg.label.split(' · ')[0]?.trim();
    if (!pathPart) continue;
    const parts = pathPart.split('-');
    if (parts.length >= 3) return parts[parts.length - 1]?.trim() || undefined;
  }
  return undefined;
}

/** 块时间会话内合并 SubItem 标题：PATCH、今日记录、会话缓存、已有段 label */
export function resolveBlockSessionSubItemTitles(
  subItemId: string | null | undefined,
  opts: {
    patchSubItemTitle?: string | null;
    recordSubItemTitles?: ReadonlyMap<string, string>;
    sessionSubItemTitles?: ReadonlyMap<string, string>;
    blockSegments?: BlockTimelineSegment[];
  }
): ReadonlyMap<string, string> | undefined {
  if (!subItemId) return undefined;
  const merged = new Map<string, string>([
    ...(opts.recordSubItemTitles ?? []),
    ...(opts.sessionSubItemTitles ?? []),
  ]);
  const fromPatch = opts.patchSubItemTitle?.trim();
  if (fromPatch) merged.set(subItemId, fromPatch);
  if (!merged.has(subItemId) && opts.blockSegments?.length) {
    const fromLabel = subItemTitleFromSegmentLabel(opts.blockSegments, subItemId);
    if (fromLabel) merged.set(subItemId, fromLabel);
  }
  return merged.size > 0 ? merged : undefined;
}

/** 块时间 PATCH 段标题：事项路径 + 可选动作 */
export function buildBlockAttributionSegmentLabel(
  items: Item[],
  activity: Pick<
    TetoRecord,
    | 'item_id'
    | 'sub_item_id'
    | 'content'
    | 'action_text'
    | 'category'
    | 'subcategory'
    | 'item'
    | 'tags'
  >,
  patch: {
    item_id?: string | null;
    sub_item_id?: string | null;
    sub_item_title?: string | null;
    tag_ids?: string[];
    attributionChanged?: boolean;
  },
  subItemTitles?: ReadonlyMap<string, string>
): string {
  const subItemTitlesForLabel = mergeBlockSegmentSubItemTitles(
    activity.sub_item_id,
    patch.sub_item_title,
    subItemTitles
  );
  if (patch.attributionChanged && patch.tag_ids === undefined) {
    return buildBlockItemSwitchSegmentLabel(
      items,
      activity.item_id ?? '',
      activity.sub_item_id ?? null,
      patch.sub_item_title,
      subItemTitlesForLabel
    );
  }
  return buildBlockSegmentLabel(
    items,
    activity,
    activity.action_text ?? undefined,
    subItemTitlesForLabel
  );
}

/** 块时间事项切换段标题：清空动作，SubItem 需传入标题 */
export function buildBlockItemSwitchSegmentLabel(
  items: Item[],
  item_id: string,
  sub_item_id: string | null,
  subItemTitle?: string | null,
  subItemTitles?: ReadonlyMap<string, string>
): string {
  return buildBlockSegmentLabel(
    items,
    {
      item_id,
      sub_item_id,
      content: '',
      action_text: null,
      tags: [],
    },
    undefined,
    mergeBlockSegmentSubItemTitles(sub_item_id, subItemTitle, subItemTitles)
  );
}

export const BLOCK_SEGMENTS_CHANGED_EVENT = 'teto:block-segments-changed';

function emitBlockSegmentsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BLOCK_SEGMENTS_CHANGED_EVENT));
}

export function storedBlockSegmentsMatchActivity(
  stored: StoredBlockSegments,
  activityId: string | null,
  currentActivity?: TetoRecord | null
): boolean {
  if (!activityId) return false;
  if (stored.activityId === activityId) return true;
  if (currentActivity?.id && stored.activityId === currentActivity.id) return true;
  if (isOptimisticRecordId(stored.activityId) && isActiveTimingRecord(currentActivity)) {
    return true;
  }
  return false;
}

/** 5 秒外切换：关闭上一段并追加新段 */
export function mutateAppendBlockSegment(
  prev: BlockTimelineSegment[],
  label: string,
  startMs: number,
  meta?: BlockTimelineSegmentMeta
): BlockTimelineSegment[] {
  const updated =
    prev.length > 0
      ? prev.map((s, i) =>
          i === prev.length - 1 && s.endMs == null ? { ...s, endMs: startMs } : s
        )
      : prev;
  return [...updated, { label, startMs, endMs: null, ...meta }];
}

/** 5 秒窗口内：只更新最后一段 label/meta，保留 startMs */
export function mutateUpdateLastBlockSegment(
  prev: BlockTimelineSegment[],
  label: string,
  meta?: BlockTimelineSegmentMeta,
  nowMs = Date.now()
): BlockTimelineSegment[] {
  if (prev.length === 0) {
    return [{ label, startMs: nowMs, endMs: null, ...meta }];
  }
  const last = prev[prev.length - 1];
  const metaUnchanged =
    !meta ||
    (last.item_id === meta.item_id &&
      (last.sub_item_id ?? null) === (meta.sub_item_id ?? null) &&
      (last.action_text ?? null) === (meta.action_text ?? null) &&
      JSON.stringify(last.tag_ids ?? []) === JSON.stringify(meta.tag_ids ?? []));
  if (last.label === label && metaUnchanged) return prev;
  return [...prev.slice(0, -1), { ...last, label, ...meta }];
}

// ── 块时间会话状态的 sessionStorage 持久化（刷新后恢复） ──

const SEGMENTS_STORAGE_KEY = 'teto_block_segments';
const LOCK_STORAGE_KEY = 'teto_block_locked_category';

function isValidSegment(s: unknown): s is BlockTimelineSegment {
  if (!s || typeof s !== 'object') return false;
  const seg = s as Partial<BlockTimelineSegment>;
  return (
    typeof seg.label === 'string' &&
    typeof seg.startMs === 'number' &&
    (seg.endMs === null || typeof seg.endMs === 'number') &&
    (seg.isGap === undefined || typeof seg.isGap === 'boolean') &&
    (seg.item_id === undefined || seg.item_id === null || typeof seg.item_id === 'string') &&
    (seg.sub_item_id === undefined || seg.sub_item_id === null || typeof seg.sub_item_id === 'string') &&
    (seg.action_text === undefined || seg.action_text === null || typeof seg.action_text === 'string') &&
    (seg.tag_ids === undefined || Array.isArray(seg.tag_ids))
  );
}

export function loadStoredBlockSegments(): StoredBlockSegments | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SEGMENTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBlockSegments;
    if (!parsed || typeof parsed.activityId !== 'string' || !Array.isArray(parsed.segments)) {
      return null;
    }
    if (!parsed.segments.every(isValidSegment)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredBlockSegments(
  activityId: string,
  segments: BlockTimelineSegment[]
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SEGMENTS_STORAGE_KEY,
      JSON.stringify({ activityId, segments } satisfies StoredBlockSegments)
    );
  } catch {
    /* ignore */
  }
}

export function clearStoredBlockSegments(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SEGMENTS_STORAGE_KEY);
    emitBlockSegmentsChanged();
  } catch {
    /* ignore */
  }
}

export function loadLockedBlockCategory(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(LOCK_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLockedBlockCategory(categoryId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(LOCK_STORAGE_KEY, categoryId);
  } catch {
    /* ignore */
  }
}

export function clearLockedBlockCategory(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(LOCK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 管理块时间内的时间段列表。
 * - sessionKey 变化时清空重置（进入新块时间会话）
 * - activity 变化时若列表为空则用当前 activity 初始化第一段（刷新时从 sessionStorage 恢复）
 * - appendBlockSegment 追加新段并关闭上一段
 */
function buildOpenActivitySegmentLabel(
  items: Item[],
  activity: TetoRecord,
  subItemTitles?: ReadonlyMap<string, string>
): string {
  const titlesForLabel = resolveBlockSessionSubItemTitles(activity.sub_item_id, {
    recordSubItemTitles: subItemTitles,
  });
  return buildBlockSegmentLabel(
    items,
    activity,
    activity.action_text ?? undefined,
    titlesForLabel
  );
}

export function useBlockSessionSegments(
  items: Item[],
  activity: TetoRecord | null | undefined,
  subItemTitles?: ReadonlyMap<string, string>
) {
  const [blockSegments, setBlockSegments] = useState<BlockTimelineSegment[]>([]);
  const blockSegmentsRef = useRef<BlockTimelineSegment[]>([]);
  const activityIdRef = useRef<string | null>(null);
  activityIdRef.current = activity?.id ?? null;

  const commitBlockSegments = useCallback((next: BlockTimelineSegment[]) => {
    blockSegmentsRef.current = next;
    const id = activityIdRef.current;
    if (id && next.length > 0) {
      saveStoredBlockSegments(id, next);
      // emit 由 blockSegments 的 useEffect 统一触发，避免在 setState updater 内同步通知外部组件
    }
  }, []);
  // 用 ref 记录已初始化的 activity id，避免重复初始化
  const initializedForRef = useRef<string | null>(null);

  // 当 activity 从 null 变为新 id 时（进入新会话），重置列表
  useEffect(() => {
    if (!activity?.id || !activity.occurred_at) return;
    if (initializedForRef.current === activity.id) return;

    initializedForRef.current = activity.id;
    const label = buildOpenActivitySegmentLabel(items, activity, subItemTitles);
    const startMs = Date.parse(activity.occurred_at);
    // 如果列表已有段且最后一段是同一个 id 开头，不重复添加
    setBlockSegments((prev) => {
      if (prev.length > 0) return prev;
      const stored = loadStoredBlockSegments();
      if (stored && stored.activityId === activity.id && stored.segments.length > 0) {
        commitBlockSegments(stored.segments);
        return stored.segments;
      }
      const next = [{ label, startMs, endMs: null, ...segmentMetaFromActivity(activity) }];
      commitBlockSegments(next);
      return next;
    });
  // items 故意不加，避免标题变更时反复重置
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, activity?.occurred_at]);

  // SubItem 标题异步加载后：仅在段 meta 与 sub_item 一致时补全 L3，不覆盖用户已选事项路径
  const subItemTitlesKey = subItemTitles
    ? [...subItemTitles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join('|')
    : '';
  useEffect(() => {
    if (!activity?.id || !subItemTitlesKey) return;
    setBlockSegments((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.isGap || last.endMs != null) return prev;

      const segSubId = last.sub_item_id ?? null;
      const actSubId = activity.sub_item_id ?? null;
      if (!segSubId && !actSubId) return prev;
      if (segSubId && actSubId && segSubId !== actSubId) return prev;
      if (last.item_id && activity.item_id && last.item_id !== activity.item_id) return prev;

      const labelSource = {
        item_id: last.item_id ?? activity.item_id,
        sub_item_id: segSubId ?? actSubId,
        content: activity.content,
        action_text: last.action_text ?? activity.action_text,
        category: activity.category,
        subcategory: activity.subcategory,
        item: activity.item,
        tags: activity.tags,
      };
      const newLabel = buildOpenActivitySegmentLabel(
        items,
        labelSource as Parameters<typeof buildOpenActivitySegmentLabel>[1],
        subItemTitles
      );
      if (last.label === newLabel) return prev;
      const next = mutateUpdateLastBlockSegment(prev, newLabel);
      if (next === prev) return prev;
      commitBlockSegments(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, subItemTitlesKey]);

  // activity 变为 null（停止）时清空
  useEffect(() => {
    if (!activity) {
      initializedForRef.current = null;
      blockSegmentsRef.current = [];
      setBlockSegments([]);
      clearStoredBlockSegments();
    }
  }, [activity]);

  // 段变化时持久化，供刷新后恢复
  useEffect(() => {
    if (!activity?.id || blockSegments.length === 0) return;
    saveStoredBlockSegments(activity.id, blockSegments);
    emitBlockSegmentsChanged();
  }, [activity?.id, blockSegments]);

  // 乐观 id → 服务端 id 时迁移 sessionStorage，避免刷新后块时间轴丢失
  useEffect(() => {
    if (!activity?.id || isOptimisticRecordId(activity.id)) return;
    const stored = loadStoredBlockSegments();
    if (stored && isOptimisticRecordId(stored.activityId)) {
      saveStoredBlockSegments(activity.id, stored.segments);
    }
  }, [activity?.id]);

  const appendBlockSegment = useCallback(
    (label: string, startMs = Date.now(), meta?: BlockTimelineSegmentMeta) => {
    setBlockSegments((prev) => {
      const next = mutateAppendBlockSegment(prev, label, startMs, meta);
      commitBlockSegments(next);
      return next;
    });
  },
    [commitBlockSegments]
  );

  const popBlockSegment = useCallback(() => {
    setBlockSegments((prev) => {
      if (prev.length <= 1) return prev;
      const trimmed = prev.slice(0, -1);
      const last = trimmed[trimmed.length - 1];
      const next = [...trimmed.slice(0, -1), { ...last, endMs: null }];
      commitBlockSegments(next);
      return next;
    });
  }, [commitBlockSegments]);

  /** 撤销窗口内改标签：只更新当前段标题，不新开一段 */
  const updateLastBlockSegment = useCallback((label: string, meta?: BlockTimelineSegmentMeta) => {
    setBlockSegments((prev) => {
      const next = mutateUpdateLastBlockSegment(prev, label, meta);
      if (next === prev) return prev;
      commitBlockSegments(next);
      return next;
    });
  }, [commitBlockSegments]);

  /** 暂停：关闭当前活动段，进入空白时间（时长冻结） */
  const pauseBlockSegment = useCallback((nowMs = Date.now()) => {
    setBlockSegments((prev) => {
      const closed = prev.map((s, i) =>
        i === prev.length - 1 && s.endMs == null && !s.isGap ? { ...s, endMs: nowMs } : s
      );
      const last = closed[closed.length - 1];
      if (last?.isGap && last.startMs === nowMs) return closed;
      const next = [
        ...closed,
        { label: STATS_GAP_LABEL, startMs: nowMs, endMs: nowMs, isGap: true },
      ];
      commitBlockSegments(next);
      return next;
    });
  }, [commitBlockSegments]);

  /** 继续：移除空白段，开启新的活动段 */
  const resumeBlockSegment = useCallback(
    (label: string, nowMs = Date.now(), meta?: BlockTimelineSegmentMeta) => {
    setBlockSegments((prev) => {
      let trimmed = prev;
      const last = trimmed[trimmed.length - 1];
      if (last?.isGap) {
        trimmed = trimmed.slice(0, -1);
      }
      const closed = trimmed.map((s, i) =>
        i === trimmed.length - 1 && s.endMs == null && !s.isGap ? { ...s, endMs: nowMs } : s
      );
      const next = [...closed, { label, startMs: nowMs, endMs: null, ...meta }];
      commitBlockSegments(next);
      return next;
    });
  },
    [commitBlockSegments]
  );

  /** 撤销暂停：去掉空白段，恢复上一活动段为进行中 */
  const revertPauseBlockSegment = useCallback(() => {
    setBlockSegments((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (!last?.isGap) return prev;
      const withoutGap = prev.slice(0, -1);
      if (withoutGap.length === 0) {
        commitBlockSegments(withoutGap);
        return withoutGap;
      }
      const prevActivity = withoutGap[withoutGap.length - 1];
      const next = [...withoutGap.slice(0, -1), { ...prevActivity, endMs: null }];
      commitBlockSegments(next);
      return next;
    });
  }, [commitBlockSegments]);

  /** 撤销继续：去掉误增活动段，恢复空白时间 */
  const revertResumeBlockSegment = useCallback((nowMs = Date.now()) => {
    setBlockSegments((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.isGap) return prev;
      const withoutLast = prev.slice(0, -1);
      let next: BlockTimelineSegment[];
      if (withoutLast.length === 0) {
        next = [{ label: STATS_GAP_LABEL, startMs: nowMs, endMs: nowMs, isGap: true }];
      } else {
        const closed = withoutLast.map((s, i) =>
          i === withoutLast.length - 1 && s.endMs == null && !s.isGap ? { ...s, endMs: nowMs } : s
        );
        next = [...closed, { label: STATS_GAP_LABEL, startMs: nowMs, endMs: nowMs, isGap: true }];
      }
      commitBlockSegments(next);
      return next;
    });
  }, [commitBlockSegments]);

  const resetSegments = useCallback(() => {
    initializedForRef.current = null;
    blockSegmentsRef.current = [];
    setBlockSegments([]);
    clearStoredBlockSegments();
  }, []);

  const getBlockSegmentsSnapshot = useCallback(() => blockSegmentsRef.current, []);

  const restoreBlockSegments = useCallback(
    (segments: BlockTimelineSegment[]) => {
      const next = segments.length > 0 ? [...segments] : [];
      commitBlockSegments(next);
      setBlockSegments(next);
    },
    [commitBlockSegments]
  );

  return {
    blockSegments,
    appendBlockSegment,
    popBlockSegment,
    updateLastBlockSegment,
    pauseBlockSegment,
    resumeBlockSegment,
    revertPauseBlockSegment,
    revertResumeBlockSegment,
    resetSegments,
    getBlockSegmentsSnapshot,
    restoreBlockSegments,
  };
}
