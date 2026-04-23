'use client';

import { ListOrdered, AlertTriangle, Activity } from 'lucide-react';
import type { InsightsData } from '@/types/teto';

interface ItemStatsProps {
  data: InsightsData['item_overview'];
}

function NumberCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function formatLastRecordAt(dateStr: string | null): string {
  if (!dateStr) return '从未记录';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return `${Math.floor(diffDays / 30)} 月前`;
}

export default function ItemStats({ data }: ItemStatsProps) {
  const { active_count, top_items, stale_items } = data;

  return (
    <div className="space-y-5">
      {/* Section title */}
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Activity className="h-4 w-4 text-emerald-500" />
        事项维度统计
      </h2>

      {/* Number card */}
      <div className="grid grid-cols-2 gap-3">
        <NumberCard icon={Activity} label="当前活跃事项" value={active_count} color="bg-emerald-500" />
      </div>

      {/* Top 5 items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <ListOrdered className="h-4 w-4 text-blue-500" />
          Top 5 事项
        </h3>
        {top_items.length > 0 ? (
          <div className="space-y-2">
            {top_items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600">
                    {index + 1}
                  </span>
                  <span className="text-sm text-slate-800">{item.title}</span>
                </div>
                <span className="text-sm font-medium text-slate-600">{item.record_count} 条记录</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">暂无数据</p>
        )}
      </div>

      {/* Stale items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          停滞事项
        </h3>
        {stale_items.length > 0 ? (
          <div className="space-y-2">
            {stale_items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"
              >
                <span className="text-sm text-slate-800">{item.title}</span>
                <span className="text-xs text-amber-600">
                  {formatLastRecordAt(item.last_record_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">暂无停滞事项</p>
        )}
      </div>
    </div>
  );
}
