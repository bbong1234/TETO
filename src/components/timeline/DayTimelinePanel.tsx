'use client';

import { Clock } from 'lucide-react';
import type { DayTimeline, TimelineEntry } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';

interface DayTimelinePanelProps {
  data: DayTimeline;
  title?: string;
  emptyText?: string;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
}

export default function DayTimelinePanel({
  data,
  title = '今日时间线',
  emptyText = '今天还没有时间记录。',
  onEntryClick,
  onGapClick,
}: DayTimelinePanelProps) {
  const timedEntries = data.records.filter((r) => r.start_time || r.is_gap);
  const untimed = data.records.filter((r) => !r.start_time && !r.is_gap);

  if (timedEntries.length === 0 && untimed.length === 0) {
    return (
      <div className="space-y-3">
        <Header title={title} />
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
          <p className="text-sm text-slate-400">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header title={title} count={data.record_count} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          {timedEntries.map((entry) => (
            <TimelineRow
              key={entry.id}
              entry={entry}
              onEntryClick={onEntryClick}
              onGapClick={onGapClick}
            />
          ))}
          {untimed.map((entry) => (
            <div key={entry.id} className="flex items-baseline gap-3 px-2 py-1">
              <span className="w-32 shrink-0 text-right text-[10px] text-slate-300">时间未记录</span>
              <span className="text-sm text-slate-500">{entry.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  entry,
  onEntryClick,
  onGapClick,
}: {
  entry: TimelineEntry;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
}) {
  const handler = entry.is_gap ? onGapClick : onEntryClick;
  const timeLabel = entry.is_current
    ? `${entry.start_time} - 进行中`
    : entry.end_time
      ? `${entry.start_time} - ${entry.end_time}`
      : entry.start_time;

  const rowClass = `flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
    entry.is_gap
      ? 'border border-dashed border-amber-200 bg-amber-50/50 hover:bg-amber-50'
      : entry.is_current
        ? 'border border-blue-200 bg-blue-50/60'
        : handler
          ? 'hover:bg-slate-50'
          : ''
  }`;

  const inner = (
    <>
      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-400">{timeLabel}</span>
      <span
        className={`flex-1 text-sm ${
          entry.is_gap ? 'text-amber-700' : entry.is_current ? 'font-medium text-blue-800' : 'text-slate-700'
        }`}
      >
        {entry.text}
        {entry.duration_minutes != null && entry.duration_minutes > 0 && (
          <span className="ml-2 text-xs text-slate-400">{formatDurationMinutes(entry.duration_minutes)}</span>
        )}
      </span>
    </>
  );

  if (handler) {
    return (
      <button type="button" onClick={() => handler(entry)} className={rowClass}>
        {inner}
      </button>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}

function Header({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-blue-500" />
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {count != null && count > 0 && <span className="text-[10px] text-slate-400">{count} 条</span>}
    </div>
  );
}