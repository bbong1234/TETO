'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Target, Plus, FileEdit, ArrowRight } from 'lucide-react';
import { useGoalEngine } from '@/lib/hooks/useGoalEngine';
import type { Goal, SubItem, Record as TetoRecord } from '@/types/teto';
import { UnifiedGoalCard } from './GoalCard';
import GoalForm from './GoalForm';
import GoalTransitionDialog from './GoalTransitionDialog';

interface UnifiedGoalPanelProps {
  itemId: string;
  goals: Goal[];
  subItems?: SubItem[];
  activeSubItemId?: string | null;
  phases?: { id: string; title: string }[];
  refreshKey?: number;
  readOnly?: boolean;
  onGoalChanged: () => void;
  onError: (message: string) => void;
  onRecordOpen?: (record: TetoRecord) => void;
}

export default function UnifiedGoalPanel({
  itemId,
  goals,
  subItems,
  activeSubItemId,
  phases,
  refreshKey,
  readOnly = false,
  onGoalChanged,
  onError,
  onRecordOpen,
}: UnifiedGoalPanelProps) {
  const { data: engineData, loading, error } = useGoalEngine(itemId, refreshKey);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transitionGoal, setTransitionGoal] = useState<Goal | null>(null);
  const [linkedByGoal, setLinkedByGoal] = useState<Map<string, TetoRecord>>(new Map());

  const engineMap = new Map(engineData.map((r) => [r.goal_id, r]));

  useEffect(() => {
    if (!itemId || goals.length === 0) {
      setLinkedByGoal(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v2/records?item_id=${encodeURIComponent(itemId)}&limit=500`);
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const records: TetoRecord[] = json.data ?? [];
        const goalIdSet = new Set(goals.map((g) => g.id));
        const map = new Map<string, TetoRecord>();
        for (const r of records) {
          if (!r.goal_id || !goalIdSet.has(r.goal_id)) continue;
          const existing = map.get(r.goal_id);
          if (!existing) {
            map.set(r.goal_id, r);
            continue;
          }
          const rIsSummary = r.type === '总结';
          const eIsSummary = existing.type === '总结';
          if (rIsSummary && !eIsSummary) {
            map.set(r.goal_id, r);
          } else if (rIsSummary === eIsSummary && r.created_at > existing.created_at) {
            map.set(r.goal_id, r);
          }
        }
        if (!cancelled) setLinkedByGoal(map);
      } catch {
        /* 非致命 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, goals, refreshKey]);

  const visibleGoals = activeSubItemId
    ? goals.filter(
        (g) =>
          g.sub_item_id === activeSubItemId ||
          (!g.sub_item_id && g.rule_type === '一次性完成')
      )
    : goals;

  const draftGoals = visibleGoals.filter((g) => g.status === '草稿');
  const activeGoals = visibleGoals.filter((g) => g.status !== '草稿');

  const groupedActiveGoals = (() => {
    if (activeSubItemId || !subItems || subItems.length === 0) {
      return [{ label: '', goals: activeGoals }];
    }
    const groups: Array<{ label: string; goals: Goal[] }> = [];
    const itemLevelGoals = activeGoals.filter((g) => !g.sub_item_id);
    if (itemLevelGoals.length > 0) groups.push({ label: '', goals: itemLevelGoals });
    for (const sub of subItems) {
      const subGoals = activeGoals.filter((g) => g.sub_item_id === sub.id);
      if (subGoals.length > 0) groups.push({ label: sub.title, goals: subGoals });
    }
    return groups;
  })();

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">计算引擎加载中...</span>
      </div>
    );
  }

  if (error) {
    return <div className="py-4 text-sm text-red-500">引擎计算失败：{error}</div>;
  }

  const cardProps = readOnly
    ? { readOnly: true as const }
    : {
        onEdit: (g: Goal) => {
          setEditingGoal(g);
          setShowGoalForm(true);
        },
        onDelete: handleDelete,
        onConfirm: handleConfirmDraft,
        onTransition: (g: Goal) => setTransitionGoal(g),
        deletingId,
      };

  return (
    <div className="space-y-3">
      {draftGoals.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
            <FileEdit className="h-3 w-3" />
            待确认
          </p>
          {draftGoals.map((goal) => (
            <UnifiedGoalCard
              key={goal.id}
              goal={goal}
              engineResult={engineMap.get(goal.id)}
              linkedRecord={linkedByGoal.get(goal.id)}
              onRecordOpen={onRecordOpen}
              isDraft
              {...cardProps}
            />
          ))}
        </div>
      )}

      {groupedActiveGoals.map((group) => (
        <div key={group.label || '_item'} className="space-y-1.5">
          {group.label && (
            <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
              <span className="h-1 w-1 rounded-full bg-indigo-400" />
              {group.label}
            </p>
          )}
          {group.goals.map((goal) => (
            <UnifiedGoalCard
              key={goal.id}
              goal={goal}
              engineResult={engineMap.get(goal.id)}
              linkedRecord={linkedByGoal.get(goal.id)}
              onRecordOpen={onRecordOpen}
              {...cardProps}
            />
          ))}
        </div>
      ))}

      {visibleGoals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-5 text-center">
          <Target className="mx-auto mb-2 h-7 w-7 text-slate-300" />
          <p className="mb-0.5 text-xs text-slate-400">还没有目标</p>
          <p className="text-[10px] text-slate-300">
            {readOnly ? '在目标页创建并关联此事项' : '点击上方按钮设置目标'}
          </p>
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            setEditingGoal(null);
            setShowGoalForm(true);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-2 text-xs font-medium text-indigo-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
        >
          <Plus className="h-3.5 w-3.5" />
          设置目标
        </button>
      )}

      {readOnly && (
        <Link
          href={`/goals?item_id=${encodeURIComponent(itemId)}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-600"
        >
          在目标页管理
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {!readOnly && showGoalForm && (
        <GoalForm
          goal={editingGoal}
          itemId={itemId}
          phases={phases}
          subItems={subItems}
          preselectedSubItemId={activeSubItemId}
          onClose={() => {
            setShowGoalForm(false);
            setEditingGoal(null);
          }}
          onSaved={() => {
            setShowGoalForm(false);
            setEditingGoal(null);
            onGoalChanged();
          }}
          onError={onError}
        />
      )}

      {!readOnly && transitionGoal && (
        <GoalTransitionDialog
          goal={transitionGoal}
          onClose={() => setTransitionGoal(null)}
          onDone={() => {
            setTransitionGoal(null);
            onGoalChanged();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}
