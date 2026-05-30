'use client';

import { useMemo } from 'react';
import type { Record, Item, TimelineEntry } from '@/types/teto';
import { buildDayFeedFromRecords } from '@/lib/activity/timeline-utils';
import { resolveDayLabels } from '@/lib/activity/day-labels';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';

interface TodayActivityTimelineProps {
  records: Record[];
  date: string;
  items?: Item[];
  onGapClick?: (startIso: string, endIso: string) => void;
  onRecordClick?: (record: Record) => void;
  onPlanComplete?: (record: Record) => void;
}

export default function TodayActivityTimeline({
  records,
  date,
  items = [],
  onGapClick,
  onRecordClick,
  onPlanComplete,
}: TodayActivityTimelineProps) {
  const labels = useMemo(() => resolveDayLabels(date), [date]);
  const feed = useMemo(
    () => buildDayFeedFromRecords(records, date, labels.timelineTitle, items),
    [records, date, items, labels.timelineTitle]
  );

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
        const record = records.find((r) => r.id === entry.id);
        if (record) onRecordClick(record);
      }
    : undefined;

  const handlePlanComplete = onPlanComplete
    ? (entry: TimelineEntry) => {
        const record = records.find((r) => r.id === entry.id);
        if (record) onPlanComplete(record);
      }
    : undefined;

  return (
    <DayTimelinePanel
      data={feed}
      title={labels.timelineTitle}
      emptyText={labels.timelineEmpty}
      showGapHint
      onEntryClick={handleEntryClick}
      onGapClick={handleGapClick}
      onPlanComplete={handlePlanComplete}
    />
  );
}

function isoFromHHMM(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}`).toISOString();
}
