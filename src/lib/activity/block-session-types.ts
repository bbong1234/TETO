import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import type { Record as TetoRecord } from '@/types/teto';
import type { CancelWindowMode } from '@/lib/activity/block-session-contract';

export interface SwitchUndoSnapshot {
  previousActivity: TetoRecord;
  attributionOnly?: boolean;
  blockSegmentAppended?: boolean;
  blockSegmentsSnapshot?: BlockTimelineSegment[];
}

export interface CancelWindowState {
  mode: CancelWindowMode;
  expiresAt: number;
}

export interface BlockSessionState {
  sessionGen: number;
  activity: TetoRecord | null;
  lockedCategoryId: string | null;
  segments: BlockTimelineSegment[];
  cancelWindow: CancelWindowState | null;
  undo: SwitchUndoSnapshot | null;
  tombstones: string[];
  pendingSwitch: boolean;
}

export type BlockSessionAction =
  | { type: 'INCREMENT_GEN' }
  | { type: 'SET_PENDING_SWITCH'; pending: boolean }
  | { type: 'ENTER_BLOCK_OPTIMISTIC'; activity: TetoRecord; lockedCategoryId: string; segments: BlockTimelineSegment[] }
  | { type: 'CANCEL_START_OPTIMISTIC' }
  | { type: 'SWITCH_ATTRIBUTION_OPTIMISTIC'; activity: TetoRecord; undo: SwitchUndoSnapshot; appendSegment: boolean; segment?: BlockTimelineSegment; updateLastSegment?: BlockTimelineSegmentMetaPatch }
  | { type: 'UNDO_SWITCH_OPTIMISTIC'; activity: TetoRecord; segments: BlockTimelineSegment[] }
  | { type: 'STOP_OPTIMISTIC' }
  | { type: 'SYNC_FROM_SERVER'; activity: TetoRecord | null; gen: number }
  | { type: 'ARM_CANCEL_WINDOW'; mode: CancelWindowMode; expiresAt: number }
  | { type: 'DISARM_CANCEL_WINDOW' }
  | { type: 'SET_SEGMENTS'; segments: BlockTimelineSegment[] }
  | { type: 'ADD_TOMBSTONE'; id: string }
  | { type: 'REMOVE_TOMBSTONE'; id: string }
  | { type: 'TOMBSTONE_RECONCILE'; serverRecordIds: string[] }
  | { type: 'CLEAR_BLOCK_SESSION' };

export interface BlockTimelineSegmentMetaPatch {
  label: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  action_text?: string | null;
  tag_ids?: string[];
}

export const initialBlockSessionState = (): BlockSessionState => ({
  sessionGen: 0,
  activity: null,
  lockedCategoryId: null,
  segments: [],
  cancelWindow: null,
  undo: null,
  tombstones: [],
  pendingSwitch: false,
});
