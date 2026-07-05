'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Goal, Item } from '@/types/teto';
import { resolveTargetItemId } from '@/lib/activity/item-tree';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { SectionLabel } from './EditableChipRow';

interface RecordGoalSectionProps {
  form: RecordEditFormState;
  items: Item[];
  goals?: Goal[];
  goalBadge?: { id: string; title: string } | null;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordGoalSection({
  form,
  items,
  goals = [],
  goalBadge,
  onPatch,
}: RecordGoalSectionProps) {
  const [open, setOpen] = useState(false);
  const [fetchedGoals, setFetchedGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);

  const itemId = resolveTargetItemId(form.activityContext);
  const parentItemGoals = useMemo(
    () => goals.filter((g) => g.item_id === itemId && g.status !== '草稿'),
    [goals, itemId]
  );

  useEffect(() => {
    if (!itemId) {
      setFetchedGoals([]);
      return;
    }
    if (parentItemGoals.length > 0) {
      setFetchedGoals(parentItemGoals);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v2/goals?item_id=${encodeURIComponent(itemId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setFetchedGoals((json.data ?? []).filter((g: Goal) => g.status !== '草稿'));
      })
      .catch(() => {
        if (!cancelled) setFetchedGoals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, parentItemGoals]);

  const itemGoals = parentItemGoals.length > 0 ? parentItemGoals : fetchedGoals;
  const selected = itemGoals.find((g) => g.id === form.goalId);
  const title = selected?.goal_text || selected?.title || goalBadge?.title;

  return (
    <section>
      <SectionLabel>目标</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {form.goalId && title ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
          >
            🎯 {title}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!itemId && !form.goalId}
            className="rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
          >
            + 关联目标
          </button>
        )}
        {!itemId && !form.goalId && (
          <span className="text-[10px] text-slate-400">请先选择归属事项</span>
        )}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
          {loading ? (
            <p className="text-[11px] text-slate-400">加载中…</p>
          ) : itemGoals.length === 0 ? (
            <p className="text-[11px] text-slate-400">此事项暂无活跃目标</p>
          ) : (
            <select
              value={form.goalId}
              onChange={(e) => {
                onPatch({ goalId: e.target.value });
                setOpen(false);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">不关联</option>
              {itemGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.goal_text || g.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </section>
  );
}
