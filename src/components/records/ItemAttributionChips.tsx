'use client';

import { useMemo } from 'react';
import type { Item } from '@/types/teto';
import type { ActivityContextShape } from '@/lib/activity/item-tree';
import { getRecentItemsForChips } from '@/lib/activity/recent-context';

interface ItemAttributionChipsProps {
  items: Item[];
  selectedId?: string | null;
  onSelect: (itemId: string | null) => void;
  recentContext?: ActivityContextShape | null;
  limit?: number;
  showSkip?: boolean;
  skipLabel?: string;
}

export default function ItemAttributionChips({
  items,
  selectedId = null,
  onSelect,
  recentContext = null,
  limit = 3,
  showSkip = true,
  skipLabel = '跳过',
}: ItemAttributionChipsProps) {
  const chipItems = useMemo(
    () => getRecentItemsForChips(items, [], recentContext, limit),
    [items, recentContext, limit]
  );

  if (chipItems.length === 0 && !showSkip) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chipItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(selectedId === item.id ? null : item.id)}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            selectedId === item.id
              ? 'bg-blue-500 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          {item.title}
        </button>
      ))}
      {showSkip && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            selectedId === null
              ? 'bg-slate-500 text-white'
              : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50',
          ].join(' ')}
        >
          {skipLabel}
        </button>
      )}
    </div>
  );
}
