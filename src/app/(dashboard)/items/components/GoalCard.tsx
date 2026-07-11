'use client';

import {
  Target,
  Trash2,
  Pencil,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Circle,
  FileEdit,
  TrendingUp,
  TrendingDown,
  Flag,
} from 'lucide-react';
import type {
  GoalEngineResult,
  Goal,
  GoalStatus,
  GoalRuleType,
  Record as TetoRecord,
} from '@/types/teto';

// ── 常量 ──

export const STATUS_COLORS: Record<GoalStatus, string> = {
  草稿: 'bg-slate-100 text-slate-500',
  进行中: 'bg-green-100 text-green-700',
  已完成: 'bg-blue-100 text-blue-700',
  暂停: 'bg-yellow-100 text-yellow-700',
  放弃: 'bg-slate-100 text-slate-500',
};

export const STATUS_ICONS: Record<GoalStatus, React.ReactNode> = {
  草稿: <FileEdit className="h-3 w-3" />,
  进行中: <Circle className="h-3 w-3" />,
  已完成: <CheckCircle2 className="h-3 w-3" />,
  暂停: <PauseCircle className="h-3 w-3" />,
  放弃: <XCircle className="h-3 w-3" />,
};

export const RULE_TYPE_STYLES: Record<
  GoalRuleType,
  { label: string; icon: string; color: string; border: string }
> = {
  一次性完成: {
    label: '一次性',
    icon: '🎯',
    color: 'bg-blue-100 text-blue-600',
    border: 'border-l-blue-400',
  },
  周期性达成: {
    label: '周期达成',
    icon: '🔄',
    color: 'bg-emerald-100 text-emerald-600',
    border: 'border-l-emerald-400',
  },
  周期性限制: {
    label: '限制',
    icon: '🚫',
    color: 'bg-red-100 text-red-600',
    border: 'border-l-red-400',
  },
};

export interface UnifiedGoalCardProps {
  goal: Goal;
  engineResult?: GoalEngineResult;
  linkedRecord?: TetoRecord;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goal: Goal) => void;
  onConfirm?: (goal: Goal) => void;
  onTransition?: (goal: Goal) => void;
  onRecordOpen?: (record: TetoRecord) => void;
  deletingId?: string | null;
  isDraft?: boolean;
  readOnly?: boolean;
}

