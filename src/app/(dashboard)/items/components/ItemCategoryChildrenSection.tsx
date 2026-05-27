'use client';

import Link from 'next/link';
import { ChevronRight, Timer } from 'lucide-react';
import type { Item } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';

interface ItemCategoryChildrenSectionProps {
  categoryItem: Item;
  childItems: Item[];
}

export default function ItemCategoryChildrenSection({
  categoryItem,
  childItems,
}: ItemCategoryChildrenSectionProps) {
  if (childItems.length === 0) {
    return (
      <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
        <h2 className="text-sm font-bold text-slate-700 mb-2">子事项</h2>
        <p className="text-xs text-slate-400">
          此大类下还没有子事项。在记录页选择「{categoryItem.title}」后新建即可。
        </p>
      </section>
    );
  }

  const sorted = [...childItems].sort(
    (a, b) => (b.total_duration_minutes ?? 0) - (a.total_duration_minutes ?? 0)
  );

  return (
    <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
      <h2 className="text-sm font-bold text-slate-700 mb-3">子事项</h2>
      <div className="space-y-2">
        {sorted.map((child) => (
          <Link
            key={child.id}
            href={`/items/${child.id}`}
            className="flex items-center gap-3 rounded-2xl bg-white/50 border border-white/40 px-4 py-3 hover:shadow-soft transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{child.title}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {child.record_count ?? 0} 条记录
                {(child.phase_count ?? 0) > 0 && ` · ${child.phase_count} 阶段`}
              </p>
            </div>
            {(child.total_duration_minutes ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 shrink-0">
                <Timer className="h-3 w-3" />
                {formatDurationMinutes(child.total_duration_minutes!)}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}
