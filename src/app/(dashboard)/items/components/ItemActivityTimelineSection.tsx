'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';
import { buildDayTimelineFromRecords } from '@/lib/activity/timeline-utils';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';

interface ItemActivityTimelineSectionProps {
  records: TetoRecord[];
  maxDays?: number;
}

function activityDate(record: TetoRecord): string | null {
  if (record.type !== '发生' || !record.occurred_at) return null;
  return fmtLocalDate(new Date(record.occurred_at));
}

export default function ItemActivityTimelineSection({
  records,
  maxDays = 14,
}: ItemActivityTimelineSectionProps) {
  const dayGroups = useMemo(() => {
    const map = new Map<string, TetoRecord[]>();
    for (const r of records) {
      const d = activityDate(r);
      if (!d) continue;
      const list = map.get(d) ?? [];
      list.push(r);
      map.set(d, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, maxDays)
      .map(([date, dayRecords]) => ({
        date,
        timeline: buildDayTimelineFromRecords(dayRecords, date, date),
      }));
  }, [records, maxDays]);

  if (dayGroups.length === 0) {
    return (
      <section className="glass rounded-3xl shadow-soft-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-bold text-slate-700">活动时间线</h2>
        </div>
        <p className="text-xs text-slate-400">暂无带时段的活动记录</p>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl shadow-soft-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-bold text-slate-700">活动时间线</h2>
        <span className="text-[10px] text-slate-400">近 {dayGroups.length} 天</span>
      </div>
      {dayGroups.map(({ date, timeline }) => (
        <DayTimelinePanel
          key={date}
          data={timeline}
          title={date}
          emptyText="该日暂无活动记录"
        />
      ))}
    </section>
  );
}
