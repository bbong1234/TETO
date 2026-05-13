'use client';

import { Layers, FileText, Timer, DollarSign, AlertTriangle, ExternalLink } from 'lucide-react';
import type { DataReview } from '@/types/teto';

export default function DataReviewPanel({ data }: { data: DataReview }) {
  const { unassigned_count, inferred_count, missing_time_count, pending_goal_draft_count } = data;
  const total = unassigned_count + inferred_count + missing_time_count + pending_goal_draft_count;

  if (total === 0) return null;

  const items = [
    { count: unassigned_count, label: '条记录未关联事项', icon: Layers, color: 'text-slate-600' },
    { count: inferred_count, label: '条记录由系统推断', icon: AlertTriangle, color: 'text-amber-600' },
    { count: missing_time_count, label: '条记录缺少时间', icon: Timer, color: 'text-slate-600' },
    { count: pending_goal_draft_count, label: '个目标草稿待确认', icon: FileText, color: 'text-slate-600' },
  ].filter(i => i.count > 0);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-700">数据待整理</h3>
      </div>

      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <item.icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className={`font-medium ${item.color}`}>{item.count}</span>
            <span className="text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>

      <a
        href="/records"
        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
      >
        <ExternalLink className="h-3 w-3" />
        去整理
      </a>
    </div>
  );
}
