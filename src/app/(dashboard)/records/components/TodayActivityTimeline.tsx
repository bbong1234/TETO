'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Record, Item, TimelineEntry } from '@/types/teto';
import { buildDayFeedFromRecords, isTimelineEntrySelectable } from '@/lib/activity/timeline-utils';
import { expandFeedWithBlockSegments } from '@/lib/activity/block-timeline-projection';
import {
  overlayCurrentActivityOnRecords,
  isActiveTimingRecord,
  isOptimisticBlockSegmentId,
  isOptimisticRecordId,
  resolveClientRecordId,
} from '@/lib/activity/records-mutation';
import {
  loadLockedBlockCategory,
  loadStoredBlockSegments,
  storedBlockSegmentsMatchActivity,
} from '@/hooks/use-block-session-segments';
import { resolveDayLabels } from '@/lib/activity/day-labels';
import { useSubItemTitlesFromRecords } from '@/hooks/use-sub-item-titles-from-records';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';
import { isRecordNotFoundApiError } from '@/lib/api/client-errors';
import { useOptionalActivitySession } from '@/contexts/ActivitySessionContext';

interface TodayActivityTimelineProps {
  records: Record[];
  date: string;
  items?: Item[];
  /** @deprecated 由 ActivitySessionContext 投影；保留仅为兼容 */
  currentActivity?: Record | null;
  currentActivityId?: string | null;
  onGapClick?: (startIso: string, endIso: string) => void;
  onRecordClick?: (record: Record) => void;
  onPlanComplete?: (record: Record) => void;
  onRecordDeleted?: (id: string) => void;
  onDeleteFailed?: (record: Record) => void;
  onError?: (message: string) => void;
}

