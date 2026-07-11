import type { BlockTimelineSegmentMeta } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import type { Record as TetoRecord, Tag } from '@/types/teto';

/** 块时间切换标签：PATCH 输入 */
export type BlockAttributionPatchInput = {
  item_id?: string | null;
  sub_item_id?: string | null;
  /** SubItem 三级标题，用于块时间线 label（不写 content） */
  sub_item_title?: string | null;
  tag_ids?: string[];
  action_text?: string | null;
  content?: string;
};

export type BlockSwitchKind = 'item' | 'action' | 'clear_action';

export function isBlockAttributionChanged(
  current: Pick<TetoRecord, 'item_id' | 'sub_item_id'>,
  patch: BlockAttributionPatchInput
): boolean {
  return (
    (patch.item_id !== undefined && patch.item_id !== current.item_id) ||
    (patch.sub_item_id !== undefined &&
      (patch.sub_item_id ?? null) !== (current.sub_item_id ?? null))
  );
}

export function functionTagIdsFromRecord(
  record: Pick<TetoRecord, 'tags'> | null | undefined
): string[] {
  return record?.tags?.filter((t) => t.type === 'function').map((t) => t.id) ?? [];
}

/** 5 秒撤销窗内：覆盖最后一段（以最后一次选择为准）；窗外才新开一段 */
export function shouldAppendBlockSegmentOnSwitch(
  graceActive: boolean,
  _switchKind: BlockSwitchKind = 'action'
): boolean {
  return !graceActive;
}

/** 5 秒撤销窗内后续切换不压栈，取消一次回到本次窗开启前 */
export function shouldPushBlockSwitchUndoFrame(
  _switchKind: BlockSwitchKind,
  graceActive: boolean
): boolean {
  return !graceActive;
}

/**
 * 块时间 PUT 必须带上解析后的 item_id，避免 DB 仍是大类时 sub_item 校验失败。
 */
export function ensureBlockAttributionPutBody(
  body: Record<string, unknown>,
  resolved: Pick<TetoRecord, 'item_id' | 'sub_item_id'>
): Record<string, unknown> {
  const touchesAttribution =
    'item_id' in body ||
    'sub_item_id' in body ||
    'tag_ids' in body ||
    'action_text' in body ||
    'content' in body;
  if (!touchesAttribution) return body;
  if (resolved.item_id) {
    body.item_id = resolved.item_id;
  }
  body.sub_item_id = resolved.sub_item_id ?? null;
  return body;
}

/** 同一次撤销窗内后续 PATCH 仍重置 5 秒倒计时（每次切换标签重新开始） */
export function shouldPreserveBlockGraceWindow(_params: {
  inActiveSwitchWindow: boolean;
  hasUndo: boolean;
}): boolean {
  return false;
}

export type BlockCancelRoute = 'entry_full' | 'switch_undo' | 'disarm_only' | 'other';

/**
 * 块时间取消按钮路由：
 * - entry_full：进入后 grace 内且无 undo 栈（含仅 grace 内改标签）→ 整段退出
 * - switch_undo：有 undo 栈或窗外切换后的 grace → pop 一步
 */
export function resolveBlockCancelRoute(params: {
  inBlock: boolean;
  graceActive: boolean;
  undoStackDepth: number;
  mode: 'start' | 'switch' | null;
}): BlockCancelRoute {
  const { inBlock, graceActive, undoStackDepth, mode } = params;
  const hasUndo = undoStackDepth > 0;

  if (inBlock && graceActive && !hasUndo) {
    return 'entry_full';
  }

  if (hasUndo || mode === 'switch' || (inBlock && graceActive && mode !== 'start')) {
    if (hasUndo || (mode === 'switch' && graceActive)) {
      return 'switch_undo';
    }
    return 'disarm_only';
  }

  return 'other';
}

/** 块内事项切换路由：块时间全程 PATCH 同一条记录，仅在停止时拆段 */
export function resolveBlockItemSwitchRoute(params: {
  inBlock: boolean;
  graceActive: boolean;
}): 'patch' | 'postSwitch' | 'mainPostSwitch' {
  if (!params.inBlock) return 'mainPostSwitch';
  return 'patch';
}

export function resolveBlockSwitchKind(patch: BlockAttributionPatchInput): BlockSwitchKind {
  if (patch.tag_ids !== undefined && patch.tag_ids.length === 0) {
    return 'clear_action';
  }
  if (patch.tag_ids !== undefined && patch.tag_ids.length > 0) {
    return 'action';
  }
  if (patch.item_id !== undefined || patch.sub_item_id !== undefined) {
    return 'item';
  }
  return 'action';
}

