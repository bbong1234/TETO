'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Item, SubItem } from '@/types/teto';
import {
  getCategoryItems,
  getItemsForCategory,
  resolveSubItemHostItemId,
} from '@/lib/activity/item-tree';

export interface ActivityContextValue {
  categoryItemId: string;
  categoryTitle?: string;
  itemId: string;
  itemTitle?: string;
  subItemId: string;
  subItemTitle?: string;
}

export const EMPTY_ACTIVITY_CONTEXT: ActivityContextValue = {
  categoryItemId: '',
  itemId: '',
  subItemId: '',
};

const USER_CATEGORY_STORAGE_KEY = 'teto_user_category_ids';

function loadUserCategoryIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(USER_CATEGORY_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveUserCategoryIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(USER_CATEGORY_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

interface ActivityContextPickerProps {
  items: Item[];
  value: ActivityContextValue;
  onChange: (value: ActivityContextValue) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  /** 当前事项下子项列表变化（供父级感知子项数量） */
  onSubItemsLoaded?: (subItems: SubItem[]) => void;
  compact?: boolean;
}

type CreateLevel = 'category' | 'item' | 'subItem';

const CREATE_ITEM_OPTION = '__create_item__';
const PLACEHOLDER_ITEM_OPTION = '__pick_item__';
const PLACEHOLDER_SUB_ITEM_OPTION = '__pick_sub_item__';
const CREATE_SUB_ITEM_OPTION = '__create_sub_item__';

export default function ActivityContextPicker({
  items,
  value,
  onChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  compact = false,
}: ActivityContextPickerProps) {
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [creating, setCreating] = useState<CreateLevel | null>(null);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userCategoryIds, setUserCategoryIds] = useState<Set<string>>(() => loadUserCategoryIds());

  useEffect(() => {
    saveUserCategoryIds(userCategoryIds);
  }, [userCategoryIds]);

  const categoryItems = useMemo(
    () => getCategoryItems(items, value.categoryItemId || undefined, userCategoryIds),
    [items, value.categoryItemId, userCategoryIds]
  );
  const childItems = useMemo(
    () =>
      value.categoryItemId
        ? getItemsForCategory(items, value.categoryItemId, value.categoryItemId)
        : [],
    [items, value.categoryItemId]
  );

  const subItemHostId = useMemo(() => resolveSubItemHostItemId(value), [value]);

  const markUserCategory = useCallback((id: string) => {
    setUserCategoryIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!subItemHostId) {
      setSubItems([]);
      onSubItemsLoaded?.([]);
      return;
    }
    let cancelled = false;
    setSubLoading(true);
    fetch(`/api/v2/sub-items?item_id=${subItemHostId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list: SubItem[] = data.data ?? [];
        setSubItems(list);
        onSubItemsLoaded?.(list);
      })
      .catch(() => {
        if (!cancelled) {
          setSubItems([]);
          onSubItemsLoaded?.([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subItemHostId]);

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
    setCreateError(null);
    setCreating(level);
    setCreateText('');
  };

  const cancelCreate = () => {
    setCreating(null);
    setCreateText('');
    setCreateError(null);
  };

  const parseCreateError = (
    res: Response,
    data: { error?: { message?: string }; conflict?: { message?: string } }
  ) => {
    if (res.status === 409 && data.conflict?.message) return data.conflict.message;
    return data.error?.message ?? '创建失败';
  };

  const submitCreate = async () => {
    const title = createText.trim();
    if (!title || !creating) return;
    if (creating === 'item' && !value.categoryItemId) {
      const msg = '请先选择大类';
      setCreateError(msg);
      onCreateError?.(msg);
      return;
    }
    if (creating === 'subItem' && !subItemHostId) {
      const msg = '请先选择事项';
      setCreateError(msg);
      onCreateError?.(msg);
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);
    try {
      if (creating === 'category') {
        const res = await fetch('/api/v2/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, parent_item_id: null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(parseCreateError(res, data));
        const item: Item | null = data.data ?? null;
        if (!item?.id) throw new Error('创建成功但未返回事项数据');
        markUserCategory(item.id);
        onItemCreated?.(item);
        await onItemsChange?.();
        setCategory(item.id, item.title);
      } else if (creating === 'item') {
        const res = await fetch('/api/v2/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, parent_item_id: value.categoryItemId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(parseCreateError(res, data));
        const item: Item | null = data.data ?? null;
        if (!item?.id) throw new Error('创建成功但未返回事项数据');
        onItemCreated?.(item);
        await onItemsChange?.();
        setItem(item.id, item.title);
      } else if (creating === 'subItem') {
        const res = await fetch('/api/v2/sub-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: subItemHostId, title }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(parseCreateError(res, data));
        const sub: SubItem | null = data.data ?? null;
        if (!sub?.id) throw new Error('创建成功但未返回子项数据');
        const next = [...subItems, sub];
        setSubItems(next);
        onSubItemsLoaded?.(next);
        setSubItem(sub.id, sub.title);
      }
      cancelCreate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建失败';
      setCreateError(msg);
      onCreateError?.(msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const renderCreateRow = (placeholder: string) => (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={createText}
          onChange={(e) => setCreateText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitCreate();
            if (e.key === 'Escape') cancelCreate();
          }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 min-w-0 rounded-lg border border-blue-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <button
          type="button"
          disabled={!createText.trim() || createSubmitting}
          onClick={() => void submitCreate()}
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
      {createError && <p className="text-[10px] text-red-500">{createError}</p>}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* 大类 */}
      <div className="flex items-start gap-2">
        <span className={`${labelClass} pt-1.5`}>大类</span>
        {creating === 'category' ? (
          renderCreateRow('新大类名称')
        ) : (
          <div className="flex flex-wrap gap-1.5 flex-1">
            {categoryItems.length === 0 && items.length === 0 && (
              <span className="text-[11px] text-slate-400 py-0.5">加载分类…</span>
            )}
            {categoryItems.length === 0 && items.length > 0 && (
              <span className="text-[11px] text-slate-400 py-0.5">暂无大类，请新建</span>
            )}
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

      {/* 事项（选大类后必填） */}
      {value.categoryItemId && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>事项</span>
          {creating === 'item' ? (
            renderCreateRow('新事项名称')
          ) : (
            <div className="flex flex-1 items-center gap-1.5 min-w-0">
              <select
                value={value.itemId || PLACEHOLDER_ITEM_OPTION}
                onChange={(e) => {
                  if (e.target.value === CREATE_ITEM_OPTION) {
                    startCreate('item');
                    return;
                  }
                  if (e.target.value === PLACEHOLDER_ITEM_OPTION) {
                    setItem('', undefined);
                    return;
                  }
                  const child = childItems.find((i) => i.id === e.target.value);
                  setItem(e.target.value, child?.title);
                }}
                className={selectClass}
                required
              >
                <option value={PLACEHOLDER_ITEM_OPTION} disabled>
                  请选择事项
                </option>
                <option value={CREATE_ITEM_OPTION}>+ 新建事项</option>
                {childItems.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => startCreate('item')}
                className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
                aria-label="新建事项"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 子项（选事项后可选） */}
      {value.itemId && creating !== 'subItem' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={labelClass}>子项</span>
            {subLoading ? (
              <span className="text-[11px] text-slate-400">加载中…</span>
            ) : subItems.length === 0 ? (
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-slate-400">暂无子项（可不选）</span>
                <button
                  type="button"
                  onClick={() => startCreate('subItem')}
                  className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
                >
                  <Plus className="h-3 w-3" />
                  新建
                </button>
              </div>
            ) : (
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <select
                  value={value.subItemId || PLACEHOLDER_SUB_ITEM_OPTION}
                  onChange={(e) => {
                    if (e.target.value === CREATE_SUB_ITEM_OPTION) {
                      startCreate('subItem');
                      return;
                    }
                    if (e.target.value === PLACEHOLDER_SUB_ITEM_OPTION) {
                      setSubItem('', undefined);
                      return;
                    }
                    const sub = subItems.find((s) => s.id === e.target.value);
                    setSubItem(e.target.value, sub?.title);
                  }}
                  className={selectClass}
                >
                  <option value={PLACEHOLDER_SUB_ITEM_OPTION}>不选择子项</option>
                  {subItems.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.title}
                    </option>
                  ))}
                  <option value={CREATE_SUB_ITEM_OPTION}>+ 新建子项</option>
                </select>
                <button
                  type="button"
                  onClick={() => startCreate('subItem')}
                  className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
                  aria-label="新建子项"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {value.itemId && creating === 'subItem' && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>子项</span>
          {renderCreateRow('新子项名称')}
        </div>
      )}

      {(value.categoryTitle || value.itemTitle || value.subItemTitle) && (
        <p className="text-[10px] text-slate-400 pl-10">
          {[value.categoryTitle, value.itemTitle, value.subItemTitle].filter(Boolean).join(' / ')}
        </p>
      )}
    </div>
  );
}
