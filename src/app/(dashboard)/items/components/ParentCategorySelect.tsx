'use client';

import type { Item } from '@/types/teto';
import { getCategoryItems } from '@/lib/activity/item-tree';

interface ParentCategorySelectProps {
  items: Item[];
  value: string;
  onChange: (parentId: string) => void;
  /** 允许不选大类（ orphan ） */
  allowEmpty?: boolean;
  className?: string;
}

export default function ParentCategorySelect({
  items,
  value,
  onChange,
  allowEmpty = true,
  className = '',
}: ParentCategorySelectProps) {
  const categories = getCategoryItems(items, value || undefined, undefined, {
    showUnusedPresets: true,
  });

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        'w-full rounded-xl bg-white/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 border-0'
      }
    >
      {allowEmpty && <option value="">不选大类（未归类）</option>}
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.title}
        </option>
      ))}
    </select>
  );
}
