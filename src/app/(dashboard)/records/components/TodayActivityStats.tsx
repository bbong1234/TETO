'use client';

import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import type { Record as TetoRecord, Item } from '@/types/teto';
import { computeTodayActivityStats, formatDurationMinutes } from '@/lib/activity/stats-utils';

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

  if (stats.recorded_minutes === 0 && stats.current_elapsed_minutes === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-emerald-500" />
        <h2 className="text-base font-semibold text-slate-800">今日统计</h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        {/* 汇总行 */}
        <div className="flex flex-wrap gap-3">
          <StatChip
            label="已记录"
            value={formatDurationMinutes(stats.recorded_minutes)}
            color="text-emerald-600"
          />
          {stats.gap_minutes > 0 && (
            <StatChip
              label="空白"
              value={formatDurationMinutes(stats.gap_minutes)}
              color="text-amber-600"
            />
          )}
          {stats.current_elapsed_minutes > 0 && (
            <StatChip
              label="进行中"
              value={formatDurationMinutes(stats.current_elapsed_minutes)}
              color="text-blue-600"
            />
          )}
        </div>

        {/* 按分类 */}
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
                  minutes={row.minutes}
                  total={stats.recorded_minutes}
                />
              ))}
            </div>
          </div>
        )}

        {/* 按项目（item） */}
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
                  minutes={row.minutes}
                  total={stats.recorded_minutes}
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
  minutes,
  total,
}: {
  label: string;
  minutes: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((minutes / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-slate-600">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-slate-400">
        {formatDurationMinutes(minutes)}
      </span>
    </div>
  );
}
