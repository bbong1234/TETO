'use client';

import { useMemo } from 'react';
import type { Record, Tag, Item, TimelineEntry } from '@/types/teto';
import { buildDayTimelineFromRecords } from '@/lib/activity/timeline-utils';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';

interface TodayActivityTimelineProps {
  records: Record[];
  date: string;
  items?: Item[];
  onGapClick?: (startIso: string, endIso: string) => void;
  onRecordClick?: (record: Record) => void;
}

export default function TodayActivityTimeline({
  records,
  date,
  items = [],
  onGapClick,
  onRecordClick,
}: TodayActivityTimelineProps) {
  const timeline = useMemo(
    () => buildDayTimelineFromRecords(records, date, '今日时间线', items),
    [records, date, items]
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
        const record = records.find((r) => r.id === entry.id);
        if (record) onRecordClick(record);
      }
    : undefined;

  return (
    <DayTimelinePanel
      data={timeline}
      title="今日时间线"
      emptyText="今天还没有带时间的记录，开始第一件事后将显示在这里。"
      onEntryClick={handleEntryClick}
      onGapClick={handleGapClick}
    />
  );
}

function isoFromHHMM(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}`).toISOString();
}