export function UnifiedGoalCard({
  goal,
  engineResult,
  linkedRecord,
  onEdit,
  onDelete,
  onConfirm,
  onTransition,
  onRecordOpen,
  deletingId = null,
  isDraft,
  readOnly = false,
}: UnifiedGoalCardProps) {
  const ruleStyle = RULE_TYPE_STYLES[goal.rule_type] || RULE_TYPE_STYLES['一次性完成'];
  const canTransition =
    !readOnly && !isDraft && (goal.status === '进行中' || goal.status === '暂停');
  const showLinkedRecord =
    linkedRecord && ['暂停', '已完成', '放弃'].includes(goal.status);

  return (
    <div
      className={`glass rounded-2xl p-3.5 shadow-soft border-l-2 ${ruleStyle.border} ${isDraft ? 'border-dashed opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50/80 text-indigo-500">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-medium text-slate-800">
                {goal.goal_text || goal.title}
              </p>
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}
              >
                {STATUS_ICONS[goal.status]}
                {goal.status}
              </span>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ruleStyle.color}`}
              >
                {ruleStyle.icon} {ruleStyle.label}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {goal.operator === '<='
                ? '不超过'
                : goal.operator === '>='
                  ? '至少'
                  : goal.operator === 'complete'
                    ? '完成即达标'
                    : goal.operator}{' '}
              {goal.target_min ?? goal.target_max ?? ''}
              {goal.unit ? ` ${goal.unit}` : ''}
              {goal.deadline ? ` · 截止 ${goal.deadline}` : ''}
              {goal.metric_name ? ` · 指标: ${goal.metric_name}` : ''}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-0.5">
            {canTransition && onTransition && (
              <button
                type="button"
                onClick={() => onTransition(goal)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50/60 hover:text-indigo-500"
                title="更新状态"
              >
                <Flag className="h-3 w-3" />
              </button>
            )}
            {isDraft && onConfirm && (
              <button
                type="button"
                onClick={() => onConfirm(goal)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-green-50/60 hover:text-green-500"
                title="确认目标"
              >
                <CheckCircle2 className="h-3 w-3" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(goal)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/60 hover:text-indigo-500"
                title="编辑"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(goal)}
                disabled={deletingId === goal.id}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50/60 hover:text-red-500 disabled:opacity-40"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {engineResult && goal.status !== '草稿' && (
        <EngineMetricsSection result={engineResult} goal={goal} />
      )}

      {showLinkedRecord && linkedRecord && (
        <button
          type="button"
          onClick={() => onRecordOpen?.(linkedRecord)}
          className="mt-3 w-full rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition-colors hover:bg-slate-50"
        >
          <p className="mb-0.5 text-[10px] text-slate-400">最近进展说明</p>
          <p className="line-clamp-2 text-xs text-slate-700">{linkedRecord.content}</p>
          <p className="mt-1 text-[10px] text-slate-400">
            {linkedRecord.date ||
              linkedRecord.time_anchor_date ||
              linkedRecord.created_at.slice(0, 10)}
          </p>
        </button>
      )}
    </div>
  );
}

function EngineMetricsSection({ result, goal }: { result: GoalEngineResult; goal: Goal }) {
  if (result.rule_type === '周期性限制') return <LimitMetrics result={result} />;
  if (result.rule_type === '周期性达成')
    return <PeriodicAchieveMetrics result={result} goal={goal} />;
  return <OneTimeMetrics result={result} />;
}

function OneTimeMetrics({ result }: { result: GoalEngineResult }) {
  const {
    unit,
    total_target,
    daily_average,
    avg_7d,
    avg_30d,
    deficit,
    deficit_7d,
    deficit_30d,
    completion_rate,
    completion_rate_7d,
    completion_rate_30d,
    remaining_days,
    dynamic_daily_pacer,
  } = result;

  if (total_target === null && daily_average === null) {
    if (completion_rate !== null) return <CompletionBar rate={completion_rate} />;
    return null;
  }

  const hasMetrics = daily_average !== null || avg_7d !== null;
  const hasDeficit = deficit !== null || deficit_7d !== null;
  const hasCompletion = completion_rate !== null || completion_rate_7d !== null;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center">
          <div className="mb-1 text-[10px] text-slate-400">总差额</div>
          <div
            className={`text-lg font-bold tabular-nums ${deficit !== null && deficit < 0 ? 'text-red-500' : deficit !== null && deficit > 0 ? 'text-emerald-600' : 'text-slate-700'}`}
          >
            {deficit !== null ? fmtNum(deficit) : '0'}
            {unit && <span className="ml-0.5 text-[10px] font-normal text-slate-400">{unit}</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center">
          <div className="mb-1 text-[10px] text-slate-400">总完成度</div>
          <div
            className={`text-lg font-bold tabular-nums ${completion_rate !== null ? (completion_rate >= 1 ? 'text-emerald-600' : completion_rate < 0.7 ? 'text-orange-500' : 'text-slate-700') : 'text-slate-700'}`}
          >
            {completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '0%'}
          </div>
          {completion_rate !== null && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${completion_rate >= 1 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.min(100, completion_rate * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {(hasMetrics || hasDeficit || hasCompletion) && (
        <div className="space-y-1.5">
          <MetricRow label="近7日">
            {hasMetrics && (
              <MetricCell label="均值" value={avg_7d !== null ? fmtNum(avg_7d) : '0'} unit={unit} />
            )}
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit_7d !== null ? fmtNum(deficit_7d) : '0'}
                unit={unit}
                valueColor={
                  deficit_7d !== null && deficit_7d < 0
                    ? 'text-red-500'
                    : deficit_7d !== null && deficit_7d > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate_7d !== null ? `${(completion_rate_7d * 100).toFixed(0)}%` : '0%'
                }
                valueColor={
                  completion_rate_7d !== null
                    ? completion_rate_7d >= 1
                      ? 'text-emerald-600'
                      : completion_rate_7d < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
          <MetricRow label="近30日">
            {hasMetrics && (
              <MetricCell label="均值" value={avg_30d !== null ? fmtNum(avg_30d) : '0'} unit={unit} />
            )}
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit_30d !== null ? fmtNum(deficit_30d) : '0'}
                unit={unit}
                valueColor={
                  deficit_30d !== null && deficit_30d < 0
                    ? 'text-red-500'
                    : deficit_30d !== null && deficit_30d > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate_30d !== null
                    ? `${(completion_rate_30d * 100).toFixed(0)}%`
                    : '0%'
                }
                valueColor={
                  completion_rate_30d !== null
                    ? completion_rate_30d >= 1
                      ? 'text-emerald-600'
                      : completion_rate_30d < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
          <MetricRow label="总">
            {hasMetrics && (
              <MetricCell
                label="日均"
                value={daily_average !== null ? fmtNum(daily_average) : '0'}
                unit={unit}
              />
            )}
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit !== null ? fmtNum(deficit) : '0'}
                unit={unit}
                valueColor={
                  deficit !== null && deficit < 0
                    ? 'text-red-500'
                    : deficit !== null && deficit > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '0%'
                }
                valueColor={
                  completion_rate !== null
                    ? completion_rate >= 1
                      ? 'text-emerald-600'
                      : completion_rate < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
        </div>
      )}

      {remaining_days !== null && dynamic_daily_pacer !== null && total_target !== null && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
          {dynamic_daily_pacer > (daily_average || 0) ? (
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="text-slate-500">
            剩余 <span className="font-medium text-slate-700">{remaining_days}天</span>，每日需{' '}
            <span
              className={`font-medium ${dynamic_daily_pacer > (daily_average || 0) ? 'text-orange-500' : 'text-emerald-600'}`}
            >
              {fmtNum(dynamic_daily_pacer)} {unit}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function PeriodicAchieveMetrics({ result, goal }: { result: GoalEngineResult; goal: Goal }) {
  const {
    unit,
    current_period_actual,
    current_period_target,
    current_period_progress,
    daily_average,
    avg_7d,
    avg_30d,
    deficit,
    deficit_7d,
    deficit_30d,
    completion_rate,
    completion_rate_7d,
    completion_rate_30d,
  } = result;

  const hasNumericMetric = goal.metric_name || daily_average !== null;
  const hasDeficit = deficit !== null || deficit_7d !== null;
  const hasCompletion = completion_rate !== null || completion_rate_7d !== null;

  return (
    <div className="mt-3 space-y-2.5">
      <CompletionBar
        rate={current_period_progress}
        actual={current_period_actual}
        target={current_period_target}
        unit={unit}
      />
      {hasNumericMetric && (
        <div className="space-y-1.5">
          <MetricRow label="近7日">
            <MetricCell label="均值" value={avg_7d !== null ? fmtNum(avg_7d) : '0'} unit={unit} />
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit_7d !== null ? fmtNum(deficit_7d) : '0'}
                unit={unit}
                valueColor={
                  deficit_7d !== null && deficit_7d < 0
                    ? 'text-red-500'
                    : deficit_7d !== null && deficit_7d > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate_7d !== null ? `${(completion_rate_7d * 100).toFixed(0)}%` : '0%'
                }
                valueColor={
                  completion_rate_7d !== null
                    ? completion_rate_7d >= 1
                      ? 'text-emerald-600'
                      : completion_rate_7d < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
          <MetricRow label="近30日">
            <MetricCell label="均值" value={avg_30d !== null ? fmtNum(avg_30d) : '0'} unit={unit} />
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit_30d !== null ? fmtNum(deficit_30d) : '0'}
                unit={unit}
                valueColor={
                  deficit_30d !== null && deficit_30d < 0
                    ? 'text-red-500'
                    : deficit_30d !== null && deficit_30d > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate_30d !== null
                    ? `${(completion_rate_30d * 100).toFixed(0)}%`
                    : '0%'
                }
                valueColor={
                  completion_rate_30d !== null
                    ? completion_rate_30d >= 1
                      ? 'text-emerald-600'
                      : completion_rate_30d < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
          <MetricRow label="总">
            <MetricCell
              label="日均"
              value={daily_average !== null ? fmtNum(daily_average) : '—'}
              unit={unit}
            />
            {hasDeficit && (
              <MetricCell
                label="差额"
                value={deficit !== null ? fmtNum(deficit) : '—'}
                unit={deficit !== null ? unit : undefined}
                valueColor={
                  deficit !== null && deficit < 0
                    ? 'text-red-500'
                    : deficit !== null && deficit > 0
                      ? 'text-emerald-600'
                      : undefined
                }
              />
            )}
            {hasCompletion && (
              <MetricCell
                label="完成度"
                value={
                  completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '—'
                }
                valueColor={
                  completion_rate !== null
                    ? completion_rate >= 1
                      ? 'text-emerald-600'
                      : completion_rate < 0.7
                        ? 'text-orange-500'
                        : undefined
                    : undefined
                }
              />
            )}
          </MetricRow>
        </div>
      )}
    </div>
  );
}

function LimitMetrics({ result }: { result: GoalEngineResult }) {
  const {
    unit,
    current_period_actual,
    current_period_target,
    is_over_limit,
    remaining_budget,
    projected_period_total,
  } = result;
  const usagePercent =
    current_period_target > 0 ? (current_period_actual / current_period_target) * 100 : 0;
  const barColor = is_over_limit
    ? 'bg-red-500'
    : usagePercent >= 80
      ? 'bg-orange-400'
      : usagePercent >= 50
        ? 'bg-yellow-400'
        : 'bg-emerald-400';

  return (
    <div className="mt-3 space-y-2.5">
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
          <span>
            {current_period_actual} / {current_period_target} {unit}
          </span>
          <span>{Math.round(usagePercent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCell
          label="剩余预算"
          value={remaining_budget !== null ? fmtNum(remaining_budget) : '0'}
          unit={unit}
          valueColor={remaining_budget !== null && remaining_budget < 0 ? 'text-red-500' : undefined}
        />
        {projected_period_total !== null && (
          <MetricCell
            label="预计本期"
            value={fmtNum(projected_period_total)}
            unit={unit}
            valueColor={
              projected_period_total > current_period_target ? 'text-orange-500' : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function CompletionBar({
  rate,
  actual,
  target,
  unit,
}: {
  rate: number;
  actual?: number;
  target?: number;
  unit?: string;
}) {
  const pct = Math.round(rate * 100);
  const isAchieved = rate >= 1;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {actual !== undefined && target !== undefined
            ? `${actual} / ${target} ${unit || ''}`
            : ''}
        </span>
        <span className={`font-medium ${isAchieved ? 'text-emerald-600' : ''}`}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${isAchieved ? 'bg-emerald-400' : 'bg-indigo-400'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
      <p className="mb-1 text-[9px] font-medium text-slate-400">{label}</p>
      <div className="grid grid-cols-3 gap-1 text-center">{children}</div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  unit,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50/50 py-1.5 text-center">
      <div className="mb-0.5 text-[9px] text-slate-400">{label}</div>
      <div className={`text-xs font-medium tabular-nums ${valueColor || 'text-slate-700'}`}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function fmtNum(n: number, decimals?: number): string {
  if (decimals !== undefined && decimals > 0) {
    return n.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  if (n % 1 !== 0) {
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('zh-CN');
}

/** @deprecated 使用 UnifiedGoalCard */
export default UnifiedGoalCard;
