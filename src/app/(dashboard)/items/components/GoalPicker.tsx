'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Target, Loader2 } from 'lucide-react';
import type { Goal, GoalStatus } from '@/types/teto';

// 状态中文映射
const STATUS_LABELS: Record<GoalStatus, string> = {
  '进行中': '进行中',
  '已达成': '已达成',
  '已放弃': '已放弃',
  '已暂停': '已暂停',
};

const STATUS_COLORS: Record<GoalStatus, string> = {
  '进行中': 'bg-green-100 text-green-700',
  '已达成': 'bg-blue-100 text-blue-700',
  '已放弃': 'bg-slate-100 text-slate-500',
  '已暂停': 'bg-yellow-100 text-yellow-700',
};

interface GoalPickerProps {
  currentGoalId?: string | null;
  onSelect: (goal: Goal) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

export default function GoalPicker({ currentGoalId, onSelect, onClose, onError }: GoalPickerProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/goals');
      const data = await res.json();
      if (data.data) {
        setGoals(data.data);
      }
    } catch (err) {
      console.error('加载目标列表失败:', err);
      onError('加载目标列表失败');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // 搜索过滤
  const filteredGoals = goals.filter((g) =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">选择目标</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索目标..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* 目标列表 */}
        <div className="px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">
                {search ? '没有找到匹配的目标' : '暂无目标，请先创建'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGoals.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => onSelect(goal)}
                  className={`w-full text-left rounded-xl p-3 border transition-all hover:border-blue-300 hover:shadow-sm ${
                    goal.id === currentGoalId
                      ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Target className={`h-4 w-4 shrink-0 ${goal.id === currentGoalId ? 'text-blue-500' : 'text-slate-400'}`} />
                    <p className="text-sm font-medium text-slate-900 truncate flex-1">{goal.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}>
                      {STATUS_LABELS[goal.status]}
                    </span>
                  </div>
                  {goal.description && (
                    <p className="mt-1 text-xs text-slate-400 line-clamp-1 pl-6">{goal.description}</p>
                  )}
                  {goal.id === currentGoalId && (
                    <p className="mt-1 text-[10px] text-blue-500 pl-6">当前关联</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
