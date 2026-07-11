'use client';

import Link from 'next/link';
import { Loader2, ExternalLink } from 'lucide-react';
import { useGoalEngine } from '@/lib/hooks/useGoalEngine';
import type { Goal } from '@/types/teto';
import { UnifiedGoalCard, type UnifiedGoalCardProps } from '../../items/components/GoalCard';

interface ItemGoalGroupProps {
  itemId: string;
  title: string;
  goals: Goal[];
  refreshKey: number;
  cardHandlers: Pick<
    UnifiedGoalCardProps,
    'onEdit' | 'onDelete' | 'onConfirm' | 'onTransition' | 'deletingId'
  >;
}

export default function ItemGoalGroup({
  itemId,
  title,
  goals,
  refreshKey,
  cardHandlers,
}: ItemGoalGroupProps) {
  const { data: engineData, loading, error } = useGoalEngine(itemId, refreshKey);
  const engineMap = new Map(engineData.map((r) => [r.goal_id, r]));

  const draftGoals = goals.filter((g) => g.status === '草稿');
  const activeGoals = goals.filter((g) => g.status !== '草稿');

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Link
          href={`/items/${itemId}`}
          className="text-sm font-semibold text-slate-800 hover:text-indigo-600"
        >
          {title}
        </Link>
        <Link
          href={`/items/${itemId}`}
          className="text-slate-400 hover:text-indigo-500"
          title="打开事项"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
          {goals.length}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        {error && <span className="text-[10px] text-red-500">引擎失败</span>}
      </div>

      {draftGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-400">待确认</p>
          {draftGoals.map((goal) => (
            <UnifiedGoalCard
              key={goal.id}
              goal={goal}
              engineResult={engineMap.get(goal.id)}
              isDraft
              {...cardHandlers}
            />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {activeGoals.map((goal) => (
          <UnifiedGoalCard
            key={goal.id}
            goal={goal}
            engineResult={engineMap.get(goal.id)}
            {...cardHandlers}
          />
        ))}
      </div>
    </section>
  );
}
