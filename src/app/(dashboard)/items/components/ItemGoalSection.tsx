'use client';

import { useState } from 'react';
import { Target, Plus, Trash2, Pencil, CheckCircle2, PauseCircle, XCircle, Circle, FileEdit } from 'lucide-react';
import type { Goal, GoalStatus, SubItem, GoalRuleType } from '@/types/teto';
import GoalForm from './GoalForm';

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

interface ItemGoalSectionProps {
  itemId: string;
  goals: Goal[];
  subItems?: SubItem[];
  activeSubItemId?: string | null;
  phases?: { id: string; title: string }[];
  onGoalChanged: () => void;
  onError: (message: string) => void;
}

export default function ItemGoalSection({ itemId, goals, subItems, activeSubItemId, phases, onGoalChanged, onError }: ItemGoalSectionProps) {
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (goal: Goal) => {
    if (!confirm(`确定删除目标「${goal.goal_text || goal.title}」？`)) return;
    setDeletingId(goal.id);
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}`, { method: 'DELETE' });
      if (res.ok) {
        onGoalChanged();
      } else {
        const err = await res.json();
        onError(err.error || '删除目标失败');
      }
    } catch {
      onError('删除目标失败，请重试');
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmDraft = async (goal: Goal) => {
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onGoalChanged();
      } else {
        const err = await res.json();
        onError(err.error || '确认目标失败');
      }
    } catch {
      onError('确认目标失败，请重试');
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowGoalForm(true);
  };

  const handleFormSaved = () => {
    setShowGoalForm(false);
    setEditingGoal(null);
    onGoalChanged();
  };

  // 分组：草稿 vs 正式目标
  const draftGoals = goals.filter(g => g.status === '草稿');
  const activeGoals = goals.filter(g => g.status !== '草稿');

  return (
    <div className="space-y-2">
      {/* 草稿目标分组 */}
      {draftGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
            <FileEdit className="h-3 w-3" />
            待确认
          </p>
          {draftGoals.map(goal => (
            <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} onConfirm={handleConfirmDraft} deletingId={deletingId} isDraft />
          ))}
        </div>
      )}

      {/* 正式目标 */}
      {subItems && subItems.length > 0 ? (
        <>
          {/* 事项级目标 */}
          {activeGoals.filter(g => !g.sub_item_id).map((goal) => (
            <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} deletingId={deletingId} />
          ))}
          {/* 各子项下的目标 */}
          {subItems.map(sub => {
            const subGoals = activeGoals.filter(g => g.sub_item_id === sub.id);
            if (subGoals.length === 0) return null;
            return (
              <div key={sub.id}>
                <p className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-indigo-400" />
                  {sub.title}
                </p>
                {subGoals.map(goal => (
                  <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} deletingId={deletingId} />
                ))}
              </div>
            );
          })}
        </>
      ) : (
        activeGoals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} deletingId={deletingId} />
        ))
      )}

      {goals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-5 text-center">
          <Target className="h-7 w-7 mx-auto text-slate-300 mb-2" />
          <p className="text-xs text-slate-400 mb-0.5">还没有目标</p>
          <p className="text-[10px] text-slate-300">点击下方按钮设置目标</p>
        </div>
      )}

      {/* 新建目标按钮 */}
      <button
        onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-2 text-xs font-medium text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        设置目标
      </button>

      {/* 目标表单抽屉 */}
      {showGoalForm && (
        <GoalForm
          goal={editingGoal}
          itemId={itemId}
          phases={phases}
          subItems={subItems}
          preselectedSubItemId={activeSubItemId}
          onClose={() => { setShowGoalForm(false); setEditingGoal(null); }}
          onSaved={handleFormSaved}
          onError={onError}
        />
      )}
    </div>
  );
}

// ============================================
// 单个目标行组件
// ============================================

function GoalRow({
  goal,
  onEdit,
  onDelete,
  onConfirm,
  deletingId,
  isDraft,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onConfirm?: (goal: Goal) => void;
  deletingId: string | null;
  isDraft?: boolean;
}) {
  const ruleStyle = RULE_TYPE_STYLES[goal.rule_type] || RULE_TYPE_STYLES['一次性完成'];

  return (
    <div className={`glass rounded-2xl p-3.5 shadow-soft border-l-2 ${ruleStyle.border} ${isDraft ? 'border-dashed opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50/80 text-indigo-500 mt-0.5">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-medium text-slate-800 truncate">{goal.goal_text || goal.title}</p>
              <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}>
                {STATUS_ICONS[goal.status]}
                {goal.status}
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ruleStyle.color}`}>
                {ruleStyle.icon} {ruleStyle.label}
              </span>
            </div>
            {/* 规则摘要 */}
            <p className="text-[10px] text-slate-400 mt-0.5">
              {goal.period && goal.period !== '无' ? `${goal.period} ` : ''}
              {goal.operator === '<=' ? '不超过' : goal.operator === '>=' ? '至少' : goal.operator === 'complete' ? '完成即达标' : goal.operator}{' '}
              {goal.target_min ?? goal.target_max ?? ''}{goal.unit ? ` ${goal.unit}` : ''}
              {goal.deadline ? ` · 截止 ${goal.deadline}` : ''}
              {goal.metric_name ? ` · 指标: ${goal.metric_name}` : ''}
            </p>
            {/* 达标型进度条 */}
            {goal.operator === 'complete' && goal.target_min != null && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>{goal.current_value ?? 0} / {goal.target_min}</span>
                  <span>{goal.target_min > 0 ? Math.round(((goal.current_value ?? 0) / goal.target_min) * 100) : 0}%</span>
                </div>
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${goal.target_min > 0 ? Math.min(100, ((goal.current_value ?? 0) / goal.target_min) * 100) : 0}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isDraft && onConfirm && (
            <button
              onClick={() => onConfirm(goal)}
              className="p-1.5 rounded-lg hover:bg-green-50/60 text-slate-400 hover:text-green-500 transition-colors"
              title="确认目标"
            >
              <CheckCircle2 className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-colors"
            title="编辑目标"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(goal)}
            disabled={deletingId === goal.id}
            className="p-1.5 rounded-lg hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
            title="删除目标"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
