'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Item, SubItem } from '@/types/teto';
import {
  getCategoryItems,
  getItemsForCategory,
  seedTopLevelCategories,
} from '@/lib/activity/item-tree';

export interface ActivityContextValue {
  /** 大类 item id */
  categoryItemId: string;
  categoryTitle?: string;
  /** 事项 item id */
  itemId: string;
  itemTitle?: string;
  /** 子项 id */
  subItemId: string;
  subItemTitle?: string;
}

export const EMPTY_ACTIVITY_CONTEXT: ActivityContextValue = {
  categoryItemId: '',
  itemId: '',
  subItemId: '',
};

interface ActivityContextPickerProps {
  items: Item[];
  value: ActivityContextValue;
  onChange: (value: ActivityContextValue) => void;
  /** 新建/种子大类后通知父级刷新 items */
  onItemsChange?: () => void;
  compact?: boolean;
}

type CreateLevel = 'category' | 'item' | 'subItem';

export default function ActivityContextPicker({
  items,
  value,
  onChange,
  onItemsChange,
  compact = false,
}: ActivityContextPickerProps) {
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [creating, setCreating] = useState<CreateLevel | null>(null);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const categoryItems = useMemo(
    () => getCategoryItems(items, value.categoryItemId || undefined),
    [items, value.categoryItemId]
  );
  const childItems = useMemo(
    () =>
      value.categoryItemId
        ? getItemsForCategory(items, value.categoryItemId, value.categoryItemId)
        : [],
    [items, value.categoryItemId]
  );

  // 首次无大类时种子预设
  useEffect(() => {
    if (categoryItems.length > 0 || seeding) return;
    let cancelled = false;
    setSeeding(true);
    seedTopLevelCategories()
      .then(() => {
        if (!cancelled) onItemsChange?.();
      })
      .finally(() => {
        if (!cancelled) setSeeding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryItems.length, seeding, onItemsChange]);

  // 加载子项
  useEffect(() => {
    if (!value.itemId) {
      setSubItems([]);
      return;
    }
    let cancelled = false;
    setSubLoading(true);
    fetch(`/api/v2/sub-items?item_id=${value.itemId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSubItems(data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSubItems([]);
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.itemId]);

  const labelClass = compact
    ? 'text-[10px] text-slate-400 w-8 shrink-0'
    : 'text-[10px] text-slate-400 w-10 shrink-0';

  const selectClass =
    'flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-50';

  const setCategory = (categoryItemId: string, categoryTitle?: string) => {
    onChange({
      categoryItemId,
      categoryTitle,
      itemId: '',
      itemTitle: undefined,
      subItemId: '',
      subItemTitle: undefined,
    });
  };

  const setItem = (itemId: string, itemTitle?: string) => {
    onChange({
      ...value,
      itemId,
      itemTitle,
      subItemId: '',
      subItemTitle: undefined,
    });
  };

  const setSubItem = (subItemId: string, subItemTitle?: string) => {
    onChange({ ...value, subItemId, subItemTitle });
  };

  const startCreate = (level: CreateLevel) => {
    setCreating(level);
    setCreateText('');
  };

  const cancelCreate = () => {
    setCreating(null);
    setCreateText('');
  };

  const submitCreate = async () => {
    const title = createText.trim();
    if (!title || !creating) return;
    setCreateSubmitting(true);
    try {
      if (creating === 'category') {
        const res = await fetch('/api/v2/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, parent_item_id: null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? data.conflict?.message ?? '创建失败');
        const item: Item = data.data;
        onItemsChange?.();
        setCategory(item.id, item.title);
      } else if (creating === 'item') {
        if (!value.categoryItemId) return;
        const res = await fetch('/api/v2/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, parent_item_id: value.categoryItemId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? data.conflict?.message ?? '创建失败');
        const item: Item = data.data;
        onItemsChange?.();
        setItem(item.id, item.title);
      } else if (creating === 'subItem') {
        if (!value.itemId) return;
        const res = await fetch('/api/v2/sub-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: value.itemId, title }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message ?? '创建失败');
        const sub: SubItem = data.data;
        setSubItems((prev) => [...prev, sub]);
        setSubItem(sub.id, sub.title);
      }
      cancelCreate();
    } catch {
      // 静默失败，用户可重试
    } finally {
      setCreateSubmitting(false);
    }
  };

  const renderCreateRow = (level: CreateLevel, placeholder: string) => (
    <div className="flex items-center gap-1.5 flex-1">
      <input
        type="text"
        value={createText}
        onChange={(e) => setCreateText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitCreate();
          if (e.key === 'Escape') cancelCreate();
        }}
        placeholder={placeholder}
        autoFocus
        className="flex-1 rounded-lg border border-blue-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
      <button
        type="button"
        disabled={!createText.trim() || createSubmitting}
        onClick={submitCreate}
        className="rounded-lg bg-blue-500 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {createSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : '确定'}
      </button>
      <button
        type="button"
        onClick={cancelCreate}
        className="rounded-lg px-2 py-1.5 text-[10px] text-slate-400 hover:bg-slate-100"
      >
        取消
      </button>
    </div>
  );

  if (seeding) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        初始化分类…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 大类 */}
      <div className="flex items-start gap-2">
        <span className={`${labelClass} pt-1.5`}>大类</span>
        {creating === 'category' ? (
          renderCreateRow('category', '新大类名称')
        ) : (
          <div className="flex flex-wrap gap-1.5 flex-1">
            {categoryItems.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setCategory(
                    value.categoryItemId === cat.id ? '' : cat.id,
                    value.categoryItemId === cat.id ? undefined : cat.title
                  )
                }
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  value.categoryItemId === cat.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => startCreate('category')}
              className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
            >
              <Plus className="h-3 w-3" />
              新建
            </button>
          </div>
        )}
      </div>

      {/* 事项 */}
      {value.categoryItemId && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>事项</span>
          {creating === 'item' ? (
            renderCreateRow('item', '新事项名称')
          ) : (
            <>
              <select
                value={value.itemId}
                onChange={(e) => {
                  const item = childItems.find((i) => i.id === e.target.value);
                  setItem(e.target.value, item?.title);
                }}
                className={selectClass}
              >
                <option value="">不选事项</option>
                {childItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => startCreate('item')}
                className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
              >
                <Plus className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 子项 */}
      {value.itemId && creating !== 'subItem' && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>子项</span>
          <select
            value={value.subItemId}
            onChange={(e) => {
              const sub = subItems.find((s) => s.id === e.target.value);
              setSubItem(e.target.value, sub?.title);
            }}
            disabled={subLoading}
            className={selectClass}
          >
            <option value="">
              {subLoading ? '加载中…' : subItems.length === 0 ? '暂无子项' : '不选子项'}
            </option>
            {subItems.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => startCreate('subItem')}
            className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}

      {value.itemId && creating === 'subItem' && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>子项</span>
          {renderCreateRow('subItem', '新子项名称')}
        </div>
      )}

      {/* 路径预览 */}
      {(value.categoryTitle || value.itemTitle || value.subItemTitle) && (
        <p className="text-[10px] text-slate-400 pl-10">
          {[value.categoryTitle, value.itemTitle, value.subItemTitle].filter(Boolean).join(' / ')}
        </p>
      )}
    </div>
  );
}
