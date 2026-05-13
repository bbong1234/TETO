'use client';

import { useState } from 'react';
import {
  Loader2, Target, Plus, Trash2, Pencil,
  CheckCircle2, PauseCircle, XCircle, Circle, FileEdit,
  BarChart3, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useGoalEngine } from '@/lib/hooks/useGoalEngine';
import type { GoalEngineResult, Goal, GoalStatus, GoalRuleType, SubItem } from '@/types/teto';
import GoalForm from './GoalForm';

// ── 常量 ──

const STATUS_COLORS: Record<GoalStatus, string> = {
  '草稿': 'bg-slate-100 text-slate-500',
  '进行中': 'bg-green-100 text-green-700',
  '已完成': 'bg-blue-100 text-blue-700',
  '暂停': 'bg-yellow-100 text-yellow-700',
  '放弃': 'bg-slate-100 text-slate-500',
};

const STATUS_ICONS: Record<GoalStatus, React.ReactNode> = {
  '草稿': <FileEdit className="h-3 w-3" />,
  '进行中': <Circle className="h-3 w-3" />,
  '已完成': <CheckCircle2 className="h-3 w-3" />,
  '暂停': <PauseCircle className="h-3 w-3" />,
  '放弃': <XCircle className="h-3 w-3" />,
};

const RULE_TYPE_STYLES: Record<GoalRuleType, { label: string; icon: string; color: string; border: string }> = {
  '一次性完成': { label: '一次性', icon: '🎯', color: 'bg-blue-100 text-blue-600', border: 'border-l-blue-400' },
  '周期性达成': { label: '周期达成', icon: '🔄', color: 'bg-emerald-100 text-emerald-600', border: 'border-l-emerald-400' },
  '周期性限制': { label: '限制', icon: '🚫', color: 'bg-red-100 text-red-600', border: 'border-l-red-400' },
};

// ── Props ──

interface UnifiedGoalPanelProps {
  itemId: string;
  goals: Goal[];
  subItems?: SubItem[];
  activeSubItemId?: string | null;
  phases?: { id: string; title: string }[];
  refreshKey?: number;
  onGoalChanged: () => void;
  onError: (message: string) => void;
}

// ── 主组件 ──

