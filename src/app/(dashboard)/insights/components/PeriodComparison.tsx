'use client';

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface PeriodData {
  record_count: number;
  total_hours: number;
  total_cost: number;
}

interface PeriodComparisonProps {
  this_week: PeriodData;
  last_week: PeriodData;
  this_month: PeriodData;
  last_month: PeriodData;
}

function ChangeBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) {
    return <span className="text-[10px] text-slate-400">无数据</span>;
  }
  if (previous === 0) {
    return <span className="text-[10px] text-green-500">新增</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
        <Minus className="h-2.5 w-2.5" />持平
      </span>
    );
  }
  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${isUp ? 'text-green-600' : 'text-red-500'}`}>
      {isUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

export default function PeriodComparison({ this_week, last_week, this_month, last_month }: PeriodComparisonProps) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-4">周期对比</h3>

      <div className="space-y-4">
        {/* 周对比 */}
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">周对比</p>
          <div className="grid grid-cols-3 gap-2">
            <div />
            <p className="text-[10px] text-slate-400 text-center">上周</p>
            <p className="text-[10px] text-slate-400 text-center">本周</p>
          </div>
          <div className="space-y-1.5 mt-1">
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">记录数</p>
              <p className="text-xs text-slate-700 text-center">{last_week.record_count}</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">{this_week.record_count}</p>
                <ChangeBadge current={this_week.record_count} previous={last_week.record_count} label="记录数" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">时长</p>
              <p className="text-xs text-slate-700 text-center">{last_week.total_hours}h</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">{this_week.total_hours}h</p>
                <ChangeBadge current={this_week.total_hours} previous={last_week.total_hours} label="时长" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">花费</p>
              <p className="text-xs text-slate-700 text-center">¥{last_week.total_cost.toLocaleString()}</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">¥{this_week.total_cost.toLocaleString()}</p>
                <ChangeBadge current={this_week.total_cost} previous={last_week.total_cost} label="花费" />
              </div>
            </div>
          </div>
        </div>

        {/* 月对比 */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">月对比</p>
          <div className="grid grid-cols-3 gap-2">
            <div />
            <p className="text-[10px] text-slate-400 text-center">上月</p>
            <p className="text-[10px] text-slate-400 text-center">本月</p>
          </div>
          <div className="space-y-1.5 mt-1">
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">记录数</p>
              <p className="text-xs text-slate-700 text-center">{last_month.record_count}</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">{this_month.record_count}</p>
                <ChangeBadge current={this_month.record_count} previous={last_month.record_count} label="记录数" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">时长</p>
              <p className="text-xs text-slate-700 text-center">{last_month.total_hours}h</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">{this_month.total_hours}h</p>
                <ChangeBadge current={this_month.total_hours} previous={last_month.total_hours} label="时长" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-center">
              <p className="text-[10px] text-slate-500">花费</p>
              <p className="text-xs text-slate-700 text-center">¥{last_month.total_cost.toLocaleString()}</p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-xs font-semibold text-slate-800">¥{this_month.total_cost.toLocaleString()}</p>
                <ChangeBadge current={this_month.total_cost} previous={last_month.total_cost} label="花费" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
