'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';
import type { BlockTimelineSegmentMeta } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import type { ActivityContextValue } from '@/lib/activity/activity-context-types';
import {
  resolveBlockActionTagId,
  resolveBlockAttributionItemIds,
  resolveBlockDisplayContext,
} from '@/lib/activity/block-attribution-display';
import { resolveTargetItemId } from '@/lib/activity/item-tree';
import type { ActionSwitchPayload } from './ActivityDialogChat';

type PendingActionOverride =
  | { kind: 'user'; tagId: string | null }
  | null;

interface BlockAttributionBubblesProps {
  items: Item[];
  activity: TetoRecord;
  tags?: Tag[];
  lockedCategoryItemId?: string | null;
  /** 当前块时间活动段归属（比 activity 更完整时使用） */
  currentSegmentMeta?: BlockTimelineSegmentMeta | null;
  graceActive?: boolean;
  graceExpiresAt?: number | null;
  /** 事项 L2/L3 进度条点击：grace 内局部撤销 */
  onItemGraceUndo?: (level: 'l2' | 'l3') => void;
  /** 动作进度条点击：grace 内仅清除动作 */
  onActionGraceUndo?: () => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onTagCreated?: (tag: Tag) => void;
  onSwitch: (payload: {
    item_id: string;
    sub_item_id: string | null;
    label: string;
  }) => void;
  onActionSwitch?: (payload: ActionSwitchPayload) => void;
  onRegisterAttributionConfirm?: (confirm: () => void) => void;
  onRegisterAttributionReset?: (
    reset: (opts?: {
      activity?: TetoRecord;
      segmentMeta?: BlockTimelineSegmentMeta | null;
    }) => void
  ) => void;
}

