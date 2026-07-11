import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import { buildBlockUndoSnapshotActivity } from '@/lib/activity/block-attribution-display';
import type { BlockSwitchKind } from '@/lib/activity/block-tag-switch-rules';
import type { Record as TetoRecord, Tag } from '@/types/teto';

/** 块时间标签切换撤销栈的一帧（PATCH 前状态） */
export type SwitchUndoFrame = {
  previousActivity: TetoRecord;
  /** 块时间内 PATCH 归属/动作，撤销时还原字段而非删记录 */
  attributionOnly?: boolean;
  /** 本次切换已 append 新段；无 snapshot 时撤销应 pop 段 */
  blockSegmentAppended?: boolean;
  blockSegmentsSnapshot?: BlockTimelineSegment[];
  switchKind?: BlockSwitchKind;
};

export function buildSwitchUndoFrame(
  baseline: TetoRecord,
  segments: BlockTimelineSegment[],
  tags: Tag[],
  extras?: Pick<SwitchUndoFrame, 'attributionOnly' | 'blockSegmentAppended' | 'switchKind'>
): SwitchUndoFrame {
  const snapshotActivity = buildBlockUndoSnapshotActivity(baseline, segments, tags);
  return {
    previousActivity: { ...snapshotActivity },
    attributionOnly: extras?.attributionOnly ?? true,
    blockSegmentAppended: extras?.blockSegmentAppended,
    blockSegmentsSnapshot: segments.length > 0 ? [...segments] : undefined,
    switchKind: extras?.switchKind,
  };
}

export function pushSwitchUndoFrame(
  stack: SwitchUndoFrame[],
  frame: SwitchUndoFrame
): SwitchUndoFrame[] {
  return [...stack, frame];
}

export function popSwitchUndoFrame(stack: SwitchUndoFrame[]): {
  frame: SwitchUndoFrame | null;
  stack: SwitchUndoFrame[];
} {
  if (stack.length === 0) {
    return { frame: null, stack: [] };
  }
  const frame = stack[stack.length - 1];
  return { frame, stack: stack.slice(0, -1) };
}

export function peekSwitchUndoFrame(stack: SwitchUndoFrame[]): SwitchUndoFrame | null {
  if (stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function clearSwitchUndoStack(): SwitchUndoFrame[] {
  return [];
}

/** 弹栈后若仍有更早一步，退回的状态需重新进入 5 秒撤销窗 */
export function shouldRearmGraceAfterPop(remainingStack: SwitchUndoFrame[]): boolean {
  return remainingStack.length > 0;
}
