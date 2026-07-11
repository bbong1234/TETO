'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';
import {
  getPlanPriority,
  planPriorityToSubcategory,
  PLAN_PRIORITY_LABELS,
  sortPlansByPriority,
  type PlanPriority,
} from '@/lib/activity/plan-priority';
import { buildItemPathLabel } from '@/lib/activity/item-tree';
import type { Item } from '@/types/teto';

interface TodayPlansPanelProps {
  date: string;
  records: TetoRecord[];
  items: Item[];
  onComplete: (record: TetoRecord) => void;
  onPriorityChange?: (record: TetoRecord, priority: PlanPriority | null) => void;
}

export default function TodayPlansPanel({
  date,
  records,
  items,
  onComplete,
  onPriorityChange,
}: TodayPlansPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activePlans = useMemo(() => {
    const plans = records.filter(
      (r) =>
        r.type === '计划' &&
        (!r.lifecycle_status || r.lifecycle_status === 'active') &&
        (r.time_anchor_date === date || r.date === date || (!r.time_anchor_date && r.date === date))
    );
    return sortPlansByPriority(plans);
  }, [records, date]);

  if (activePlans.length === 0) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchComplete = () => {
    for (const id of selectedIds) {
      const plan = activePlans.find((p) => p.id === id);
      if (plan) onComplete(plan);
    }
    setSelectedIds(new Set());
  };

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-indigo-50/60"
      >
        <span className="text-[11px] font-semibold text-indigo-800">
          今日计划
          <span className="ml-1.5 rounded-full bg-indigo-200 px-1.5 py-0.5 text-[10px] tabular-nums">
            {activePlans.length}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-indigo-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-indigo-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-indigo-100 px-2 py-2 space-y-1">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBatchComplete}
              className="mb-1 w-full rounded-lg bg-indigo-500 py-1.5 text-[10px] font-medium text-white hover:bg-indigo-600"
            >
              批量完成 ({selectedIds.size})
            </button>
          )}
          {activePlans.map((plan) => {
            const priority = getPlanPriority(plan);
            const itemLabel = plan.item_id ? buildItemPathLabel(items, plan.item_id) : '';
            return (
              <div
                key={plan.id}
                className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5 hover:bg-white"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(plan.id)}
                  onChange={() => toggleSelect(plan.id)}
                  className="h-3 w-3 shrink-0 rounded border-slate-300"
                />
                {priority && (
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${
                      priority === 'high'
                        ? 'bg-red-100 text-red-700'
                        : priority === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {PLAN_PRIORITY_LABELS[priority]}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[11px] text-slate-800">{plan.content}</p>
                  {itemLabel && (
                    <p className="truncate text-[9px] text-slate-400">{itemLabel}</p>
                  )}
                </div>
                {onPriorityChange && (
                  <select
                    value={priority ?? ''}
                    onChange={(e) => {
                      const val = e.target.value as PlanPriority | '';
                      onPriorityChange(plan, val || null);
                    }}
                    className="shrink-0 rounded border border-slate-200 px-1 py-0.5 text-[9px] text-slate-500"
                    aria-label="优先级"
                  >
                    <option value="">无</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => onComplete(plan)}
                  className="shrink-0 rounded p-1 text-green-600 hover:bg-green-50"
                  aria-label="完成"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
