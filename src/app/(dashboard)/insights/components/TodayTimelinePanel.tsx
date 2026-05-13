'use client';

import { Clock } from 'lucide-react';
import type { DayTimeline } from '@/types/teto';

interface TimelinePanelProps {
  data: DayTimeline;
}

export default function TodayTimelinePanel({ data }: TimelinePanelProps) {
  const title = '今日时间线';
  const emptyText = '今天还没有记录。';

  if (data.record_count === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
          <p className="text-sm text-slate-400">{emptyText}</p>
        </div>
      </div>
    );
  }

  // 分离有时间和无时间的记录
  const withTime = data.records.filter(r => r.start_time);
  const withoutTime = data.records.filter(r => !r.start_time);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-500" />
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <span className="text-[10px] text-slate-400">{data.record_count} 条记录</span>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
        <div className="space-y-1.5">
          {withTime.map(entry => (
            <div key={entry.id} className="flex items-baseline gap-3 py-0.5">
              <span className="text-xs text-slate-400 tabular-nums w-28 shrink-0 text-right">
                {entry.start_time}
                {entry.end_time ? ` - ${entry.end_time}` : ''}
              </span>
              <span className="text-sm text-slate-700">{entry.text}</span>
            </div>
          ))}
          {withoutTime.map(entry => (
            <div key={entry.id} className="flex items-baseline gap-3 py-0.5">
              <span className="text-[10px] text-slate-300 w-28 shrink-0 text-right">时间未记录</span>
              <span className="text-sm text-slate-500">{entry.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
