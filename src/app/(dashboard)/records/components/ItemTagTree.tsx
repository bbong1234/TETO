'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Item, Record as TetoRecord, SubItem } from '@/types/teto';
import { getAttributionPickerChildItems, listLevel3ItemOptions, normalizeOrgLevels } from '@/lib/activity/item-tree';

interface ItemTagTreeProps {
  items: Item[];
  activity: TetoRecord;
  /** L1 大类锁定 id（块时间锁定范围） */
  lockedCategoryItemId?: string | null;
  onSwitchItem: (itemId: string, subItemId?: string | null) => void;
}

interface SubItemEntry {
  id: string;
  title: string;
}

export default function ItemTagTree({
  items,
  activity,
  lockedCategoryItemId,
  onSwitchItem,
}: ItemTagTreeProps) {
  const levels = activity.item_id
    ? normalizeOrgLevels(items, activity.item_id, activity.sub_item_id ?? undefined)
    : { categoryItemId: '', l2ItemId: '', l3ItemId: '', subItemId: '', itemDepth: -1 };
  const categoryId = lockedCategoryItemId ?? levels.categoryItemId;
  const l2Items = categoryId ? getAttributionPickerChildItems(items, categoryId) : [];
  const activeL2Id = levels.l2ItemId || activity.item_id;
  const activeSubId = activity.sub_item_id ?? null;

  // L2 展开状态：默认展开当前活跃 L2
  const [expandedL2, setExpandedL2] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (activeL2Id) s.add(activeL2Id);
    return s;
  });

  // SubItem 缓存：按 L2 id → SubItem[]
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemEntry[]>>({});

  useEffect(() => {
    if (activeL2Id && !expandedL2.has(activeL2Id)) {
      setExpandedL2((prev) => new Set([...prev, activeL2Id]));
    }
  }, [activeL2Id]);

  const loadSubItems = async (l2Id: string) => {
    if (subItemsMap[l2Id]) return;
    try {
      const res = await fetch(`/api/v2/sub-items?item_id=${l2Id}`);
      const data = await res.json();
      const subs: SubItemEntry[] = (data.data as SubItem[] ?? []).map((s) => ({
        id: s.id,
        title: s.title,
      }));
      setSubItemsMap((prev) => ({ ...prev, [l2Id]: subs }));
    } catch {
      setSubItemsMap((prev) => ({ ...prev, [l2Id]: [] }));
    }
  };

  const toggleL2 = (l2Id: string) => {
    setExpandedL2((prev) => {
      const next = new Set(prev);
      if (next.has(l2Id)) {
        next.delete(l2Id);
      } else {
        next.add(l2Id);
        void loadSubItems(l2Id);
      }
      return next;
    });
  };

  const catItem = categoryId ? items.find((i) => i.id === categoryId) : null;

  if (!catItem || l2Items.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-[11px] text-slate-400 text-center mt-4">暂无二类事项</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 标题：大类名称 */}
      <div className="shrink-0 border-b border-slate-100 px-3 py-2">
        <p className="text-xs font-semibold text-slate-600">{catItem.title}</p>
        <p className="text-[10px] text-slate-400">点击切换当前事项</p>
      </div>

      {/* 标签树：可滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {l2Items.map((l2) => {
          const isActiveL2 = l2.id === activeL2Id && !activeSubId;
          const expanded = expandedL2.has(l2.id);
          const l3Items = listLevel3ItemOptions(items, l2.id);
          const subItems = subItemsMap[l2.id] ?? [];
          const hasChildren = l3Items.length > 0 || (expanded && subItems.length > 0);

          return (
            <div key={l2.id}>
              {/* L2 row */}
              <div
                className={[
                  'flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors group',
                  isActiveL2
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-slate-50 text-slate-700',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => toggleL2(l2.id)}
                  className="shrink-0 rounded p-0.5 hover:bg-slate-200/60"
                  aria-label={expanded ? '收起' : '展开'}
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex-1 text-left text-[12px] font-medium"
                  onClick={() => onSwitchItem(l2.id, null)}
                >
                  {l2.title}
                </button>
                {isActiveL2 && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                )}
              </div>

              {/* L3 Items */}
              {expanded && l3Items.map((l3) => {
                const isActive = activity.item_id === l3.id && !activeSubId;
                return (
                  <button
                    key={l3.id}
                    type="button"
                    onClick={() => onSwitchItem(l3.id, null)}
                    className={[
                      'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 ml-6 text-[11px] transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    {l3.title}
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
                  </button>
                );
              })}

              {/* SubItems (fetched async) */}
              {expanded && subItems.map((sub) => {
                const isActive = activity.item_id === l2.id && activeSubId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onSwitchItem(l2.id, sub.id)}
                    className={[
                      'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 ml-6 text-[11px] transition-colors',
                      isActive
                        ? 'bg-emerald-50 text-emerald-600 font-medium'
                        : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-300" />
                    {sub.title}
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
