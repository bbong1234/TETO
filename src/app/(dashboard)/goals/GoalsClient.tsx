'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Target, Plus, Loader2, FileEdit } from 'lucide-react';
import type { Goal, GoalStatus, Item } from '@/types/teto';
import { UnifiedGoalCard } from '../items/components/GoalCard';
import GoalForm from '../items/components/GoalForm';
import GoalTransitionDialog from '../items/components/GoalTransitionDialog';
import ItemGoalGroup from './components/ItemGoalGroup';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';

type StatusFilter = 'all' | GoalStatus | 'inactive';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '进行中', label: '进行中' },
  { key: '草稿', label: '草稿' },
  { key: '已完成', label: '已完成' },
  { key: 'inactive', label: '暂停/放弃' },
];

function GoalsClientInner() {
  const searchParams = useSearchParams();
  const filterItemId = searchParams.get('item_id');
  const { toasts, showError, dismissToast } = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [transitionGoal, setTransitionGoal] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterItemId) params.set('item_id', filterItemId);
      const [goalsRes, itemsRes] = await Promise.all([
        fetch(`/api/v2/goals?${params.toString()}`),
        fetch('/api/v2/items?lite=true'),
      ]);
      const goalsJson = await goalsRes.json();
      const itemsJson = await itemsRes.json();
      if (!goalsRes.ok) throw new Error(goalsJson.error?.message ?? '加载目标失败');
      if (!itemsRes.ok) throw new Error(itemsJson.error?.message ?? '加载事项失败');
      setGoals(Array.isArray(goalsJson.data) ? goalsJson.data : []);
      setItems(Array.isArray(itemsJson.data) ? itemsJson.data : []);
    } catch (e) {
      showError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterItemId, showError]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  const itemTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.id, item.title);
    return map;
  }, [items]);

  const itemPickerOptions = useMemo(
    () => items.map((i) => ({ id: i.id, title: i.title })),
    [items]
  );

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'inactive') return g.status === '暂停' || g.status === '放弃';
      return g.status === statusFilter;
    });
  }, [goals, statusFilter]);

  const grouped = useMemo(() => {
    const byItem = new Map<string | null, Goal[]>();
    for (const g of filteredGoals) {
      const key = g.item_id;
      const list = byItem.get(key) ?? [];
      list.push(g);
      byItem.set(key, list);
    }
    const groups: Array<{ itemId: string | null; title: string; goals: Goal[] }> = [];
    for (const [itemId, list] of byItem) {
      if (itemId) {
        groups.push({
          itemId,
          title: itemTitleMap.get(itemId) ?? '未知事项',
          goals: list,
        });
      }
    }
    groups.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    const unassigned = byItem.get(null) ?? [];
    if (unassigned.length > 0) {
      groups.push({ itemId: null, title: '未关联事项', goals: unassigned });
    }
    return groups;
  }, [filteredGoals, itemTitleMap]);

  const handleGoalChanged = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleDelete = async (goal: Goal) => {
    if (!confirm(`确定删除目标「${goal.goal_text || goal.title}」？`)) return;
    setDeletingId(goal.id);
    try {
      const res = await fetch(`/api/v2/goals/${goal.id}`, { method: 'DELETE' });
      if (res.ok) handleGoalChanged();
      else {
        const err = await res.json();
        showError(err.error?.message ?? '删除目标失败');
      }
    } catch {
      showError('删除目标失败，请重试');
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
      if (res.ok) handleGoalChanged();
      else {
        const err = await res.json();
        showError(err.error?.message ?? '确认目标失败');
      }
    } catch {
      showError('确认目标失败，请重试');
    }
  };

  const cardHandlers = {
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
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden px-4 py-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <header className="mb-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-rose-500" />
            <h1 className="text-lg font-bold text-slate-900">目标</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingGoal(null);
              setShowGoalForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-600"
          >
            <Plus className="h-4 w-4" />
            新建目标
          </button>
        </div>
        {filterItemId && (
          <p className="mt-2 text-xs text-slate-500">
            筛选事项：
            <span className="font-medium text-slate-700">
              {itemTitleMap.get(filterItemId) ?? filterItemId}
            </span>
            <Link href="/goals" className="ml-2 text-indigo-500 hover:underline">
              清除筛选
            </Link>
          </p>
        )}
      </header>

      <div className="mb-4 flex shrink-0 flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === tab.key
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            加载中…
          </div>
        ) : filteredGoals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center">
            <Target className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">暂无符合条件的目标</p>
            <button
              type="button"
              onClick={() => {
                setEditingGoal(null);
                setShowGoalForm(true);
              }}
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" />
              创建第一个目标
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) =>
              group.itemId ? (
                <ItemGoalGroup
                  key={group.itemId}
                  itemId={group.itemId}
                  title={group.title}
                  goals={group.goals}
                  refreshKey={refreshKey}
                  cardHandlers={cardHandlers}
                />
              ) : (
                <section key="_unassigned" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-3.5 w-3.5 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-700">{group.title}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {group.goals.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.goals.map((goal) => (
                      <UnifiedGoalCard key={goal.id} goal={goal} {...cardHandlers} />
                    ))}
                  </div>
                </section>
              )
            )}
          </div>
        )}
      </div>

      {showGoalForm && (
        <GoalForm
          goal={editingGoal}
          itemId={editingGoal?.item_id ?? filterItemId ?? undefined}
          items={itemPickerOptions}
          onClose={() => {
            setShowGoalForm(false);
            setEditingGoal(null);
          }}
          onSaved={() => {
            setShowGoalForm(false);
            setEditingGoal(null);
            handleGoalChanged();
          }}
          onError={showError}
        />
      )}

      {transitionGoal && (
        <GoalTransitionDialog
          goal={transitionGoal}
          onClose={() => setTransitionGoal(null)}
          onDone={() => {
            setTransitionGoal(null);
            handleGoalChanged();
          }}
          onError={showError}
        />
      )}
    </div>
  );
}

export default function GoalsClient() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      }
    >
      <GoalsClientInner />
    </Suspense>
  );
}
