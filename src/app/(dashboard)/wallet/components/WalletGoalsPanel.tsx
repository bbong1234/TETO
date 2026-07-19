'use client';

import { useEffect, useState } from 'react';
import type { Goal } from '@/types/teto';

interface WalletGoalsPanelProps {
  periodExpense: number;
  onError?: (message: string) => void;
}

/** 展示与消费相关的周期性限制目标 */
export default function WalletGoalsPanel({ periodExpense, onError }: WalletGoalsPanelProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v2/goals');
        const json = await res.json();
        if (cancelled) return;
        const all = Array.isArray(json.data) ? (json.data as Goal[]) : [];
        setGoals(
          all.filter(
            (g) =>
              g.status === '进行中' &&
              g.rule_type === '周期性限制' &&
              (g.period === '本月' || g.period === '每周' || g.period === '每天')
          )
        );
      } catch (e) {
        if (!cancelled) onError?.(e instanceof Error ? e.message : '加载目标失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  if (loading || goals.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800">消费目标</h2>
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
        {goals.map((goal) => {
          const target = goal.target_value ?? 0;
          const progress = target > 0 ? Math.min(periodExpense / target, 1) : 0;
          const over = target > 0 && periodExpense > target;
          return (
            <div key={goal.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{goal.title}</p>
                <span className={`text-xs tabular-nums ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                  ¥{periodExpense.toFixed(0)} / ¥{target}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${over ? 'bg-rose-400' : 'bg-emerald-400'}`}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              {over && (
                <p className="mt-1 text-[10px] text-rose-500">已超出 {goal.period} 限制</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
