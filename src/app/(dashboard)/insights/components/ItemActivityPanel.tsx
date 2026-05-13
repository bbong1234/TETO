'use client';

import { Activity, Clock, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ItemActivity, StagnantItem, ItemTimeRanking } from '@/types/teto';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

function formatLastRecordAt(dateStr: string | null): string {
  if (!dateStr) return '从未记录';
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  return `${Math.floor(diffDays / 30)}月前`;
}

interface ItemActivityPanelProps {
  active_items: ItemActivity[];
  time_ranking: ItemTimeRanking[];
  stagnant_items: StagnantItem[];
}

export default function ItemActivityPanel({ active_items, time_ranking, stagnant_items }: ItemActivityPanelProps) {
  if (active_items.length === 0 && stagnant_items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-800">事项活动</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无事项活动数据。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-indigo-500" />
        <h2 className="text-base font-semibold text-slate-800">事项活动</h2>
      </div>

      {/* 活跃排行 */}
      {active_items.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-indigo-500" />
            活跃事项
          </h3>
          <div className="space-y-2">
            {active_items.map((item, index) => (
              <div key={item.item_id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                >
                  {index + 1}
                </span>
                <span className="text-sm text-slate-800 truncate flex-1">{item.item_title}</span>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">{item.record_count}条</span>
                {item.total_duration_minutes > 0 && (
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{formatDuration(item.total_duration_minutes)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 时长排行 */}
      {time_ranking.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-500" />
            事项时长对比
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(160, Math.min(time_ranking.length, 8) * 40 + 40)}>
            <BarChart data={time_ranking.slice(0, 8).map(item => ({
              name: item.item_title.length > 8 ? item.item_title.slice(0, 8) + '…' : item.item_title,
              fullName: item.item_title,
              minutes: item.total_duration_minutes,
            }))} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} unit="分" />
              <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: any, _name: any, props: any) => [formatDuration(props.payload.minutes), props.payload.fullName]} />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                {time_ranking.slice(0, 8).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 停滞事项 */}
      {stagnant_items.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <h3 className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5" />
            沉寂中的事项
          </h3>
          <div className="space-y-1.5">
            {stagnant_items.map(item => (
              <div key={item.item_id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                <span className="text-sm text-slate-700">{item.item_title}</span>
                <span className="text-xs text-amber-600">{item.stagnation_days}天无记录</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
