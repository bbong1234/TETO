'use client';

import { ArrowUpRight, ArrowDownRight, Minus, GitCompare } from 'lucide-react';
import type { InsightChange } from '@/types/teto';

function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'same' }) {
  if (direction === 'up') return <ArrowUpRight className="h-3 w-3 text-green-600" />;
  if (direction === 'down') return <ArrowDownRight className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-slate-400" />;
}

function ChangeRow({ change }: { change: InsightChange }) {
  const isUp = change.direction === 'up';
  const isSame = change.direction === 'same';
  const displayValue = typeof change.value === 'number'
    ? (change.value > 0 ? `+${change.value}` : String(change.value))
    : String(change.value);

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-sm text-slate-600 flex-1">{change.label}</span>
      <DirectionIcon direction={change.direction} />
      <span className={`text-sm font-medium tabular-nums ${isSame ? 'text-slate-400' : isUp ? 'text-green-600' : 'text-red-500'}`}>
        {displayValue}
      </span>
      <span className="text-xs text-slate-400 w-8">{change.unit}</span>
    </div>
  );
}

export default function PeriodComparisonPanel({ changes }: { changes: InsightChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-teal-500" />
          <h2 className="text-base font-semibold text-slate-800">周期对比</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无上一周期数据可对比。</p>
        </div>
      </div>
    );
  }

  const weekChanges = changes.filter(c => c.scope === 'week');
  const monthChanges = changes.filter(c => c.scope === 'month');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-teal-500" />
        <h2 className="text-base font-semibold text-slate-800">周期对比</h2>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
        {weekChanges.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">相比上周</p>
            <div className="divide-y divide-slate-100">
              {weekChanges.map((c, i) => <ChangeRow key={`w-${i}`} change={c} />)}
            </div>
          </div>
        )}

        {monthChanges.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">相比上月</p>
            <div className="divide-y divide-slate-100">
              {monthChanges.map((c, i) => <ChangeRow key={`m-${i}`} change={c} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