export default function UnifiedGoalPanel({
  itemId, goals, subItems, activeSubItemId, phases, refreshKey,
  onGoalChanged, onError,
}: UnifiedGoalPanelProps) {
  const { data: engineData, loading, error } = useGoalEngine(itemId, refreshKey);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 按 goal_id 索引引擎数据
  const engineMap = new Map(engineData.map(r => [r.goal_id, r]));

  // 按 goal_id 索引 sub_item_id
  const goalSubItemMap = new Map(goals?.map(g => [g.id, g.sub_item_id]) || []);

  // 筛选当前视图下的目标
  const visibleGoals = activeSubItemId
    ? goals.filter(g => g.sub_item_id === activeSubItemId || (!g.sub_item_id && g.rule_type === '一次性完成'))
    : goals;

  // 分组：草稿 vs 正式目标
  const draftGoals = visibleGoals.filter(g => g.status === '草稿');
  const activeGoals = visibleGoals.filter(g => g.status !== '草稿');

  // 在"全部"视图下，按子项分组正式目标
  const groupedActiveGoals = (() => {
    if (activeSubItemId || !subItems || subItems.length === 0) {
      return [{ label: '', goals: activeGoals }];
    }
    const groups: Array<{ label: string; goals: Goal[] }> = [];
    const itemLevelGoals = activeGoals.filter(g => !g.sub_item_id);
    if (itemLevelGoals.length > 0) groups.push({ label: '', goals: itemLevelGoals });
    for (const sub of subItems) {
      const subGoals = activeGoals.filter(g => g.sub_item_id === sub.id);
      if (subGoals.length > 0) groups.push({ label: sub.title, goals: subGoals });
    }
    return groups;
  })();

  const handleDelete = async (goal: Goal) => {
    if (!confirm(`确定删除目标「${goal.goal_text || goal.title}」？`)) return;
    setDeletingId(goal.id);
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}`, { method: 'DELETE' });
      if (res.ok) { onGoalChanged(); } else { const err = await res.json(); onError(err.error || '删除目标失败'); }
    } catch { onError('删除目标失败，请重试'); } finally { setDeletingId(null); }
  };

  const handleConfirmDraft = async (goal: Goal) => {
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) { onGoalChanged(); } else { const err = await res.json(); onError(err.error || '确认目标失败'); }
    } catch { onError('确认目标失败，请重试'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">计算引擎加载中...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500 py-4">引擎计算失败：{error}</div>;
  }

  return (
    <div className="space-y-3">
      {/* 草稿目标 */}
      {draftGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
            <FileEdit className="h-3 w-3" />待确认
          </p>
          {draftGoals.map(goal => (
            <UnifiedGoalCard
              key={goal.id}
              goal={goal}
              engineResult={engineMap.get(goal.id)}
              onEdit={g => { setEditingGoal(g); setShowGoalForm(true); }}
              onDelete={handleDelete}
              onConfirm={handleConfirmDraft}
              deletingId={deletingId}
              isDraft
            />
          ))}
        </div>
      )}

      {/* 按分组展示正式目标 */}
      {groupedActiveGoals.map(group => (
        <div key={group.label || '_item'} className="space-y-1.5">
          {group.label && (
            <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-indigo-400" />
              {group.label}
            </p>
          )}
          {group.goals.map(goal => (
            <UnifiedGoalCard
              key={goal.id}
              goal={goal}
              engineResult={engineMap.get(goal.id)}
              onEdit={g => { setEditingGoal(g); setShowGoalForm(true); }}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      ))}

      {/* 空状态 */}
      {visibleGoals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-5 text-center">
          <Target className="h-7 w-7 mx-auto text-slate-300 mb-2" />
          <p className="text-xs text-slate-400 mb-0.5">还没有目标</p>
          <p className="text-[10px] text-slate-300">点击上方按钮设置目标</p>
        </div>
      )}

      {/* 新建目标按钮 */}
      <button
        onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-2 text-xs font-medium text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />设置目标
      </button>

      {/* 目标表单 */}
      {showGoalForm && (
        <GoalForm
          goal={editingGoal}
          itemId={itemId}
          phases={phases}
          subItems={subItems}
          preselectedSubItemId={activeSubItemId}
          onClose={() => { setShowGoalForm(false); setEditingGoal(null); }}
          onSaved={() => { setShowGoalForm(false); setEditingGoal(null); onGoalChanged(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

// ============================================
// 统一目标卡片（合并引擎数据 + 管理操作）
// ============================================

function UnifiedGoalCard({
  goal, engineResult, onEdit, onDelete, onConfirm, deletingId, isDraft,
}: {
  goal: Goal;
  engineResult?: GoalEngineResult;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onConfirm?: (goal: Goal) => void;
  deletingId: string | null;
  isDraft?: boolean;
}) {
  const ruleStyle = RULE_TYPE_STYLES[goal.rule_type] || RULE_TYPE_STYLES['一次性完成'];

  return (
    <div className={`glass rounded-2xl p-3.5 shadow-soft border-l-2 ${ruleStyle.border} ${isDraft ? 'border-dashed opacity-75' : ''}`}>
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50/80 text-indigo-500 mt-0.5">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-medium text-slate-800 truncate">{goal.goal_text || goal.title}</p>
              <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}>
                {STATUS_ICONS[goal.status]}{goal.status}
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ruleStyle.color}`}>
                {ruleStyle.icon} {ruleStyle.label}
              </span>
            </div>
            {/* 规则摘要（不显示周期日期范围） */}
            <p className="text-[10px] text-slate-400 mt-0.5">
              {goal.operator === '<=' ? '不超过' : goal.operator === '>=' ? '至少' : goal.operator === 'complete' ? '完成即达标' : goal.operator}{' '}
              {goal.target_min ?? goal.target_max ?? ''}{goal.unit ? ` ${goal.unit}` : ''}
              {goal.deadline ? ` · 截止 ${goal.deadline}` : ''}
              {goal.metric_name ? ` · 指标: ${goal.metric_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isDraft && onConfirm && (
            <button onClick={() => onConfirm(goal)} className="p-1.5 rounded-lg hover:bg-green-50/60 text-slate-400 hover:text-green-500 transition-colors" title="确认目标">
              <CheckCircle2 className="h-3 w-3" />
            </button>
          )}
          <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-colors" title="编辑">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={() => onDelete(goal)} disabled={deletingId === goal.id} className="p-1.5 rounded-lg hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40" title="删除">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 引擎数据区域 */}
      {engineResult && goal.status !== '草稿' && (
        <EngineMetricsSection result={engineResult} goal={goal} />
      )}
    </div>
  );
}

// ============================================
// 引擎指标区域
// ============================================

function EngineMetricsSection({ result, goal }: { result: GoalEngineResult; goal: Goal }) {
  const { rule_type } = result;

  if (rule_type === '周期性限制') {
    return <LimitMetrics result={result} />;
  }
  if (rule_type === '周期性达成') {
    return <PeriodicAchieveMetrics result={result} goal={goal} />;
  }
  return <OneTimeMetrics result={result} />;
}

// ── 一次性完成 ──

function OneTimeMetrics({ result }: { result: GoalEngineResult }) {
  const {
    unit,
    total_actual, total_target,
    daily_average, avg_7d, avg_30d,
    deficit, deficit_7d, deficit_30d,
    completion_rate, completion_rate_7d, completion_rate_30d,
    remaining_days, dynamic_daily_pacer,
  } = result;

  // 如果没有量化数据，只显示完成进度条
  if (total_target === null && daily_average === null) {
    if (completion_rate !== null) {
      return <CompletionBar rate={completion_rate} />;
    }
    return null;
  }

  const hasMetrics = daily_average !== null || avg_7d !== null;
  const hasDeficit = deficit !== null || deficit_7d !== null;
  const hasCompletion = completion_rate !== null || completion_rate_7d !== null;

  return (
    <div className="mt-3 space-y-2.5">
      {/* 总差额 + 总完成度 突出展示 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2.5 text-center">
          <div className="text-[10px] text-slate-400 mb-1">总差额</div>
          <div className={`text-lg tabular-nums font-bold ${deficit !== null && deficit < 0 ? 'text-red-500' : deficit !== null && deficit > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
            {deficit !== null ? fmtNum(deficit) : '0'}
            {unit && <span className="text-[10px] font-normal text-slate-400 ml-0.5">{unit}</span>}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2.5 text-center">
          <div className="text-[10px] text-slate-400 mb-1">总完成度</div>
          <div className={`text-lg tabular-nums font-bold ${completion_rate !== null ? (completion_rate >= 1 ? 'text-emerald-600' : completion_rate < 0.7 ? 'text-orange-500' : 'text-slate-700') : 'text-slate-700'}`}>
            {completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '0%'}
          </div>
          {/* 迷你进度条 */}
          {completion_rate !== null && (
            <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${completion_rate >= 1 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.min(100, completion_rate * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 均值 / 差额 / 完成度 垂直三行布局 */}
      {(hasMetrics || hasDeficit || hasCompletion) && (
        <div className="space-y-1.5">
          {/* 第一行：近7日 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">近7日</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {hasMetrics && <MetricCell label="均值" value={avg_7d !== null ? fmtNum(avg_7d) : '0'} unit={unit} />}
              {hasDeficit && <MetricCell label="差额" value={deficit_7d !== null ? fmtNum(deficit_7d) : '0'} unit={unit} valueColor={deficit_7d !== null && deficit_7d < 0 ? 'text-red-500' : deficit_7d !== null && deficit_7d > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate_7d !== null ? `${(completion_rate_7d * 100).toFixed(0)}%` : '0%'} valueColor={completion_rate_7d !== null ? (completion_rate_7d >= 1 ? 'text-emerald-600' : completion_rate_7d < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>

          {/* 第二行：近30日 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">近30日</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {hasMetrics && <MetricCell label="均值" value={avg_30d !== null ? fmtNum(avg_30d) : '0'} unit={unit} />}
              {hasDeficit && <MetricCell label="差额" value={deficit_30d !== null ? fmtNum(deficit_30d) : '0'} unit={unit} valueColor={deficit_30d !== null && deficit_30d < 0 ? 'text-red-500' : deficit_30d !== null && deficit_30d > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate_30d !== null ? `${(completion_rate_30d * 100).toFixed(0)}%` : '0%'} valueColor={completion_rate_30d !== null ? (completion_rate_30d >= 1 ? 'text-emerald-600' : completion_rate_30d < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>

          {/* 第三行：总 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">总</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {hasMetrics && <MetricCell label="日均" value={daily_average !== null ? fmtNum(daily_average) : '0'} unit={unit} />}
              {hasDeficit && <MetricCell label="差额" value={deficit !== null ? fmtNum(deficit) : '0'} unit={unit} valueColor={deficit !== null && deficit < 0 ? 'text-red-500' : deficit !== null && deficit > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '0%'} valueColor={completion_rate !== null ? (completion_rate >= 1 ? 'text-emerald-600' : completion_rate < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>
        </div>
      )}

      {/* 配速器 */}
      {remaining_days !== null && dynamic_daily_pacer !== null && total_target !== null && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
          {dynamic_daily_pacer > (daily_average || 0) ? (
            <TrendingUp className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="text-slate-500">
            剩余 <span className="font-medium text-slate-700">{remaining_days}天</span>
            ，每日需 <span className={`font-medium ${dynamic_daily_pacer > (daily_average || 0) ? 'text-orange-500' : 'text-emerald-600'}`}>{fmtNum(dynamic_daily_pacer)} {unit}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── 周期性达成 ──

function PeriodicAchieveMetrics({ result, goal }: { result: GoalEngineResult; goal: Goal }) {
  const {
    unit,
    current_period_actual, current_period_target, current_period_progress,
    daily_average, avg_7d, avg_30d,
    deficit, deficit_7d, deficit_30d,
    completion_rate, completion_rate_7d, completion_rate_30d,
  } = result;

  const hasNumericMetric = goal.metric_name || daily_average !== null;
  const hasDeficit = deficit !== null || deficit_7d !== null;
  const hasCompletion = completion_rate !== null || completion_rate_7d !== null;

  return (
    <div className="mt-3 space-y-2.5">
      {/* 当前周期进度 */}
      <CompletionBar rate={current_period_progress} actual={current_period_actual} target={current_period_target} unit={unit} />

      {/* 量化指标分组容器 */}
      {/* 量化指标 垂直三行布局 */}
      {hasNumericMetric && (
        <div className="space-y-1.5">
          {/* 第一行：近7日 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">近7日</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <MetricCell label="均值" value={avg_7d !== null ? fmtNum(avg_7d) : '0'} unit={unit} />
              {hasDeficit && <MetricCell label="差额" value={deficit_7d !== null ? fmtNum(deficit_7d) : '0'} unit={unit} valueColor={deficit_7d !== null && deficit_7d < 0 ? 'text-red-500' : deficit_7d !== null && deficit_7d > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate_7d !== null ? `${(completion_rate_7d * 100).toFixed(0)}%` : '0%'} valueColor={completion_rate_7d !== null ? (completion_rate_7d >= 1 ? 'text-emerald-600' : completion_rate_7d < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>

          {/* 第二行：近30日 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">近30日</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <MetricCell label="均值" value={avg_30d !== null ? fmtNum(avg_30d) : '0'} unit={unit} />
              {hasDeficit && <MetricCell label="差额" value={deficit_30d !== null ? fmtNum(deficit_30d) : '0'} unit={unit} valueColor={deficit_30d !== null && deficit_30d < 0 ? 'text-red-500' : deficit_30d !== null && deficit_30d > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate_30d !== null ? `${(completion_rate_30d * 100).toFixed(0)}%` : '0%'} valueColor={completion_rate_30d !== null ? (completion_rate_30d >= 1 ? 'text-emerald-600' : completion_rate_30d < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>

          {/* 第三行：总 */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 px-2 py-1.5">
            <p className="text-[9px] text-slate-400 font-medium mb-1">总</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <MetricCell label="日均" value={daily_average !== null ? fmtNum(daily_average) : '—'} unit={unit} />
              {hasDeficit && <MetricCell label="差额" value={deficit !== null ? fmtNum(deficit) : '—'} unit={deficit !== null ? unit : undefined} valueColor={deficit !== null && deficit < 0 ? 'text-red-500' : deficit !== null && deficit > 0 ? 'text-emerald-600' : undefined} />}
              {hasCompletion && <MetricCell label="完成度" value={completion_rate !== null ? `${(completion_rate * 100).toFixed(0)}%` : '—'} valueColor={completion_rate !== null ? (completion_rate >= 1 ? 'text-emerald-600' : completion_rate < 0.7 ? 'text-orange-500' : undefined) : undefined} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 周期性限制 ──

function LimitMetrics({ result }: { result: GoalEngineResult }) {
  const { unit, current_period_actual, current_period_target, is_over_limit, remaining_budget, projected_period_total } = result;
  const usagePercent = current_period_target > 0 ? (current_period_actual / current_period_target) * 100 : 0;
  const barColor = is_over_limit ? 'bg-red-500' : usagePercent >= 80 ? 'bg-orange-400' : usagePercent >= 50 ? 'bg-yellow-400' : 'bg-emerald-400';

  return (
    <div className="mt-3 space-y-2.5">
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
        <MetricCell label="剩余预算" value={remaining_budget !== null ? fmtNum(remaining_budget) : '0'} unit={unit} valueColor={remaining_budget !== null && remaining_budget < 0 ? 'text-red-500' : undefined} />
        {projected_period_total !== null && (
          <MetricCell label="预计本期" value={fmtNum(projected_period_total)} unit={unit} valueColor={projected_period_total > current_period_target ? 'text-orange-500' : undefined} />
        )}
      </div>
    </div>
  );
}

// ============================================
// 辅助组件
// ============================================

function CompletionBar({ rate, actual, target, unit }: { rate: number; actual?: number; target?: number; unit?: string }) {
  const pct = Math.round(rate * 100);
  const isAchieved = rate >= 1;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
        <span>{actual !== undefined && target !== undefined ? `${actual} / ${target} ${unit || ''}` : ''}</span>
        <span className={`font-medium ${isAchieved ? 'text-emerald-600' : ''}`}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isAchieved ? 'bg-emerald-400' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function MetricCell({ label, value, unit, valueColor }: { label: string; value: string; unit?: string; valueColor?: string }) {
  return (
    <div className="text-center py-1.5 rounded-lg bg-slate-50/50">
      <div className="text-[9px] text-slate-400 mb-0.5">{label}</div>
      <div className={`text-xs tabular-nums font-medium ${valueColor || 'text-slate-700'}`}>
        {value}
        {unit && <span className="text-[9px] text-slate-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function fmtNum(n: number, decimals?: number): string {
  if (decimals !== undefined && decimals > 0) {
    return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  if (n % 1 !== 0) {
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('zh-CN');
}