/** 块时间右下：事项 + 动作并排（与主页面空闲区一致） */
function BlockAttributionBubbles({
  items,
  activity,
  tags = [],
  lockedCategoryItemId,
  currentSegmentMeta = null,
  graceActive = false,
  graceExpiresAt = null,
  onItemGraceUndo,
  onActionGraceUndo,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onTagCreated,
  onSwitch,
  onActionSwitch,
  onRegisterAttributionConfirm,
  onRegisterAttributionReset,
}: BlockAttributionBubblesProps) {
  const pendingActionRef = useRef<PendingActionOverride>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const segmentMetaRef = useRef(currentSegmentMeta);
  segmentMetaRef.current = currentSegmentMeta;
  const [pendingItem, setPendingItem] = useState<{
    item_id: string;
    sub_item_id: string | null;
  } | null>(null);
  const pendingItemRef = useRef(pendingItem);
  pendingItemRef.current = pendingItem;

  const resolvedActionTagId = useMemo(
    () => resolveBlockActionTagId(activity, currentSegmentMeta),
    [activity, currentSegmentMeta]
  );

  const displayContext = useMemo(
    (): ActivityContextValue =>
      resolveBlockDisplayContext(
        items,
        activity,
        lockedCategoryItemId,
        pendingItem,
        currentSegmentMeta
      ),
    [items, activity, lockedCategoryItemId, pendingItem, currentSegmentMeta]
  );

  const [actionTagId, setActionTagId] = useState<string | null>(resolvedActionTagId);

  useEffect(() => {
    setPendingItem(null);
    pendingActionRef.current = null;
    setActionTagId(null);
  }, [lockedCategoryItemId]);

  const confirmPendingAttribution = useCallback(() => {
    const act = activityRef.current;
    const seg = segmentMetaRef.current;
    const pending = pendingItemRef.current;
    if (pending) {
      const { item_id, sub_item_id } = resolveBlockAttributionItemIds(
        act,
        lockedCategoryItemId,
        seg
      );
      const matchesPending =
        item_id === pending.item_id &&
        (sub_item_id ?? null) === (pending.sub_item_id ?? null);
      if (!matchesPending) {
        return;
      }
    }
    const nextActionId = resolveBlockActionTagId(act, seg);
    pendingActionRef.current = null;
    setPendingItem(null);
    setActionTagId(nextActionId);
  }, [lockedCategoryItemId]);

  const resetAttributionUi = useCallback(
    (opts?: { activity?: TetoRecord; segmentMeta?: BlockTimelineSegmentMeta | null }) => {
      pendingActionRef.current = null;
      setPendingItem(null);
      const act = opts?.activity ?? activityRef.current;
      const seg = opts?.segmentMeta !== undefined ? opts.segmentMeta : segmentMetaRef.current;
      setActionTagId(resolveBlockActionTagId(act, seg));
    },
    []
  );

  useEffect(() => {
    onRegisterAttributionConfirm?.(confirmPendingAttribution);
  }, [onRegisterAttributionConfirm, confirmPendingAttribution]);

  useEffect(() => {
    onRegisterAttributionReset?.(resetAttributionUi);
  }, [onRegisterAttributionReset, resetAttributionUi]);

  useEffect(() => {
    if (!pendingItem) return;
    const { item_id, sub_item_id } = resolveBlockAttributionItemIds(
      activity,
      lockedCategoryItemId,
      currentSegmentMeta
    );
    const matchesPending =
      item_id === pendingItem.item_id &&
      (sub_item_id ?? null) === (pendingItem.sub_item_id ?? null);
    if (matchesPending) {
      confirmPendingAttribution();
    }
  }, [
    activity,
    pendingItem,
    lockedCategoryItemId,
    currentSegmentMeta,
    confirmPendingAttribution,
  ]);

  useEffect(() => {
    if (pendingActionRef.current?.kind === 'user') {
      return;
    }
    if (pendingItem) {
      return;
    }
    setActionTagId(resolvedActionTagId);
  }, [resolvedActionTagId, activity.id, activity.tags, pendingItem, currentSegmentMeta]);

  const actionScopeItemId =
    resolveTargetItemId(displayContext) || lockedCategoryItemId || null;

  const selectedActionTag = useMemo((): Tag | null => {
    if (!actionTagId) return null;
    return (
      tags.find((t) => t.id === actionTagId) ??
      activity.tags?.find((t) => t.id === actionTagId) ??
      null
    );
  }, [actionTagId, tags, activity.tags]);

  const handleContextChange = (next: ActivityContextValue) => {
    const targetId = resolveTargetItemId(next);
    if (!targetId) return;

    const label =
      next.subItemTitle ||
      next.itemTitle ||
      items.find((i) => i.id === targetId)?.title ||
      targetId;

    const effectiveItem = resolveBlockDisplayContext(
      items,
      activity,
      lockedCategoryItemId,
      null,
      currentSegmentMeta
    );
    const currentTarget = resolveTargetItemId(effectiveItem);
    if (targetId === currentTarget && (next.subItemId || '') === (effectiveItem.subItemId || '')) {
      return;
    }

    setPendingItem({
      item_id: targetId,
      sub_item_id: next.subItemId || null,
    });
    pendingActionRef.current = { kind: 'user', tagId: null };
    setActionTagId(null);

    onSwitch({
      item_id: targetId,
      sub_item_id: next.subItemId || null,
      label,
    });
  };

  const handleActionSelect = (tagId: string | null) => {
    pendingActionRef.current = { kind: 'user', tagId };
    setActionTagId(tagId);
    if (!onActionSwitch) return;
    if (!tagId) {
      onActionSwitch({
        content: '',
        actionLabel: '',
        tag_ids: [],
      });
      return;
    }
    const tag = tags.find((t) => t.id === tagId) ?? activity.tags?.find((t) => t.id === tagId);
    if (!tag) return;
    onActionSwitch({
      content: '',
      actionLabel: tag.name,
      tag_ids: [tag.id],
    });
  };

  /** grace 内点动作进度条：先清本地选中态，避免数据已清但 chip 仍走倒计时 */
  const handleActionGraceUndo = useCallback(() => {
    pendingActionRef.current = { kind: 'user', tagId: null };
    setActionTagId(null);
    onActionGraceUndo?.();
  }, [onActionGraceUndo]);

  /** grace 内点事项进度条：同步本地动作选中态，避免 L3 撤销后误用 activity 陈旧动作 */
  const handleItemGraceUndoLocal = useCallback(
    (level: 'l2' | 'l3') => {
      if (level === 'l2') {
        pendingActionRef.current = { kind: 'user', tagId: null };
        setActionTagId(null);
      } else {
        const seg = segmentMetaRef.current;
        const keepActionId = seg?.tag_ids?.length ? seg.tag_ids[0]! : null;
        pendingActionRef.current = { kind: 'user', tagId: keepActionId };
        setActionTagId(keepActionId);
      }
      onItemGraceUndo?.(level);
    },
    [onItemGraceUndo]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2 shadow-sm">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-slate-500">事项（可选，单选）</span>
            <span className="text-[10px] text-slate-400">项目/主题线</span>
          </div>
          <AttributionFlowPicker
            items={items}
            value={displayContext}
            onChange={handleContextChange}
            onItemsChange={onItemsChange}
            onItemCreated={onItemCreated}
            onCreateError={onCreateError}
            hideCategoryLevel
            dimUnselected
            graceActive={graceActive}
            graceExpiresAt={graceExpiresAt}
            onItemGraceUndo={handleItemGraceUndoLocal}
          />
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-slate-500">动作（可选，单选）</span>
            <span className="text-[10px] text-slate-400">行为线</span>
          </div>
          <ContextualFunctionTagRow
            itemId={actionScopeItemId}
            fallbackTags={tags}
            selectedTagId={actionTagId}
            pinnedSelectedTag={selectedActionTag}
            onSelect={handleActionSelect}
            onTagCreated={onTagCreated}
            hideLabel
            chipVariant="outline"
            graceActive={graceActive}
            graceExpiresAt={graceExpiresAt}
            onGraceUndo={handleActionGraceUndo}
            keepVisibleWhileLoading
            strictScope
          />
        </div>
      </div>
    </div>
  );
}

export default memo(BlockAttributionBubbles);
