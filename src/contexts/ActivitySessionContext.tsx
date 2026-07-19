'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';
import type { ActivitySwitchPayload } from '@/lib/activity/records-mutation';
import {
  mergeRecordDeleted,
  mergeSwitchIntoRecords,
  mergeSwitchUndoIntoRecords,
  mergeRecordUpdated,
  mergeSessionActionIntoRecords,
  isOptimisticRecordId,
  isActiveTimingRecord,
  enrichRecord,
  preserveActiveTimingSnapshot,
  type SessionActionPayload,
} from '@/lib/activity/records-mutation';
import { mergeBlockAttributionFromServer } from '@/lib/activity/block-attribution-display';
import { blockSessionReducer, initialBlockSessionState } from '@/lib/activity/block-session-reducer';
import type {
  BlockSessionState,
  SwitchUndoSnapshot,
} from '@/lib/activity/block-session-types';
import {
  selectTimelineRecords,
  filterRecordsForBootstrap,
  reconcileTombstonesAfterFetch,
} from '@/lib/activity/select-timeline-records';
import {
  loadDeletedRecordTombstones,
  addDeletedRecordTombstone,
  removeDeletedRecordTombstone,
} from '@/lib/activity/deleted-records-tombstone';
import {
  loadLockedBlockCategory,
  loadStoredBlockSegments,
  saveLockedBlockCategory,
  clearLockedBlockCategory,
  saveStoredBlockSegments,
  clearStoredBlockSegments,
} from '@/hooks/use-block-session-segments';
import {
  postActivitySwitch,
  postActivityStop,
  patchRecordAttribution,
  deleteRecordById,
  buildAttributionPutBody,
  resolveRecordId,
  markActivitySwitchPending,
  settleActivitySwitch,
} from '@/lib/activity/block-session-effects';
import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import { isStaleGeneration } from '@/lib/activity/block-session-contract';

export interface ActivitySessionContextValue {
  state: BlockSessionState;
  activity: TetoRecord | null;
  lockedCategoryId: string | null;
  segments: BlockTimelineSegment[];
  isInBlock: boolean;
  canUndo: boolean;
  selectTimelineRecords: (records: TetoRecord[]) => TetoRecord[];
  filterBootstrapRecords: (loaded: TetoRecord[]) => TetoRecord[];
  reconcileTombstones: (loadedIds: string[]) => void;
  isTombstoned: (id: string) => boolean;
  hydrateFromBootstrap: (current: TetoRecord | null | undefined) => void;
  applyActivitySwitchPayload: (data: ActivitySwitchPayload) => void;
  applySessionAction: (data: SessionActionPayload) => void;
  applyRecordUpdated: (updated: TetoRecord) => void;
  publishActivity: (activity: TetoRecord | null) => void;
  applyRecordDeleted: (id: string) => void;
  onDeleteFailed: (record: TetoRecord) => void;
  dispatchEnterBlockOptimistic: (
    activity: TetoRecord,
    lockedCategoryId: string,
    segments: BlockTimelineSegment[]
  ) => void;
  dispatchCancelStartOptimistic: () => void;
  dispatchSwitchAttributionOptimistic: (params: {
    activity: TetoRecord;
    undo: SwitchUndoSnapshot;
    appendSegment: boolean;
    segment?: BlockTimelineSegment;
    updateLastSegment?: {
      label: string;
      item_id?: string | null;
      sub_item_id?: string | null;
      action_text?: string | null;
      tag_ids?: string[];
    };
  }) => void;
  dispatchUndoOptimistic: (activity: TetoRecord, segments: BlockTimelineSegment[]) => void;
  dispatchStopOptimistic: () => void;
  armCancelWindow: (mode: 'start' | 'switch', expiresAt: number) => void;
  disarmCancelWindow: () => void;
  incrementGen: () => number;
  syncFromServer: (activity: TetoRecord | null, gen: number) => void;
  persistLock: (categoryId: string | null) => void;
  persistSegments: (activityId: string, segments: BlockTimelineSegment[]) => void;
  clearBlockPersistence: () => void;
}

const ActivitySessionContext = createContext<ActivitySessionContextValue | null>(null);

export interface ActivitySessionProviderProps {
  children: ReactNode | ((value: ActivitySessionContextValue) => ReactNode);
  items: Item[];
  tags: Tag[];
  fallbackDate: string;
  records: TetoRecord[];
  setRecords: React.Dispatch<React.SetStateAction<TetoRecord[]>>;
  onError?: (message: string) => void;
}

