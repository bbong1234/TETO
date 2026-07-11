import type { Record as TetoRecord } from '@/types/teto';
import {
  isActiveTimingRecord,
  isOptimisticBlockSegmentId,
  overlayCurrentActivityOnRecords,
} from '@/lib/activity/records-mutation';
import type { BlockSessionState } from '@/lib/activity/block-session-types';

/** 从 session + 列表记录投影今日时间线数据源 */
export function selectTimelineRecords(
  records: TetoRecord[],
  session: Pick<BlockSessionState, 'activity' | 'tombstones'>
): TetoRecord[] {
  const tombstoneSet = new Set(session.tombstones);
  const filtered = records.filter((r) => {
    if (tombstoneSet.has(r.id)) return false;
    if (isOptimisticBlockSegmentId(r.id)) {
      // 块时间停止拆段：乐观 completed 段需即时展示，等服务端 id 再替换
      return r.lifecycle_status === 'completed' && Boolean(r.occurred_at_end);
    }
    return true;
  });
  return overlayCurrentActivityOnRecords(filtered, session.activity);
}

export function filterRecordsForBootstrap(
  loaded: TetoRecord[],
  tombstones: string[]
): TetoRecord[] {
  const tombstoneSet = new Set(tombstones);
  return loaded.filter((r) => !tombstoneSet.has(r.id));
}

export function reconcileTombstonesAfterFetch(
  tombstones: string[],
  loadedIds: string[]
): string[] {
  const loadedSet = new Set(loadedIds);
  return tombstones.filter((id) => loadedSet.has(id));
}

export function shouldClearTombstoneOnFetch(
  tombstoneId: string,
  loadedIds: string[]
): boolean {
  return !loadedIds.includes(tombstoneId);
}

export function isSessionInBlock(session: Pick<BlockSessionState, 'lockedCategoryId'>): boolean {
  return Boolean(session.lockedCategoryId);
}

export function canUndoSwitch(session: Pick<BlockSessionState, 'undo' | 'cancelWindow'>): boolean {
  if (!session.undo || !session.cancelWindow) return false;
  return session.cancelWindow.expiresAt > Date.now();
}

export function isGraceActive(session: Pick<BlockSessionState, 'cancelWindow' | 'lockedCategoryId'>): boolean {
  if (!session.lockedCategoryId || !session.cancelWindow) return false;
  return session.cancelWindow.expiresAt > Date.now();
}

export function touchesActiveSession(
  session: Pick<BlockSessionState, 'activity'>,
  recordId: string
): boolean {
  return session.activity?.id === recordId;
}

export function shouldResurrectActiveOnUpdate(
  record: TetoRecord,
  sessionActivity: TetoRecord | null
): boolean {
  return !sessionActivity && isActiveTimingRecord(record);
}
