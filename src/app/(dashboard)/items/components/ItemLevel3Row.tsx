'use client';

import Link from 'next/link';
import type { Item, SubItem } from '@/types/teto';
import { getChildItems } from '@/lib/activity/item-tree';

interface ItemLevel3RowProps {
  l2Item: Item;
  allItems: Item[];
  subItems: SubItem[];
  includeCompleted?: boolean;
}

/** 二类卡片下方的三类 Item pill + SubItem pill */
export default function ItemLevel3Row({
  l2Item,
  allItems,
  subItems,
  includeCompleted = false,
}: ItemLevel3RowProps) {
  const l3Items = getChildItems(allItems, l2Item.id, { includeCompleted });
  const subsForL2 = subItems.filter((s) => s.item_id === l2Item.id);

  if (l3Items.length === 0 && subsForL2.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5 px-0.5 min-h-[22px]">
      {l3Items.map((l3) => (
        <Link
          key={l3.id}
          href={`/items/${l3.id}`}
          className={`rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors ${
            l3.status === '已完成'
              ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              : 'bg-indigo-50/80 text-indigo-600 hover:bg-indigo-100'
          }`}
          title={l3.status === '已完成' ? '已完成' : undefined}
        >
          {l3.title}
        </Link>
      ))}
      {subsForL2.map((sub) => (
        <Link
          key={sub.id}
          href={`/items/${l2Item.id}?sub=${sub.id}`}
          className="rounded-lg bg-purple-50/80 px-2 py-0.5 text-[10px] font-medium text-purple-600 hover:bg-purple-100 transition-colors"
        >
          {sub.title}
        </Link>
      ))}
    </div>
  );
}
