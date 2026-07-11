'use client';

import { useMemo } from 'react';
import type { Item, Record as TetoRecord } from '@/types/teto';
import { buildQuickStartBubbles, type QuickStartBubble } from '@/lib/activity/quick-start-bubbles';

interface QuickStartBubblesProps {
  records: TetoRecord[];
  items: Item[];
  todayDate: string;
  submitting?: boolean;
  selectedCategoryId?: string;
  onSelectCategory: (bubble: QuickStartBubble) => void;
}

export default function QuickStartBubbles({
  records,
  items,
  todayDate,
  submitting = false,
  selectedCategoryId,
  onSelectCategory,
}: QuickStartBubblesProps) {
  const bubbles = useMemo(
    () => buildQuickStartBubbles(records, items, { todayDate, limit: 6 }),
    [records, items, todayDate]
  );

  if (bubbles.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {bubbles.map((bubble) => {
        const selected = bubble.categoryItemId === selectedCategoryId;
        return (
          <button
            key={bubble.key}
            type="button"
            disabled={submitting}
            onClick={() => onSelectCategory(bubble)}
            className={[
              'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border text-center shadow-sm transition-colors active:scale-95 disabled:opacity-50',
              selected
                ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200/80'
                : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50',
            ].join(' ')}
            aria-label={`选择 ${bubble.label}`}
            aria-pressed={selected}
          >
            <span className={`max-w-[3.25rem] truncate text-xs font-medium ${selected ? 'text-blue-700' : 'text-slate-700'}`}>
              {bubble.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
