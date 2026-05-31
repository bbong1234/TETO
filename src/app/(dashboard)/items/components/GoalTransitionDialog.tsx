'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, PauseCircle, X, XCircle } from 'lucide-react';
import type { Goal, GoalStatus } from '@/types/teto';

type TransitionStatus = Extract<GoalStatus, '暂停' | '已完成' | '放弃'>;

interface GoalTransitionDialogProps {
  goal: Goal;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}

const STATUS_OPTIONS: Array<{
  status: TransitionStatus;
  label: string;
  icon: React.ReactNode;
  hint: string;
  activeClass: string;
}> = [
  {
    status: '暂停',
    label: '暂停',
    icon: <PauseCircle className="h-4 w-4" />,
    hint: '做了一半先放一放',
    activeClass: 'border-yellow-400 bg-yellow-50 text-yellow-700',
  },
  {
    status: '已完成',
    label: '完成',
    icon: <CheckCircle2 className="h-4 w-4" />,
    hint: '目标已达成',
    activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  },
  {
    status: '放弃',
    label: '放弃',
    icon: <XCircle className="h-4 w-4" />,
    hint: '不再继续此目标',
    activeClass: 'border-slate-400 bg-slate-50 text-slate-600',
  },
];

export default function GoalTransitionDialog({
  goal,
  onClose,
  onDone,
  onError,
}: GoalTransitionDialogProps) {
  const [status, setStatus] = useState<TransitionStatus>('暂停');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '状态更新失败');
      onDone();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : '状态更新失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">更新目标状态</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[260px]">
              {goal.goal_text || goal.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.status}
                type="button"
                onClick={() => setStatus(opt.status)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                  status === opt.status
                    ? opt.activeClass
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              进展说明（可选）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                status === '暂停'
                  ? '例：做到了60%，因为X先放一放'
                  : status === '已完成'
                    ? '例：方案已通过评审'
                    : '例：项目没有促成，不再继续'
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              填写后会自动创建一条「总结」记录并关联到本目标
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:bg-blue-300"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
