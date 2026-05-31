'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActivityContextValue } from '../ActivityContextPicker';
import ActivityContextPicker from '../ActivityContextPicker';
import ToolLabelField from '@/components/records/ToolLabelField';
import { resolveTargetItemId } from '@/lib/activity/item-tree';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import type { Goal, Item, Tag } from '@/types/teto';

interface RecordEditOrgFieldsProps {
  form: RecordEditFormState;
  items: Item[];
  tags: Tag[];
  goals?: Goal[];
  goalBadge?: { id: string; title: string } | null;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onContextSubItemsLoaded: (count: number) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
}

export default function RecordEditOrgFields({
  form,
  items,
  tags,
  goals = [],
  goalBadge,
  onPatch,
  onContextSubItemsLoaded,
  onItemsChange,
  onItemCreated,
  onCreateError,
}: RecordEditOrgFieldsProps) {
  const [fetchedGoals, setFetchedGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

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
    setGoalsLoading(true);
    fetch(`/api/v2/goals?item_id=${encodeURIComponent(itemId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: Goal[] = (json.data ?? []).filter((g: Goal) => g.status !== '草稿');
        setFetchedGoals(list);
      })
      .catch(() => {
        if (!cancelled) setFetchedGoals([]);
      })
      .finally(() => {
        if (!cancelled) setGoalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, parentItemGoals]);

  const itemGoals = parentItemGoals.length > 0 ? parentItemGoals : fetchedGoals;

  const toggleTag = (tagId: string) => {
    const next = form.tagIds.includes(tagId)
      ? form.tagIds.filter((id) => id !== tagId)
      : [...form.tagIds, tagId];
    onPatch({ tagIds: next });
  };

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        组织信息
      </label>

      <div>
        <label className="mb-2 block text-[10px] text-slate-400">归属（一类/二类/三类 · 阶段）</label>
        <ActivityContextPicker
          items={items}
          value={form.activityContext}
          onChange={(ctx: ActivityContextValue) => onPatch({ activityContext: ctx })}
          onItemsChange={onItemsChange}
          onItemCreated={onItemCreated}
          onCreateError={onCreateError}
          onSubItemsLoaded={(subs) => onContextSubItemsLoaded(subs.length)}
          compact
        />
      </div>

      {itemId && (
        <div>
          <label className="mb-1 block text-[10px] text-slate-400">关联目标（可选）</label>
          {goalsLoading ? (
            <p className="text-[11px] text-slate-400">加载目标中...</p>
          ) : itemGoals.length === 0 ? (
            <p className="text-[11px] text-slate-400">此事项暂无活跃目标</p>
          ) : (
            <select
              value={form.goalId}
              onChange={(e) => onPatch({ goalId: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">不关联具体目标</option>
              {itemGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.goal_text || g.title}
                </option>
              ))}
            </select>
          )}
          {form.goalId && !itemGoals.some((g) => g.id === form.goalId) && goalBadge?.title && (
            <p className="mt-1 text-[10px] text-indigo-600">当前关联：{goalBadge.title}</p>
          )}
        </div>
      )}

      {!itemId && form.goalId && goalBadge?.title && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">关联目标</span>
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            {goalBadge.title}
          </span>
        </div>
      )}

      <ToolLabelField value={form.toolLabel} onChange={(v) => onPatch({ toolLabel: v })} compact />

      {tags.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] text-slate-400">横向标记（可选）</label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  form.tagIds.includes(tag.id)
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[10px] text-slate-400">备注</label>
        <textarea
          value={form.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          rows={2}
          placeholder="补充说明..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}
