'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Timer } from 'lucide-react';
import type { InsightsData } from '@/types/teto';

type ItemRanking = NonNullable<InsightsData['item_time_ranking']>[number];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

interface CrossItemComparisonProps {
  data: InsightsData['item_time_ranking'];
}

export default function CrossItemComparison({ data }: CrossItemComparisonProps) {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-5">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Timer className="h-4 w-4 text-indigo-500" />
          事项时长对比
        </h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">该时间段内暂无带时长的事项记录</p>
        </div>
      </div>
    );
  }

  // 限制最多展示 10 条
  const topItems = data.slice(0, 10);

  const chartData = topItems.map((item) => ({
    name: item.item_title.length > 10 ? item.item_title.slice(0, 10) + '…' : item.item_title,
    fullName: item.item_title,
    minutes: item.total_duration_minutes,
    percentage: item.percentage,
    recordCount: item.record_count,
  }));

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Timer className="h-4 w-4 text-indigo-500" />
        事项时长对比
      </h2>

      {/* Horizontal bar chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={Math.max(160, topItems.length * 40 + 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} unit="分" />
            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: any, _name: any, props: any) => {
                const payload = props.payload;
                return [formatDuration(payload.minutes), payload.fullName];
              }}
            />
            <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail list */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          {topItems.map((item, index) => (
            <div
              key={item.item_id}
              className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              >
                {index + 1}
              </span>
              <span className="text-sm text-slate-800 truncate flex-1">{item.item_title}</span>
              <span className="text-xs text-slate-500 tabular-nums shrink-0">
                {formatDuration(item.total_duration_minutes)}
              </span>
              <span className="text-xs font-medium text-indigo-600 tabular-nums shrink-0 w-12 text-right">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
