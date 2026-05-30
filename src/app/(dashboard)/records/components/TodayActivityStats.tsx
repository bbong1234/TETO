'use client';

import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import type { Record as TetoRecord, Item } from '@/types/teto';
import { computeTodayActivityStats, formatStatDuration } from '@/lib/activity/stats-utils';
import { resolveDayLabels } from '@/lib/activity/day-labels';

interface TodayActivityStatsProps {
  records: TetoRecord[];
  date: string;
  currentActivity: TetoRecord | null;
  items?: Item[];
}

export default function TodayActivityStats({
  records,
  date,
  currentActivity,
  items = [],
}: TodayActivityStatsProps) {
  const stats = useMemo(
    () => computeTodayActivityStats(records, date, currentActivity, items),
    [records, date, currentActivity, items]
  );
  const statsTitle = useMemo(() => resolveDayLabels(date).statsTitle, [date]);

  if (
    stats.recorded_seconds === 0 &&
    stats.gap_seconds === 0 &&
    stats.current_elapsed_seconds === 0
  ) {
    return null;
  }

  const barTotal = stats.recorded_seconds + stats.gap_seconds;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-emerald-500" />
        <h2 className="text-base font-semibold text-slate-800">{statsTitle}</h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3">
          <StatChip
            label="已记录"
            value={formatStatDuration(stats.recorded_seconds)}
            color="text-emerald-600"
          />
          {stats.gap_seconds > 0 && (
            <StatChip
              label="空白时间"
              value={formatStatDuration(stats.gap_seconds)}
              color="text-amber-600"
            />
          )}
          {stats.current_elapsed_seconds > 0 && (
            <StatChip
              label="进行中"
              value={formatStatDuration(stats.current_elapsed_seconds)}
              color="text-blue-600"
            />
          )}
        </div>

        {stats.by_category.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              按大类
            </p>
            <div className="space-y-1">
              {stats.by_category.map((row) => (
                <BarRow
                  key={row.category}
                  label={row.category}
                  seconds={row.seconds}
                  total={barTotal > 0 ? barTotal : stats.recorded_seconds}
                  variant={
                    row.is_gap ? 'gap' : row.is_uncategorized ? 'uncategorized' : 'default'
                  }
                />
              ))}
            </div>
          </div>
        )}

        {stats.by_item.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              按事项
            </p>
            <div className="space-y-1">
              {stats.by_item.map((row) => (
                <BarRow
                  key={row.item_id}
                  label={row.item_title}
                  seconds={row.seconds}
                  total={barTotal > 0 ? barTotal : stats.recorded_seconds}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function BarRow({
  label,
  seconds,
  total,
  variant = 'default',
}: {
  label: string;
  seconds: number;
  total: number;
  variant?: 'default' | 'gap' | 'uncategorized';
}) {
  const pct = total > 0 ? Math.round((seconds / total) * 100) : 0;
  const barClass =
    variant === 'gap'
      ? 'bg-amber-400'
      : variant === 'uncategorized'
        ? 'bg-slate-300'
        : 'bg-blue-400';
  const labelClass =
    variant === 'gap'
      ? 'text-amber-700'
      : variant === 'uncategorized'
        ? 'text-slate-500'
        : 'text-slate-600';

  return (
    <div className="flex items-center gap-2">
      <span className={`w-20 shrink-0 truncate text-xs ${labelClass}`}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-slate-400">
        {formatStatDuration(seconds)}
      </span>
    </div>
  );
}
