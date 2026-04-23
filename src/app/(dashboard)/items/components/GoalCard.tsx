'use client';

import { useState } from 'react';
import { Target, Edit2, Trash2, Check, Minus } from 'lucide-react';
import type { Goal, GoalStatus } from '@/types/teto';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onUpdateValue?: (goalId: string, currentValue: number | null) => void;
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  '进行中': 'bg-green-100 text-green-700',
  '已达成': 'bg-blue-100 text-blue-700',
  '已放弃': 'bg-slate-100 text-slate-500',
  '已暂停': 'bg-yellow-100 text-yellow-700',
};

export default function GoalCard({ goal, onEdit, onDelete, onUpdateValue }: GoalCardProps) {
  const [editingValue, setEditingValue] = useState(false);
  const [tempValue, setTempValue] = useState(String(goal.current_value ?? ''));

  const handleSaveValue = () => {
    const val = tempValue.trim() === '' ? null : Number(tempValue);
    if (val !== null && isNaN(val)) return;
    onUpdateValue?.(goal.id, val);
    setEditingValue(false);
  };

  const progress = goal.measure_type === 'numeric' && goal.target_value
    ? Math.min(100, ((goal.current_value || 0) / goal.target_value) * 100)
    : null;

  return (
    <div className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
        <Target className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">{goal.title}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[goal.status]}`}>
            {goal.status}
          </span>
        </div>
        {goal.description && (
          <p className="mt-1 text-xs text-slate-400 line-clamp-2">{goal.description}</p>
        )}

        {/* 度量展示 */}
        <div className="mt-2">
          {goal.measure_type === 'numeric' && goal.target_value != null ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progress != null && progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${progress ?? 0}%` }}
                  />
                </div>
                {editingValue ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveValue()}
                      className="w-16 rounded border border-blue-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                      autoFocus
                    />
                    <button onClick={handleSaveValue} className="p-0.5 rounded hover:bg-blue-50"><Check className="h-3 w-3 text-blue-500" /></button>
                    <button onClick={() => setEditingValue(false)} className="p-0.5 rounded hover:bg-slate-100"><Minus className="h-3 w-3 text-slate-400" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setTempValue(String(goal.current_value ?? '')); setEditingValue(true); }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                  >
                    {goal.current_value ?? 0} / {goal.target_value}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              goal.status === '已达成' ? 'text-green-600' : 'text-slate-400'
            }`}>
              {goal.status === '已达成' ? '✓ 已达标' : '○ 未达标'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(goal)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="编辑"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(goal)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          aria-label="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
