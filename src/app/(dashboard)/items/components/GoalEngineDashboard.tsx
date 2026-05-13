'use client';

import { Loader2, TrendingDown, TrendingUp, Target, Calendar, BarChart3, AlertTriangle } from 'lucide-react';
import { useGoalEngine } from '@/lib/hooks/useGoalEngine';
import type { GoalEngineResult, GoalRuleType } from '@/types/teto';

/**
 * 统一目标引擎仪表盘
 * 展示事项下所有目标的核心指标（一次性完成/周期性达成/周期性限制）
 */
export default function GoalEngineDashboard({ itemId, onAddGoal, activeSubItemId, goals }: { itemId: string; onAddGoal?: () => void; activeSubItemId?: string | null; goals?: { id: string; sub_item_id?: string | null; rule_type?: string }[] }) {
  const { data, loading, error } = useGoalEngine(itemId);

  // 按子项筛选
  const goalSubItemMap = new Map(goals?.map(g => [g.id, g.sub_item_id]) || []);
  const filteredData = activeSubItemId
    ? data.filter(r => goalSubItemMap.get(r.goal_id) === activeSubItemId)
    : data;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">计算引擎加载中...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500 py-4">引擎计算失败：{error}</div>;
  }

  if (filteredData.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          目标仪表盘
        </h3>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center">
          <Target className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 mb-3">还没有量化目标</p>
          {onAddGoal && (
            <button onClick={onAddGoal} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500 hover:bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors">
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
      <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        目标仪表盘
      </h3>
      {filteredData.map((result) => (
        <UnifiedEngineCard key={result.goal_id} result={result} />
      ))}
    </div>
  );
}

// ============================================
// 统一引擎卡片
// ============================================

function UnifiedEngineCard({ result }: { result: GoalEngineResult }) {
  const { rule_type } = result;

  if (rule_type === '周期性限制') {
    return <LimitEngineCard result={result} />;
  }
  if (rule_type === '周期性达成') {
    return <PeriodicAchieveCard result={result} />;
  }
  // 一次性完成
  return <OneTimeEngineCard result={result} />;
}

// ── 一次性完成卡片 ──

function OneTimeEngineCard({ result }: { result: GoalEngineResult }) {
  const {
    goal_title, unit,
    total_passed_days, remaining_days,
    today_actual, total_actual, total_target,
    completion_rate, deficit,
    daily_average, avg_7d, avg_30d,
    dynamic_daily_pacer,
  } = result;

  const dp = total_target && total_target % 1 !== 0 ? 2 : 0;
  const deficitColor = deficit !== null && deficit < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-xs">🎯</div>
          <span className="text-sm font-semibold text-slate-800">{goal_title}</span>
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          第 {total_passed_days} 天
        </span>
      </div>

      {deficit !== null && (
        <div className="bg-slate-50/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[10px] text-slate-400 mb-1">差值</div>
          <div className={`text-2xl tabular-nums ${deficitColor}`}>
            {formatNumber(deficit, dp)} <span className="text-sm font-normal">{unit}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <MetricCell label="今日" value={`${formatNumber(today_actual, dp)}`} unit={unit} />
        <MetricCell label="日均" value={daily_average !== null ? formatNumber(daily_average, 2) : '0'} unit={daily_average !== null ? unit : undefined} />
        <MetricCell label="进度" value={completion_rate !== null ? `${(completion_rate * 100).toFixed(1)}%` : '0%'} />
        {avg_7d !== null && <MetricCell label="近7日均" value={formatNumber(avg_7d, 2)} unit={unit} />}
        {avg_30d !== null && <MetricCell label="近30日均" value={formatNumber(avg_30d, 2)} unit={unit} />}
        {total_target !== null && <MetricCell label="目标" value={formatNumber(total_target, dp)} unit={unit} />}
      </div>

      {remaining_days !== null && total_actual !== undefined && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500">
            剩余 <span className="font-medium text-slate-700">{remaining_days} 天</span>
          </span>
        </div>
      )}

      {dynamic_daily_pacer !== null && total_target !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          {dynamic_daily_pacer > (daily_average || 0) ? (
            <TrendingUp className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="text-slate-500">
            配速：每日需 <span className={`font-medium ${dynamic_daily_pacer > (daily_average || 0) ? 'text-orange-500' : 'text-emerald-600'}`}>{formatNumber(dynamic_daily_pacer, 1)} {unit}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── 周期性达成卡片 ──

function PeriodicAchieveCard({ result }: { result: GoalEngineResult }) {
  const {
    goal_title, unit,
    current_period_start, current_period_end,
    current_period_actual, current_period_target, current_period_progress,
    avg_7d, avg_30d,
  } = result;

  const progressPercent = Math.round(current_period_progress * 100);
  const isAchieved = current_period_progress >= 1;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-xs">🔄</div>
          <span className="text-sm font-semibold text-slate-800">{goal_title}</span>
        </div>
        <span className={`text-[10px] font-medium ${isAchieved ? 'text-emerald-600' : 'text-slate-400'}`}>
          {isAchieved ? '已达成 ✓' : `${progressPercent}%`}
        </span>
      </div>

      {/* 进度条 */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>{current_period_actual} / {current_period_target} {unit}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isAchieved ? 'bg-emerald-400' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, progressPercent)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {avg_7d !== null && <MetricCell label="7天日均" value={formatNumber(avg_7d, 1)} unit={unit} />}
        {avg_30d !== null && <MetricCell label="30天日均" value={formatNumber(avg_30d, 1)} unit={unit} />}
        <MetricCell label="周期" value={`${current_period_start?.slice(5) || ''}~${current_period_end?.slice(5) || ''}`} />
      </div>
    </div>
  );
}

// ── 周期性限制卡片 ──

function LimitEngineCard({ result }: { result: GoalEngineResult }) {
  const {
    goal_title, unit,
    current_period_actual, current_period_target,
    is_over_limit, remaining_budget, projected_period_total,
  } = result;

  const usagePercent = current_period_target > 0 ? (current_period_actual / current_period_target) * 100 : 0;
  const barColor = is_over_limit ? 'bg-red-500' : usagePercent >= 80 ? 'bg-orange-400' : usagePercent >= 50 ? 'bg-yellow-400' : 'bg-emerald-400';

  return (
    <div className={`rounded-2xl border shadow-sm p-4 space-y-3 ${is_over_limit ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white/80'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center text-xs">🚫</div>
          <span className="text-sm font-semibold text-slate-800">{goal_title}</span>
        </div>
        {is_over_limit && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" />
            超限
          </span>
        )}
      </div>

      {/* 用量进度条 */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>{current_period_actual} / {current_period_target} {unit}</span>
          <span>{Math.round(usagePercent)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, usagePercent)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCell label="剩余预算" value={`${remaining_budget !== null ? formatNumber(remaining_budget, 0) : '0'}`} unit={unit} className={remaining_budget !== null && remaining_budget < 0 ? 'text-red-500' : ''} />
        {projected_period_total !== null && (
          <MetricCell label="预计本期" value={formatNumber(projected_period_total, 0)} unit={unit} className={projected_period_total > current_period_target ? 'text-orange-500' : ''} />
        )}
      </div>
    </div>
  );
}

// ── 辅助组件 ──

function MetricCell({ label, value, unit, className }: { label: string; value: string; unit?: string; className?: string }) {
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

function formatNumber(n: number, decimals?: number): string {
  if (decimals !== undefined && decimals > 0) {
    return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  if (n % 1 !== 0) {
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('zh-CN');
}
