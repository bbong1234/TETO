'use client';

import { useMemo, type ReactNode } from 'react';
import type { Record, Item, TimelineEntry } from '@/types/teto';
import { buildDayFeedFromRecords } from '@/lib/activity/timeline-utils';
import { expandFeedWithBlockSegments } from '@/lib/activity/block-timeline-projection';
import {
  overlayCurrentActivityOnRecords,
  isActiveTimingRecord,
} from '@/lib/activity/records-mutation';
import {
  loadLockedBlockCategory,
  loadStoredBlockSegments,
  storedBlockSegmentsMatchActivity,
} from '@/hooks/use-block-session-segments';
import { resolveDayLabels } from '@/lib/activity/day-labels';
import { useSubItemTitlesFromRecords } from '@/hooks/use-sub-item-titles-from-records';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';
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
  showAddRecord?: boolean;
  onAddRecord?: () => void;
  showImportFromDiary?: boolean;
  onImportFromDiary?: () => void;
  importPanel?: ReactNode;
  focusedRecordId?: string | null;
  onFocusRecord?: (recordId: string | null) => void;
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
  showAddRecord = false,
  onAddRecord,
  showImportFromDiary = false,
  onImportFromDiary,
  importPanel,
  focusedRecordId = null,
  onFocusRecord,
}: TodayActivityTimelineProps) {
  const session = useOptionalActivitySession();
  const currentActivity = session?.activity ?? currentActivityProp;
  const currentActivityId = currentActivityIdProp ?? currentActivity?.id ?? null;

  const labels = useMemo(() => resolveDayLabels(date), [date]);

  const recordsForTimeline = useMemo(() => {
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
        showAddRecord={showAddRecord}
        onAddRecord={onAddRecord}
        headerActions={
          showImportFromDiary && onImportFromDiary ? (
            <button
              type="button"
              onClick={onImportFromDiary}
              className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
            >
              从日记写入
            </button>
          ) : undefined
        }
        importPanel={importPanel}
        focusedRecordId={focusedRecordId}
        onFocusRecord={onFocusRecord}
      />
    </div>
  );
}

function isoFromHHMM(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}`).toISOString();
}
