'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock } from 'lucide-react';
import type { InsightsData } from '@/types/teto';

const SLOT_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#6366f1'];
const SLOT_LABELS: { key: keyof NonNullable<InsightsData['time_distribution']>; label: string; icon: string }[] = [
  { key: 'morning', label: '上午', icon: '🌅' },
  { key: 'afternoon', label: '下午', icon: '☀️' },
  { key: 'evening', label: '傍晚', icon: '🌆' },
  { key: 'night', label: '夜间', icon: '🌙' },
];

interface TimeDistributionProps {
  data: InsightsData['time_distribution'];
}

export default function TimeDistribution({ data }: TimeDistributionProps) {
  if (!data) return null;

  const { morning, afternoon, evening, night } = data;
  const total = morning + afternoon + evening + night;

  if (total === 0) {
    return (
      <div className="space-y-5">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          时间段分布
        </h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">该时间段内暂无带时间记录的数据</p>
        </div>
      </div>
    );
  }

  const chartData = SLOT_LABELS.map((slot, i) => ({
    name: slot.label,
    value: data[slot.key],
    color: SLOT_COLORS[i],
  }));

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-500" />
        时间段分布
      </h2>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-center gap-4">
          {/* Pie chart */}
          <div className="w-full lg:w-1/2">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  label={({ name, percent }: any) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend / detail list */}
          <div className="w-full lg:w-1/2 space-y-2">
            {SLOT_LABELS.map((slot, i) => {
              const count = data[slot.key];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={slot.key} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: SLOT_COLORS[i] }}
                  />
                  <span className="text-sm text-slate-700 w-14">{slot.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: SLOT_COLORS[i] }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums w-16 text-right">
                    {count} 条 ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
