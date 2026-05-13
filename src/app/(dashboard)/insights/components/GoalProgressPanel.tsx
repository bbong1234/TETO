'use client';

import { Target, AlertTriangle } from 'lucide-react';
import type { GoalProgress } from '@/types/teto';

export default function GoalProgressPanel({ progress }: { progress: GoalProgress[] }) {
  if (progress.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-rose-500" />
          <h2 className="text-base font-semibold text-slate-800">目标进度</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无进行中的目标。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-rose-500" />
        <h2 className="text-base font-semibold text-slate-800">目标进度</h2>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="space-y-3">
          {progress.map(goal => {
            const pct = goal.target_value > 0
              ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
              : 0;
            const currentValueDisplay = Number.isInteger(goal.current_value) ? goal.current_value : goal.current_value.toFixed(1);
            const targetValueDisplay = Number.isInteger(goal.target_value) ? goal.target_value : goal.target_value.toFixed(1);

            return (
              <div key={goal.goal_id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700 flex-1 mr-2">{goal.goal_text}</span>
                  {goal.is_over_limit && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      超限
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all ${goal.is_over_limit ? 'bg-red-500' : 'bg-rose-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {currentValueDisplay}/{targetValueDisplay} {goal.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
