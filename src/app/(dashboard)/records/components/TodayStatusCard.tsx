'use client';

import { useMemo } from 'react';
import type { Record as TetoRecord, Item } from '@/types/teto';
import { computeTodayActivityStats, formatStatDuration } from '@/lib/activity/stats-utils';
import { formatAverageMoodEmoji, averageMoodValue } from '@/components/records/MoodPicker';

interface TodayStatusCardProps {
  date: string;
  records: TetoRecord[];
  currentActivity: TetoRecord | null;
  items?: Item[];
  /** 极简一行，不占输入区高度 */
  compact?: boolean;
}

function weekdayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('zh-CN', { weekday: 'short' });
}

function monthDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export default function TodayStatusCard({
  date,
  records,
  currentActivity,
  items = [],
  compact = false,
}: TodayStatusCardProps) {
  const stats = useMemo(
    () => computeTodayActivityStats(records, date, currentActivity, items),
    [records, date, currentActivity, items]
  );

  const todayRecords = useMemo(
    () => records.filter((r) => r.date === date || !r.date),
    [records, date]
  );

  const moodAvg = useMemo(
    () => averageMoodValue(todayRecords.map((r) => r.mood)),
    [todayRecords]
  );
  const moodEmoji = formatAverageMoodEmoji(moodAvg);

  const planStats = useMemo(() => {
    const plans = todayRecords.filter((r) => r.type === '计划');
    const done = plans.filter((r) => r.lifecycle_status === 'completed').length;
    return { total: plans.length, done };
  }, [todayRecords]);

  const recordCount = todayRecords.length;
  const activeSeconds = stats.recorded_seconds + stats.current_elapsed_seconds;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 border-b border-slate-100 pb-2 -mx-1 px-1">
        <span className="font-medium text-slate-600 shrink-0">
          {monthDayLabel(date)} {weekdayLabel(date)}
        </span>
        <span className="text-slate-300">·</span>
        <span>
          {moodEmoji} 已记 <span className="tabular-nums text-slate-700">{recordCount}</span>
        </span>
        {activeSeconds > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums text-slate-700">{formatStatDuration(activeSeconds)}</span>
          </>
        )}
        {planStats.total > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">
              计划 {planStats.done}/{planStats.total}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-500">
          今天 · {monthDayLabel(date)} {weekdayLabel(date)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span>
          情绪 <span className="text-sm">{moodEmoji}</span>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          已记 <span className="font-medium tabular-nums text-slate-800">{recordCount}</span> 条
        </span>
        {activeSeconds > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span>
              活跃{' '}
              <span className="font-medium tabular-nums text-slate-800">
                {formatStatDuration(activeSeconds)}
              </span>
            </span>
          </>
        )}
      </div>

      {planStats.total > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 shrink-0">计划</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all"
              style={{
                width: `${Math.round((planStats.done / planStats.total) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-slate-500 shrink-0">
            {planStats.done}/{planStats.total}
          </span>
        </div>
      )}
    </div>
  );
}
