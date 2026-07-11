import type {
  BlockSessionAction,
  BlockSessionState,
  BlockTimelineSegmentMetaPatch,
} from '@/lib/activity/block-session-types';
import { initialBlockSessionState } from '@/lib/activity/block-session-types';
import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';

function patchLastSegment(
  segments: BlockTimelineSegment[],
  patch: BlockTimelineSegmentMetaPatch
): BlockTimelineSegment[] {
  if (segments.length === 0) return segments;
  const next = [...segments];
  const lastIdx = next.length - 1;
  const last = next[lastIdx];
  next[lastIdx] = {
    ...last,
    label: patch.label,
    item_id: patch.item_id !== undefined ? patch.item_id : last.item_id,
    sub_item_id: patch.sub_item_id !== undefined ? patch.sub_item_id : last.sub_item_id,
    action_text: patch.action_text !== undefined ? patch.action_text : last.action_text,
    tag_ids: patch.tag_ids !== undefined ? patch.tag_ids : last.tag_ids,
  };
  return next;
}

export function blockSessionReducer(
  state: BlockSessionState,
  action: BlockSessionAction
): BlockSessionState {
  switch (action.type) {
    case 'INCREMENT_GEN':
      return { ...state, sessionGen: state.sessionGen + 1 };

    case 'SET_PENDING_SWITCH':
      return { ...state, pendingSwitch: action.pending };

    case 'ENTER_BLOCK_OPTIMISTIC':
      return {
        ...state,
        activity: action.activity,
        lockedCategoryId: action.lockedCategoryId,
        segments: action.segments,
        undo: null,
        cancelWindow: null,
      };

    case 'CANCEL_START_OPTIMISTIC':
      return {
        ...initialBlockSessionState(),
        sessionGen: state.sessionGen + 1,
        tombstones: state.tombstones,
      };

    case 'SWITCH_ATTRIBUTION_OPTIMISTIC': {
      let segments = state.segments;
      if (action.appendSegment && action.segment) {
        segments = [...segments, action.segment];
      } else if (action.updateLastSegment) {
        segments = patchLastSegment(segments, action.updateLastSegment);
      }
      return {
        ...state,
        activity: action.activity,
        undo: action.undo,
        segments,
      };
    }

    case 'UNDO_SWITCH_OPTIMISTIC':
      return {
        ...state,
        activity: action.activity,
        segments: action.segments,
        undo: null,
        sessionGen: state.sessionGen + 1,
      };

    case 'STOP_OPTIMISTIC':
      return {
        ...initialBlockSessionState(),
        sessionGen: state.sessionGen + 1,
        tombstones: state.tombstones,
      };

    case 'SYNC_FROM_SERVER':
      if (action.gen !== state.sessionGen) return state;
      return { ...state, activity: action.activity };

    case 'ARM_CANCEL_WINDOW':
      return {
        ...state,
        cancelWindow: { mode: action.mode, expiresAt: action.expiresAt },
      };

    case 'DISARM_CANCEL_WINDOW':
      return { ...state, cancelWindow: null, undo: null };

    case 'SET_SEGMENTS':
      return { ...state, segments: action.segments };

    case 'ADD_TOMBSTONE':
      if (state.tombstones.includes(action.id)) return state;
      return { ...state, tombstones: [...state.tombstones, action.id] };

    case 'REMOVE_TOMBSTONE':
      return {
        ...state,
        tombstones: state.tombstones.filter((id) => id !== action.id),
      };

    case 'TOMBSTONE_RECONCILE': {
      const serverSet = new Set(action.serverRecordIds);
      const next = state.tombstones.filter((id) => serverSet.has(id));
      return { ...state, tombstones: next };
    }

    case 'CLEAR_BLOCK_SESSION':
      return {
        ...initialBlockSessionState(),
        sessionGen: state.sessionGen,
        tombstones: state.tombstones,
      };

    default:
      return state;
  }
}

export { initialBlockSessionState };
