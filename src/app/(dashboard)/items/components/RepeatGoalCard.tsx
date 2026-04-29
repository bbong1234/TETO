'use client';

import { Target, Calendar, Repeat } from 'lucide-react';
import type { RepeatGoalEngineResult } from '@/types/teto';

const FREQ_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

/**
 * 重复型目标引擎卡片
 * 展示当前周期进度、7天/30天完成次数、周期起止日期
 */
export default function RepeatGoalCard({ result }: { result: RepeatGoalEngineResult }) {
  const {
    goal_title,
    repeat_frequency,
    repeat_count,
    current_period_start,
    current_period_end,
    current_period_actual,
    current_period_progress,
    count_7d,
    count_30d,
  } = result;

  const freqLabel = FREQ_LABELS[repeat_frequency] || repeat_frequency;
  const isComplete = current_period_progress >= 1;
  const progressPercent = Math.min(Math.round(current_period_progress * 100), 100);

  // 颜色逻辑
  const progressColor = isComplete
    ? 'bg-emerald-400'
    : current_period_progress >= 0.7
      ? 'bg-amber-400'
      : 'bg-red-400';
  const progressTextColor = isComplete
    ? 'text-emerald-600'
    : current_period_progress >= 0.7
      ? 'text-amber-600'
      : 'text-red-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm p-4 space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Repeat className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <span className="text-sm font-semibold text-slate-800">{goal_title}</span>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
          {freqLabel} {repeat_count} 次
        </span>
      </div>

      {/* 核心进度 */}
      <div className="bg-slate-50/80 rounded-xl p-3 text-center border border-slate-100">
        <div className="text-[10px] text-slate-400 mb-1">当前周期进度</div>
        <div className={`text-2xl tabular-nums font-bold ${progressTextColor}`}>
          {current_period_actual} <span className="text-sm font-normal text-slate-400">/ {repeat_count}</span>
        </div>
        {/* 进度条 */}
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-slate-400">{progressPercent}%</div>
      </div>

      {/* 周期日期 + 统计 */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="text-center py-1.5 rounded-lg bg-slate-50/50">
          <div className="text-[9px] text-slate-400 mb-0.5">近7天</div>
          <div className="text-xs tabular-nums font-medium text-slate-700">{count_7d} 次</div>
        </div>
        <div className="text-center py-1.5 rounded-lg bg-slate-50/50">
          <div className="text-[9px] text-slate-400 mb-0.5">近30天</div>
          <div className="text-xs tabular-nums font-medium text-slate-700">{count_30d} 次</div>
        </div>
        <div className="text-center py-1.5 rounded-lg bg-slate-50/50">
          <div className="text-[9px] text-slate-400 mb-0.5">状态</div>
          <div className={`text-xs font-medium ${isComplete ? 'text-emerald-600' : 'text-slate-500'}`}>
            {isComplete ? '已达标' : '进行中'}
          </div>
        </div>
      </div>

      {/* 周期日期 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-slate-500">
          当前周期：{formatDate(current_period_start)} — {formatDate(current_period_end)}
        </span>
      </div>
    </div>
  );
}

/** 格式化日期为短格式 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
