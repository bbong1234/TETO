'use client';

import { useState } from 'react';
import { Target, Plus, Trash2, Pencil, CheckCircle2, PauseCircle, XCircle, Circle } from 'lucide-react';
import type { Goal, GoalStatus, SubItem } from '@/types/teto';
import GoalForm from './GoalForm';

const STATUS_COLORS: Record<GoalStatus, string> = {
  '进行中': 'bg-green-100 text-green-700',
  '已达成': 'bg-blue-100 text-blue-700',
  '已放弃': 'bg-slate-100 text-slate-500',
  '已暂停': 'bg-yellow-100 text-yellow-700',
};

const STATUS_ICONS: Record<GoalStatus, React.ReactNode> = {
  '进行中': <Circle className="h-3 w-3" />,
  '已达成': <CheckCircle2 className="h-3 w-3" />,
  '已放弃': <XCircle className="h-3 w-3" />,
  '已暂停': <PauseCircle className="h-3 w-3" />,
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
    if (!confirm(`确定删除目标「${goal.title}」？`)) return;
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

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowGoalForm(true);
  };

  const handleFormSaved = () => {
    setShowGoalForm(false);
    setEditingGoal(null);
    onGoalChanged();
  };

  return (
    <div className="space-y-2">
      {/* 按子项分组展示目标 */}
      {subItems && subItems.length > 0 ? (
        <>
          {/* 事项级达标型目标 */}
          {goals.filter(g => !g.sub_item_id).map((goal) => (
            <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} deletingId={deletingId} />
          ))}
          {/* 各子项下的目标 */}
          {subItems.map(sub => {
            const subGoals = goals.filter(g => g.sub_item_id === sub.id);
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
        /* 无子项时：平铺展示 */
        goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} deletingId={deletingId} />
        ))
      )}

      {goals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-5 text-center">
          <Target className="h-7 w-7 mx-auto text-slate-300 mb-2" />
          <p className="text-xs text-slate-400 mb-0.5">还没有目标</p>
          <p className="text-[10px] text-slate-300">点击下方按钮添加第一个目标</p>
        </div>
      )}

      {/* 新建目标按钮 */}
      <button
        onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-2 text-xs font-medium text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        新建目标
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

const MEASURE_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  numeric: { label: '量化', className: 'bg-purple-100 text-purple-600' },
  boolean: { label: '达标', className: 'bg-blue-100 text-blue-600' },
  repeat: { label: '重复', className: 'bg-emerald-100 text-emerald-600' },
};

function GoalRow({
  goal,
  onEdit,
  onDelete,
  deletingId,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  deletingId: string | null;
}) {
  const typeInfo = MEASURE_TYPE_LABELS[goal.measure_type] || MEASURE_TYPE_LABELS.boolean;

  return (
    <div className={`glass rounded-2xl p-3.5 shadow-soft border-l-2 ${goal.measure_type === 'numeric' ? 'border-l-purple-400' : goal.measure_type === 'repeat' ? 'border-l-emerald-400' : 'border-l-blue-400'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50/80 text-indigo-500 mt-0.5">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-medium text-slate-800 truncate">{goal.title}</p>
              <span className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}>
                {STATUS_ICONS[goal.status]}
                {goal.status}
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeInfo.className}`}>
                {typeInfo.label}
              </span>
            </div>
            {goal.description && (
              <p className="text-xs text-slate-400 line-clamp-1">{goal.description}</p>
            )}
            {goal.measure_type === 'numeric' && goal.metric_name && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                指标：{goal.metric_name}{goal.unit ? ` · ${goal.unit}/天 ${goal.daily_target ?? ''}` : ''}
              </p>
            )}
            {goal.measure_type === 'repeat' && goal.repeat_frequency && goal.repeat_count != null && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {goal.repeat_frequency === 'daily' ? '每天' : goal.repeat_frequency === 'weekly' ? '每周' : '每月'} {goal.repeat_count} 次
              </p>
            )}
            {goal.measure_type === 'boolean' && goal.target_value != null && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>{goal.current_value ?? 0} / {goal.target_value}</span>
                  <span>{goal.target_value > 0 ? Math.round(((goal.current_value ?? 0) / goal.target_value) * 100) : 0}%</span>
                </div>
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400 transition-all"
                    style={{ width: `${goal.target_value > 0 ? Math.min(100, ((goal.current_value ?? 0) / goal.target_value) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
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