export default function TodayActivityTimeline({
  records,
  date,
  items = [],
  currentActivity: currentActivityProp = null,
  currentActivityId: currentActivityIdProp = null,
  onGapClick,
  onRecordClick,
  onPlanComplete,
  onRecordDeleted,
  onDeleteFailed,
  onError,
}: TodayActivityTimelineProps) {
  const session = useOptionalActivitySession();
  const currentActivity = session?.activity ?? currentActivityProp;
  const currentActivityId = currentActivityIdProp ?? currentActivity?.id ?? null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const labels = useMemo(() => resolveDayLabels(date), [date]);

  const recordsForTimeline = useMemo(() => {
    // records 已由 RecordsClient 经 selectTimelineRecords 投影，勿再 strip optimistic-block-seg
    if (session) return records;
    return overlayCurrentActivityOnRecords(records, currentActivity);
  }, [records, session, currentActivity]);

  const subItemTitles = useSubItemTitlesFromRecords(recordsForTimeline);
  const feed = useMemo(() => {
    const base = buildDayFeedFromRecords(recordsForTimeline, date, labels.timelineTitle, items, {
      currentActivityId,
      subItemTitles,
    });
    const activityId = currentActivityId;
    const inBlock = session?.isInBlock ?? Boolean(loadLockedBlockCategory());
    if (!inBlock || !activityId) return base;

    const sessionSegments = session?.segments;
    const stored =
      sessionSegments && sessionSegments.length > 0
        ? { activityId, segments: sessionSegments }
        : loadStoredBlockSegments();
    if (!stored || stored.segments.length <= 1) return base;
    if (!storedBlockSegmentsMatchActivity(stored, activityId, currentActivity)) return base;
    return expandFeedWithBlockSegments(base, stored.segments, activityId);
  }, [
    recordsForTimeline,
    date,
    items,
    labels.timelineTitle,
    currentActivityId,
    currentActivity,
    subItemTitles,
    session?.segments,
    session?.isInBlock,
    session?.state.sessionGen,
  ]);

  const resolveRecordForEntry = (entry: TimelineEntry): Record | undefined => {
    const direct = records.find((r) => r.id === entry.id);
    if (direct) return direct;
    if (entry.id.startsWith('block-seg-')) {
      if (currentActivity && isActiveTimingRecord(currentActivity)) return currentActivity;
      return records.find((r) => isActiveTimingRecord(r));
    }
    return undefined;
  };

  const handleGapClick = onGapClick
    ? (entry: TimelineEntry) => {
        const startIso = entry.start_time
          ? isoFromHHMM(date, entry.start_time)
          : undefined;
        const endIso = entry.end_time
          ? isoFromHHMM(date, entry.end_time)
          : undefined;
        if (startIso && endIso) onGapClick(startIso, endIso);
      }
    : undefined;

  const handleEntryClick = onRecordClick
    ? (entry: TimelineEntry) => {
        if (entry.is_gap) return;
        const record = resolveRecordForEntry(entry);
        if (record) onRecordClick(record);
      }
    : undefined;

  const handlePlanComplete = onPlanComplete
    ? (entry: TimelineEntry) => {
        const record = resolveRecordForEntry(entry);
        if (record) onPlanComplete(record);
      }
    : undefined;

  const handleToggleSelect = useCallback((entry: TimelineEntry) => {
    if (!isTimelineEntrySelectable(entry)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((entries: TimelineEntry[]) => {
    const ids = entries.map((e) => e.id);
    setSelectedIds((prev) => {
      if (ids.length > 0 && ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || deleting || !onRecordDeleted) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条记录吗？`)) return;

    const ids = [...selectedIds];
    setSelectedIds(new Set());

    const resolveSnapshot = (id: string): Record | undefined =>
      records.find((r) => r.id === id) ??
      (currentActivity?.id === id ? currentActivity : undefined);

    const activeId = currentActivityId;
    const deletesActiveTiming =
      Boolean(activeId) &&
      ids.some((id) => id === activeId || resolveSnapshot(id)?.id === activeId);

    setDeleting(true);
    try {
      if (deletesActiveTiming) {
        try {
          await fetch('/api/v2/activities/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        } catch {
          /* 停止失败仍尝试删除记录 */
        }
        session?.dispatchStopOptimistic();
        session?.clearBlockPersistence();
      }

      for (const id of ids) {
        onRecordDeleted(id);
      }

      const deleteTargets: { originalId: string; resolvedId: string; snapshot?: Record }[] = [];
      for (const id of ids) {
        const snapshot = resolveSnapshot(id);
        const resolved = snapshot ? await resolveClientRecordId(snapshot) : id;
        deleteTargets.push({ originalId: id, resolvedId: resolved, snapshot });
        if (resolved !== id) onRecordDeleted(resolved);
      }

      const failed: Record[] = [];
      for (const { originalId, resolvedId, snapshot } of deleteTargets) {
        if (isOptimisticBlockSegmentId(resolvedId)) continue;
        if (isOptimisticRecordId(resolvedId) && resolvedId === originalId) continue;
        try {
          const res = await fetch(`/api/v2/records/${resolvedId}`, { method: 'DELETE' });
          if (res.ok) continue;
          const errBody = await res.json().catch(() => ({}));
          if (isRecordNotFoundApiError(errBody, res.status)) continue;
          if (snapshot && !isOptimisticRecordId(snapshot.id) && !isOptimisticBlockSegmentId(snapshot.id)) {
            failed.push(snapshot);
          }
        } catch {
          if (snapshot && !isOptimisticRecordId(snapshot.id) && !isOptimisticBlockSegmentId(snapshot.id)) {
            failed.push(snapshot);
          }
        }
      }
      if (failed.length > 0) {
        for (const record of failed) onDeleteFailed?.(record);
        onError?.(`有 ${failed.length} 条记录删除失败，已恢复`);
      }
    } finally {
      setDeleting(false);
    }
  }, [
    selectedIds,
    deleting,
    onRecordDeleted,
    onDeleteFailed,
    onError,
    records,
    currentActivity,
    currentActivityId,
    session,
  ]);

  return (
    <div className="h-full min-h-0">
      <DayTimelinePanel
        data={feed}
        title={labels.timelineTitle}
        emptyText={labels.timelineEmpty}
        showGapHint
        stickyHeader
        onEntryClick={handleEntryClick}
        onGapClick={handleGapClick}
        onPlanComplete={handlePlanComplete}
        multiSelect={
          onRecordDeleted
            ? {
                selectedIds,
                onToggle: handleToggleSelect,
                onSelectAll: handleSelectAll,
                onClear: handleClearSelection,
                onBatchDelete: handleBatchDelete,
                deleting,
              }
            : undefined
        }
      />
    </div>
  );
}

function isoFromHHMM(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}`).toISOString();
}
