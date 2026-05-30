'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';
import DayTimelinePanel from '@/components/timeline/DayTimelinePanel';
import { buildDayFeedFromRecords, getRecordDisplayDate } from '@/lib/activity/timeline-utils';

interface ItemDayFeedSectionProps {
  records: TetoRecord[];
  maxDays?: number;
  onRecordClick?: (record: TetoRecord) => void;
  onPlanComplete?: (record: TetoRecord) => void;
}

function recordDisplayDate(record: TetoRecord): string | null {
  const d = getRecordDisplayDate(record);
  return d || null;
}

export default function ItemDayFeedSection({
  records,
  maxDays = 14,
  onRecordClick,
  onPlanComplete,
}: ItemDayFeedSectionProps) {
  const dayGroups = useMemo(() => {
    const map = new Map<string, TetoRecord[]>();
    for (const r of records) {
      const d = recordDisplayDate(r);
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
        feed: buildDayFeedFromRecords(dayRecords, date, date),
      }));
  }, [records, maxDays]);

  if (dayGroups.length === 0) {
    return (
      <section className="glass rounded-3xl shadow-soft-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-bold text-slate-700">记录动态</h2>
        </div>
        <p className="text-xs text-slate-400">暂无记录</p>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl shadow-soft-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-bold text-slate-700">记录动态</h2>
        <span className="text-[10px] text-slate-400">近 {dayGroups.length} 天</span>
      </div>
      {dayGroups.map(({ date, feed }) => (
        <DayTimelinePanel
          key={date}
          data={feed}
          title={date}
          emptyText="该日暂无记录"
          onEntryClick={
            onRecordClick
              ? (entry) => {
                  if (entry.is_gap) return;
                  const record = records.find((r) => r.id === entry.id);
                  if (record) onRecordClick(record);
                }
              : undefined
          }
          onPlanComplete={
            onPlanComplete
              ? (entry) => {
                  const record = records.find((r) => r.id === entry.id);
                  if (record) onPlanComplete(record);
                }
              : undefined
          }
        />
      ))}
    </section>
  );
}
