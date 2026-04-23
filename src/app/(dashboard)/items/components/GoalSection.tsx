'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Target } from 'lucide-react';
import type { Goal, GoalStatus } from '@/types/teto';
import { GOAL_STATUSES } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import GoalCard from './GoalCard';
import GoalForm from './GoalForm';

const STATUS_LABELS: Record<GoalStatus, string> = {
  '进行中': '进行中',
  '已达成': '已达成',
  '已放弃': '已放弃',
  '已暂停': '已暂停',
};

export default function GoalSection() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<GoalStatus | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const { showError } = useToast();

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/v2/goals?${params.toString()}`);
      const data = await res.json();
      if (data.data) {
        setGoals(data.data);
      }
    } catch (err) {
      console.error('加载目标失败:', err);
      showError('加载目标失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, showError]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleCreate = () => {
    setEditingGoal(null);
    setShowForm(true);
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  };

  const handleDelete = async (goal: Goal) => {
    if (!confirm(`确定要删除目标"${goal.title}"吗？`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        // 删除成功，不显示提示
        fetchGoals();
      } else {
        const err = await res.json();
        showError(err.error || '删除目标失败');
      }
    } catch (err) {
      console.error('删除目标失败:', err);
      showError('删除目标失败，请重试');
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingGoal(null);
    fetchGoals();
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGoal(null);
  };

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-500" />
          <h2 className="text-base font-bold text-slate-900">目标管理</h2>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新建目标
        </button>
      </div>

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterStatus('')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            filterStatus === ''
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          全部
        </button>
        {GOAL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* 目标列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : goals.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center shadow-sm border border-slate-200">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Target className="h-6 w-6 text-slate-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500">暂无目标</p>
          <p className="mt-1 text-xs text-slate-400">点击上方"新建目标"按钮创建</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 表单抽屉 */}
      {showForm && (
        <GoalForm
          goal={editingGoal}
          onClose={handleCloseForm}
          onSaved={handleSaved}
          onError={showError}
        />
      )}
    </div>
  );
}
