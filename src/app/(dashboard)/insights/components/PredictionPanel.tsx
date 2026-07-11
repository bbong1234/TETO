'use client';

import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { GoalProgress } from '@/types/teto';

interface PredictionPanelProps {
  progress: GoalProgress[];
}

function trackIcon(status: GoalProgress['on_track']) {
  if (status === 'on-track') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'at-risk') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  return null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function PredictionPanel({ progress }: PredictionPanelProps) {
  const withPrediction = progress.filter(
    (g) => g.prediction_note || g.predicted_completion_date || g.on_track !== 'unknown'
  );

  if (withPrediction.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-500" />
          <h2 className="text-base font-semibold text-slate-800">进度预测</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无足够数据生成预测。持续记录后系统会按均速推算完成时间。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-violet-500" />
        <h2 className="text-base font-semibold text-slate-800">进度预测</h2>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
        {withPrediction.map((g) => (
          <div key={g.goal_id} className="px-4 py-3 space-y-1">
            <div className="flex items-center gap-2">
              {trackIcon(g.on_track)}
              <span className="text-sm font-medium text-slate-700 flex-1 truncate">{g.goal_text}</span>
              {g.predicted_completion_date && (
                <span className="text-[11px] text-violet-600 font-medium shrink-0">
                  预计 {formatDate(g.predicted_completion_date)}
                </span>
              )}
            </div>
            {g.prediction_note && (
              <p className="text-[11px] text-slate-500 pl-5">{g.prediction_note}</p>
            )}
            {g.current_velocity != null && (
              <p className="text-[10px] text-slate-400 pl-5">
                近7天均速 {g.current_velocity} {g.unit}/天
                {g.required_velocity != null && ` · 需 ${g.required_velocity}/天`}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