export function ActivitySessionProvider({
  children,
  items,
  tags,
  fallbackDate,
  records,
  setRecords,
  onError,
}: ActivitySessionProviderProps) {
  const tombstoneSetRef = useRef<Set<string> | null>(null);
  if (tombstoneSetRef.current === null) {
    tombstoneSetRef.current = loadDeletedRecordTombstones();
  }
  const [state, dispatch] = useReducer(blockSessionReducer, undefined, () => ({
    ...initialBlockSessionState(),
    tombstones: [...tombstoneSetRef.current!],
    lockedCategoryId: typeof window !== 'undefined' ? loadLockedBlockCategory() : null,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const incrementGen = useCallback(() => {
    dispatch({ type: 'INCREMENT_GEN' });
    return stateRef.current.sessionGen + 1;
  }, []);

  const isTombstoned = useCallback(
    (id: string) => stateRef.current.tombstones.includes(id),
    []
  );

  const selectTimeline = useCallback(
    (recs: TetoRecord[]) => selectTimelineRecords(recs, stateRef.current),
    []
  );

  const filterBootstrap = useCallback(
    (loaded: TetoRecord[]) => filterRecordsForBootstrap(loaded, stateRef.current.tombstones),
    []
  );

  const reconcileTombstones = useCallback((loadedIds: string[]) => {
    const tombstones = tombstoneSetRef.current!;
    for (const id of [...tombstones]) {
      if (!loadedIds.includes(id)) {
        removeDeletedRecordTombstone(tombstones, id);
        dispatch({ type: 'REMOVE_TOMBSTONE', id });
      }
    }
    dispatch({ type: 'TOMBSTONE_RECONCILE', serverRecordIds: loadedIds });
  }, []);

  const hydrateFromBootstrap = useCallback((current: TetoRecord | null | undefined) => {
    if (!current || isTombstoned(current.id)) return;
    if (stateRef.current.activity) return;
    const stored = loadStoredBlockSegments();
    const lock = loadLockedBlockCategory();
    if (stored?.activityId === current.id && stored.segments.length > 0) {
      dispatch({
        type: 'ENTER_BLOCK_OPTIMISTIC',
        activity: current,
        lockedCategoryId: lock ?? current.item_id ?? '',
        segments: stored.segments,
      });
    } else if (isActiveTimingRecord(current)) {
      dispatch({
        type: 'SYNC_FROM_SERVER',
        activity: current,
        gen: stateRef.current.sessionGen,
      });
    }
  }, [isTombstoned]);

  const applyActivitySwitchPayload = useCallback(
    (data: ActivitySwitchPayload) => {
      const tombstones = tombstoneSetRef.current!;
      let payload = data;
      if (payload.record && tombstones.has(payload.record.id)) {
        if (isActiveTimingRecord(payload.record)) {
          removeDeletedRecordTombstone(tombstones, payload.record.id);
          dispatch({ type: 'REMOVE_TOMBSTONE', id: payload.record.id });
        } else {
          payload = { ...payload, record: null };
        }
      }
      const stopped = payload.stopped.filter((s) => !tombstones.has(s.id));
      payload = { ...payload, stopped };
      setRecords((prev) =>
        payload.undoDeleteId && payload.record
          ? mergeSwitchUndoIntoRecords(prev, payload.record, payload.undoDeleteId, items, fallbackDate)
          : mergeSwitchIntoRecords(prev, payload, items, fallbackDate)
      );
      if (payload.record) {
        const enriched = enrichRecord(payload.record, items, fallbackDate);
        const prev = stateRef.current.activity;
        const merged =
          prev && isActiveTimingRecord(prev)
            ? preserveActiveTimingSnapshot(enriched, prev)
            : enriched;
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: merged,
          gen: stateRef.current.sessionGen,
        });
      } else if (payload.stopped.length > 0) {
        dispatch({ type: 'STOP_OPTIMISTIC' });
      } else {
        dispatch({ type: 'CLEAR_BLOCK_SESSION' });
      }
    },
    [items, fallbackDate, setRecords]
  );

  const applySessionAction = useCallback(
    (data: SessionActionPayload) => {
      setRecords((prev) => mergeSessionActionIntoRecords(prev, data, items, fallbackDate));
      if (data.child) {
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: enrichRecord(data.child, items, fallbackDate),
          gen: stateRef.current.sessionGen,
        });
        return;
      }
      if (data.record) {
        const prev = stateRef.current.activity;
        const enriched = enrichRecord(data.record, items, fallbackDate);
        const merged =
          prev && (prev.id === enriched.id || isActiveTimingRecord(prev))
            ? preserveActiveTimingSnapshot(enriched, prev)
            : enriched;
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: merged,
          gen: stateRef.current.sessionGen,
        });
      }
    },
    [items, fallbackDate, setRecords]
  );

  const applyRecordUpdated = useCallback(
    (updated: TetoRecord) => {
      const tombstones = tombstoneSetRef.current!;
      if (tombstones.has(updated.id)) {
        if (isActiveTimingRecord(updated)) {
          removeDeletedRecordTombstone(tombstones, updated.id);
          dispatch({ type: 'REMOVE_TOMBSTONE', id: updated.id });
        } else {
          return;
        }
      }
      const prevCurrent = stateRef.current.activity;
      const blockLocked =
        typeof window !== 'undefined' &&
        Boolean(stateRef.current.lockedCategoryId ?? loadLockedBlockCategory());
      if (!prevCurrent && isActiveTimingRecord(updated) && !blockLocked) {
        setRecords((prev) => mergeRecordUpdated(prev, updated, items, fallbackDate));
        return;
      }
      setRecords((prev) => mergeRecordUpdated(prev, updated, items, fallbackDate));
      const touchesCurrent =
        prevCurrent?.id === updated.id ||
        (prevCurrent &&
          isOptimisticRecordId(prevCurrent.id) &&
          isActiveTimingRecord(updated));
      if (!touchesCurrent) return;
      const enriched = enrichRecord(updated, items, fallbackDate);
      if (
        blockLocked &&
        prevCurrent &&
        isActiveTimingRecord(prevCurrent) &&
        !prevCurrent.occurred_at_end
      ) {
        const merged =
          isOptimisticRecordId(prevCurrent.id) &&
          !isOptimisticRecordId(enriched.id) &&
          isActiveTimingRecord(enriched)
            ? preserveActiveTimingSnapshot({ ...prevCurrent, id: enriched.id }, prevCurrent)
            : preserveActiveTimingSnapshot(
                {
                  ...prevCurrent,
                  ...mergeBlockAttributionFromServer(
                    prevCurrent,
                    enriched,
                    stateRef.current.lockedCategoryId ?? loadLockedBlockCategory()
                  ),
                  item: enriched.item ?? prevCurrent.item,
                  session_state: enriched.session_state ?? prevCurrent.session_state,
                  paused_at:
                    enriched.paused_at !== undefined ? enriched.paused_at : prevCurrent.paused_at,
                  paused_total_seconds:
                    enriched.paused_total_seconds ?? prevCurrent.paused_total_seconds,
                },
                prevCurrent
              );
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: merged,
          gen: stateRef.current.sessionGen,
        });
        return;
      }
      if (prevCurrent?.id === enriched.id) {
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: preserveActiveTimingSnapshot(enriched, prevCurrent),
          gen: stateRef.current.sessionGen,
        });
        return;
      }
      if (prevCurrent && isOptimisticRecordId(prevCurrent.id) && isActiveTimingRecord(enriched)) {
        dispatch({
          type: 'SYNC_FROM_SERVER',
          activity: preserveActiveTimingSnapshot(enriched, prevCurrent),
          gen: stateRef.current.sessionGen,
        });
      }
    },
    [items, fallbackDate, setRecords]
  );

  const applyRecordDeleted = useCallback(
    (id: string) => {
      if (!isOptimisticRecordId(id)) {
        addDeletedRecordTombstone(tombstoneSetRef.current!, id);
        dispatch({ type: 'ADD_TOMBSTONE', id });
      }
      setRecords((prev) => mergeRecordDeleted(prev, id));
      if (stateRef.current.activity?.id === id) {
        dispatch({ type: 'CLEAR_BLOCK_SESSION' });
      }
    },
    [setRecords]
  );

  const onDeleteFailed = useCallback(
    (record: TetoRecord) => {
      removeDeletedRecordTombstone(tombstoneSetRef.current!, record.id);
      dispatch({ type: 'REMOVE_TOMBSTONE', id: record.id });
      setRecords((prev) => {
        if (prev.some((r) => r.id === record.id)) return prev;
        return [enrichRecord(record, items, fallbackDate), ...prev];
      });
      onError?.('部分记录可能未从服务器删除，已恢复');
    },
    [items, fallbackDate, onError, setRecords]
  );

  const publishActivity = useCallback((activity: TetoRecord | null) => {
    dispatch({
      type: 'SYNC_FROM_SERVER',
      activity,
      gen: stateRef.current.sessionGen,
    });
  }, []);

  const persistLock = useCallback((categoryId: string | null) => {
    if (categoryId) saveLockedBlockCategory(categoryId);
    else clearLockedBlockCategory();
  }, []);

  const persistSegments = useCallback((activityId: string, segments: BlockTimelineSegment[]) => {
    saveStoredBlockSegments(activityId, segments);
  }, []);

  const clearBlockPersistence = useCallback(() => {
    clearLockedBlockCategory();
    clearStoredBlockSegments();
  }, []);

  const value = useMemo((): ActivitySessionContextValue => {
    const canUndo =
      Boolean(state.undo) &&
      Boolean(state.cancelWindow) &&
      (state.cancelWindow?.expiresAt ?? 0) > Date.now();

    return {
      state,
      activity: state.activity,
      lockedCategoryId: state.lockedCategoryId,
      segments: state.segments,
      isInBlock: Boolean(state.lockedCategoryId),
      canUndo,
      selectTimelineRecords: selectTimeline,
      filterBootstrapRecords: filterBootstrap,
      reconcileTombstones,
      isTombstoned,
      hydrateFromBootstrap,
      applyActivitySwitchPayload,
      applySessionAction,
      applyRecordUpdated,
      publishActivity,
      applyRecordDeleted,
      onDeleteFailed,
      dispatchEnterBlockOptimistic: (activity, lockedCategoryId, segments) => {
        dispatch({ type: 'ENTER_BLOCK_OPTIMISTIC', activity, lockedCategoryId, segments });
      },
      dispatchCancelStartOptimistic: () => dispatch({ type: 'CANCEL_START_OPTIMISTIC' }),
      dispatchSwitchAttributionOptimistic: (params) =>
        dispatch({ type: 'SWITCH_ATTRIBUTION_OPTIMISTIC', ...params }),
      dispatchUndoOptimistic: (activity, segments) =>
        dispatch({ type: 'UNDO_SWITCH_OPTIMISTIC', activity, segments }),
      dispatchStopOptimistic: () => dispatch({ type: 'STOP_OPTIMISTIC' }),
      armCancelWindow: (mode, expiresAt) =>
        dispatch({ type: 'ARM_CANCEL_WINDOW', mode, expiresAt }),
      disarmCancelWindow: () => dispatch({ type: 'DISARM_CANCEL_WINDOW' }),
      incrementGen,
      syncFromServer: (activity, gen) => {
        if (!isStaleGeneration(gen, stateRef.current.sessionGen)) {
          dispatch({ type: 'SYNC_FROM_SERVER', activity, gen });
        }
      },
      persistLock,
      persistSegments,
      clearBlockPersistence,
    };
  }, [
    state,
    selectTimeline,
    filterBootstrap,
    reconcileTombstones,
    isTombstoned,
    hydrateFromBootstrap,
    applyActivitySwitchPayload,
    applySessionAction,
    applyRecordUpdated,
    publishActivity,
    applyRecordDeleted,
    onDeleteFailed,
    incrementGen,
    persistLock,
    persistSegments,
    clearBlockPersistence,
  ]);

  return (
    <ActivitySessionContext.Provider value={value}>
      {typeof children === 'function' ? children(value) : children}
    </ActivitySessionContext.Provider>
  );
}

export function useActivitySession(): ActivitySessionContextValue {
  const ctx = useContext(ActivitySessionContext);
  if (!ctx) {
    throw new Error('useActivitySession must be used within ActivitySessionProvider');
  }
  return ctx;
}

export function useOptionalActivitySession(): ActivitySessionContextValue | null {
  return useContext(ActivitySessionContext);
}

export {
  postActivitySwitch,
  postActivityStop,
  patchRecordAttribution,
  deleteRecordById,
  buildAttributionPutBody,
  resolveRecordId,
  markActivitySwitchPending,
  settleActivitySwitch,
  isStaleGeneration,
};
