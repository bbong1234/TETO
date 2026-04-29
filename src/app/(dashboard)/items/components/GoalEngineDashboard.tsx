'use client';

import { Loader2, TrendingDown, TrendingUp, Target, Calendar, BarChart3, Repeat } from 'lucide-react';
import { useGoalEngine } from '@/lib/hooks/useGoalEngine';
import type { GoalEngineResult, RepeatGoalEngineResult } from '@/types/teto';
import RepeatGoalCard from './RepeatGoalCard';

/**
 * 目标引擎仪表盘（亮色主题，匹配事项详情页）
 * 展示事项下所有量化目标 + 重复型目标的核心指标
 */
export default function GoalEngineDashboard({ itemId, onAddGoal, activeSubItemId, goals }: { itemId: string; onAddGoal?: () => void; activeSubItemId?: string | null; goals?: { id: string; sub_item_id?: string | null; measure_type?: string }[] }) {
  const { data, repeatData, loading, error } = useGoalEngine(itemId);

  // 按子项筛选引擎数据：只显示量化型目标且属于当前子项的
  const goalSubItemMap = new Map(goals?.map(g => [g.id, g.sub_item_id]) || []);
  const filteredData = activeSubItemId
    ? data.filter(r => goalSubItemMap.get(r.goal_id) === activeSubItemId)
    : data;

  // 按子项筛选重复型目标
  const filteredRepeatData = activeSubItemId
    ? repeatData.filter(r => goalSubItemMap.get(r.goal_id) === activeSubItemId)
    : repeatData;

  const hasAnyGoals = filteredData.length > 0 || filteredRepeatData.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">计算引擎加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 py-4">
        引擎计算失败：{error}
      </div>
    );
  }

  if (!hasAnyGoals) {
    return (
      <div className="space-y-3">
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          目标仪表盘
        </h3>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center">
          <Target className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 mb-3">还没有量化或重复型目标</p>
          {onAddGoal && (
            <button
              onClick={onAddGoal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500 hover:bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              <Target className="w-3 h-3" />
              设置目标
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 量化型仪表盘 */}
      {filteredData.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            量化仪表盘
          </h3>
          {filteredData.map((result) => (
            <EngineCard key={result.goal_id} result={result} />
          ))}
        </div>
      )}

      {/* 重复型仪表盘 */}
      {filteredRepeatData.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5" />
            重复型目标
          </h3>
          {filteredRepeatData.map((result) => (
            <RepeatGoalCard key={result.goal_id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// 单个目标的引擎卡片
// ============================================

function EngineCard({ result }: { result: GoalEngineResult }) {
  const {
    goal_title, unit, daily_target,
    total_passed_days, remaining_days,
    today_actual,
    total_expected, total_actual, deficit,
    completion_rate,
    daily_average, avg_7d, avg_30d,
    total_target, dynamic_daily_pacer,
    weekly_target, monthly_target,
    weekly_projection, monthly_projection,
  } = result;

  // 颜色逻辑
  const deficitColor = deficit < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold';
  const rateColor = completion_rate < 0.5
    ? 'text-red-500'
    : completion_rate < 0.8
      ? 'text-amber-500'
      : 'text-emerald-600';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm p-4 space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Target className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <span className="text-sm font-semibold text-slate-800">{goal_title}</span>
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          坚持第 {total_passed_days} 天
        </span>
      </div>

      {/* 核心差额（最醒目位置） */}
      <div className="bg-slate-50/80 rounded-xl p-3 text-center border border-slate-100">
        <div className="text-[10px] text-slate-400 mb-1">合计差值</div>
        <div className={`text-2xl tabular-nums ${deficitColor}`}>
          {formatNumber(deficit)} <span className="text-sm font-normal">{unit}</span>
        </div>
      </div>

      {/* 网格指标 */}
      <div className="grid grid-cols-3 gap-1.5">
        <MetricCell label="今日进度" value={`${formatNumber(today_actual)} / ${formatNumber(daily_target)}`} unit={unit} />
        <MetricCell label="每日平均" value={formatNumber(daily_average, 2)} unit={unit} />
        <MetricCell
          label="进度"
          value={`${(completion_rate * 100).toFixed(1)}%`}
          className={rateColor}
        />

        <MetricCell label="近7日均" value={formatNumber(avg_7d, 2)} unit={unit} />
        <MetricCell label="近30日均" value={formatNumber(avg_30d, 2)} unit={unit} />
        <MetricCell label="合计应当" value={formatNumber(total_expected)} unit={unit} />

        <MetricCell label="完成总值" value={formatNumber(total_actual)} unit={unit} />
        <MetricCell label="每周目标" value={formatNumber(weekly_target)} unit={unit} />
        <MetricCell label="每月目标" value={formatNumber(monthly_target)} unit={unit} />

        <MetricCell label="周预计" value={formatNumber(weekly_projection, 1)} unit={unit} />
        <MetricCell label="月预计" value={formatNumber(monthly_projection, 1)} unit={unit} />
      </div>

      {/* 预计天数（客观推算） */}
      {remaining_days !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500">
            按当前速度（{formatNumber(avg_30d > 0 ? avg_30d : daily_average, 1)}{unit}/天），预计还需
            <span className="font-medium text-slate-700 ml-1">{remaining_days} 天</span>
            达成目标
          </span>
        </div>
      )}

      {/* 配速器（可选） */}
      {dynamic_daily_pacer !== null && total_target !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          {dynamic_daily_pacer > daily_target ? (
            <TrendingUp className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="text-slate-500">
            动态配速：要达成目标（{formatNumber(total_target)}{unit}），每日需完成
            <span className={`font-medium ml-1 ${dynamic_daily_pacer > daily_target ? 'text-orange-500' : 'text-emerald-600'}`}>
              {formatNumber(dynamic_daily_pacer, 1)} {unit}/天
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// 辅助组件
// ============================================

function MetricCell({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  className?: string;
}) {
  return (
    <div className="text-center py-1.5 rounded-lg bg-slate-50/50">
      <div className="text-[9px] text-slate-400 mb-0.5">{label}</div>
      <div className={`text-xs tabular-nums font-medium ${className || 'text-slate-700'}`}>
        {value}
        {unit && <span className="text-[9px] text-slate-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

/** 格式化数字：千分位 + 可选小数位 */
function formatNumber(n: number, decimals = 0): string {
  if (decimals > 0) {
    return n.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return Math.round(n).toLocaleString('zh-CN');
}
