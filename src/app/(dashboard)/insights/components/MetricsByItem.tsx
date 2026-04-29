'use client';

import { Activity, Flame, Pause, CheckCircle2, Zap } from 'lucide-react';

interface MetricItem {
  item_id: string;
  item_title: string;
  activity: number;
  effort: number;
  stagnation_days: number;
  plan_achievement: number;
  effectiveness: number;
}

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function StagnationBadge({ days }: { days: number }) {
  let label = '活跃';
  let color = 'text-green-600 bg-green-50';
  if (days > 30) { label = '重度停滞'; color = 'text-red-600 bg-red-50'; }
  else if (days > 14) { label = '中度停滞'; color = 'text-amber-600 bg-amber-50'; }
  else if (days > 7) { label = '轻度停滞'; color = 'text-yellow-600 bg-yellow-50'; }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {label} ({days}天)
    </span>
  );
}

export default function MetricsByItem({ metrics }: { metrics: MetricItem[] }) {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-700">口径化指标</h3>
        <span className="text-[10px] text-slate-400 ml-auto">统一口径计算</span>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3 text-blue-500" />活跃度</span>
        <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3 text-orange-500" />投入</span>
        <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3 text-yellow-500" />停滞</span>
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />计划达成</span>
        <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-purple-500" />效果</span>
      </div>

      <div className="space-y-3">
        {metrics.map(m => (
          <div key={m.item_id} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">{m.item_title}</span>
              <StagnationBadge days={m.stagnation_days} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">活跃度</span>
                  <span className="text-[10px] font-semibold text-blue-600">{m.activity}</span>
                </div>
                <MetricBar value={m.activity} color="bg-blue-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">投入</span>
                  <span className="text-[10px] font-semibold text-orange-600">{m.effort}</span>
                </div>
                <MetricBar value={m.effort} color="bg-orange-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">计划达成</span>
                  <span className="text-[10px] font-semibold text-green-600">{m.plan_achievement}%</span>
                </div>
                <MetricBar value={m.plan_achievement} color="bg-green-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-400">效果</span>
                  <span className="text-[10px] font-semibold text-purple-600">{m.effectiveness}%</span>
                </div>
                <MetricBar value={m.effectiveness} color="bg-purple-500" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