export type BlockAttributionPatchPlan = {
  body: Record<string, unknown>;
  mergedTags: Tag[];
  optimisticFields: {
    item_id?: string | null;
    sub_item_id?: string | null;
    tags?: Tag[];
    action_text?: string | null;
    content?: string;
  };
  segmentMeta: BlockTimelineSegmentMeta;
  attributionChanged: boolean;
  shouldClearActionOnAttributionChange: boolean;
};

/**
 * 块时间归属/动作 PATCH 计划：统一「切事项清动作、不写 content 标签路径」规则。
 */
export function buildBlockAttributionPatchPlan(
  current: TetoRecord,
  patch: BlockAttributionPatchInput,
  allTags: Tag[]
): BlockAttributionPatchPlan {
  const body: Record<string, unknown> = {};
  const itemIdChanged =
    patch.item_id !== undefined && patch.item_id !== current.item_id;
  const resolvedSubItemId =
    patch.sub_item_id !== undefined
      ? patch.sub_item_id
      : itemIdChanged
        ? null
        : current.sub_item_id;

  if (patch.item_id !== undefined) body.item_id = patch.item_id;
  if (patch.sub_item_id !== undefined) {
    body.sub_item_id = patch.sub_item_id;
  } else if (itemIdChanged) {
    body.sub_item_id = null;
  }
  if (patch.tag_ids !== undefined) body.tag_ids = patch.tag_ids;
  if (patch.action_text !== undefined) body.action_text = patch.action_text;
  if (patch.content !== undefined) body.content = patch.content;

  const attributionChanged = isBlockAttributionChanged(current, patch);
  // 不写 content：标签路径由 item/sub_item/action 表达，清空 content 会导致 UI 回退与服务端校验问题

  const shouldClearActionOnAttributionChange =
    attributionChanged && patch.tag_ids === undefined;
  if (shouldClearActionOnAttributionChange) {
    body.tag_ids = [];
    body.action_text = null;
  }

  const mergedTags =
    patch.tag_ids !== undefined
      ? allTags.filter((t) => patch.tag_ids!.includes(t.id))
      : shouldClearActionOnAttributionChange
        ? (current.tags ?? []).filter((t) => t.type !== 'function')
        : current.tags ?? [];

  const optimisticActionText =
    patch.action_text !== undefined
      ? patch.action_text
      : shouldClearActionOnAttributionChange
        ? null
        : current.action_text;

  const optimisticContent =
    patch.content !== undefined ? patch.content : current.content;

  const optimisticItemId = patch.item_id !== undefined ? patch.item_id : current.item_id;
  const optimisticSubItemId = resolvedSubItemId;

  const segmentMeta: BlockTimelineSegmentMeta = {
    item_id: optimisticItemId,
    sub_item_id: optimisticSubItemId ?? null,
    action_text: optimisticActionText ?? null,
    tag_ids: functionTagIdsFromRecord({ tags: mergedTags }),
  };

  return {
    body,
    mergedTags,
    optimisticFields: {
      item_id: patch.item_id !== undefined ? patch.item_id : undefined,
      sub_item_id:
        patch.sub_item_id !== undefined
          ? patch.sub_item_id
          : itemIdChanged
            ? null
            : undefined,
      tags: patch.tag_ids !== undefined || shouldClearActionOnAttributionChange ? mergedTags : undefined,
      action_text:
        patch.action_text !== undefined || shouldClearActionOnAttributionChange
          ? optimisticActionText ?? null
          : undefined,
      content: patch.content !== undefined ? optimisticContent : undefined,
    },
    segmentMeta,
    attributionChanged,
    shouldClearActionOnAttributionChange,
  };
}

/** 动作切换段 meta（保持当前事项，只改动作） */
export function buildBlockActionSegmentMeta(
  activity: Pick<TetoRecord, 'item_id' | 'sub_item_id'>,
  actionLabel: string | null,
  tagIds: string[]
): BlockTimelineSegmentMeta {
  return {
    item_id: activity.item_id,
    sub_item_id: activity.sub_item_id ?? null,
    action_text: actionLabel,
    tag_ids: tagIds,
  };
}

/** 事项切换段 meta（清空动作） */
export function buildBlockItemSegmentMeta(
  item_id: string,
  sub_item_id: string | null
): BlockTimelineSegmentMeta {
  return {
    item_id,
    sub_item_id,
    action_text: null,
    tag_ids: [],
  };
}
