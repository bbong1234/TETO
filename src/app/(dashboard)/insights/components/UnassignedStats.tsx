'use client';

import { Layers, FileText, Timer, DollarSign } from 'lucide-react';

interface UnassignedStatsProps {
  /** 未关联事项的记录数 */
  unassigned_count: number;
  /** 未关联事项的总时长（分钟） */
  unassigned_duration_minutes: number;
  /** 未关联事项的总花费 */
  unassigned_cost: number;
  /** 总记录数 */
  total_count: number;
}

export default function UnassignedStats({
  unassigned_count,
  unassigned_duration_minutes,
  unassigned_cost,
  total_count,
}: UnassignedStatsProps) {
  if (unassigned_count === 0) return null;

  const ratio = total_count > 0 ? Math.round((unassigned_count / total_count) * 100) : 0;
  const hours = (unassigned_duration_minutes / 60).toFixed(1);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-700">非事项区</h3>
        <span className="text-[10px] text-slate-400 ml-auto">
          未关联事项的记录
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">记录数</p>
          <p className="text-lg font-bold text-slate-800">{unassigned_count}</p>
          <p className="text-[10px] text-slate-400">占比 {ratio}%</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">总时长</p>
          <p className="text-lg font-bold text-slate-800">{hours}h</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">总花费</p>
          <p className="text-lg font-bold text-slate-800">
            {unassigned_cost > 0 ? `¥${unassigned_cost.toLocaleString()}` : '-'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 flex items-center justify-center">
          <p className="text-xs text-slate-400 text-center">
            这些记录未归入任何事项，可在记录页手动关联
          </p>
        </div>
      </div>
    </div>
  );
}
