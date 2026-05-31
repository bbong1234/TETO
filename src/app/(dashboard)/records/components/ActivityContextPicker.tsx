'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import type { Item, Phase, SubItem } from '@/types/teto';
import {
  getCategoryItems,
  getChildItems,
  getItemDepth,
  getItemsForCategory,
  resolveSubItemHostItemId,
  resolveTargetItemId,
} from '@/lib/activity/item-tree';

export interface ActivityContextValue {
  categoryItemId: string;
  categoryTitle?: string;
  itemId: string;
  itemTitle?: string;
  subItemId: string;
  subItemTitle?: string;
  phaseId?: string;
  phaseTitle?: string;
}

export const EMPTY_ACTIVITY_CONTEXT: ActivityContextValue = {
  categoryItemId: '',
  itemId: '',
  subItemId: '',
  phaseId: '',
};

const USER_CATEGORY_STORAGE_PREFIX = 'teto_user_category_ids';

function userCategoryStorageKey(userId: string): string {
  return `${USER_CATEGORY_STORAGE_PREFIX}:${userId}`;
}

function loadUserCategoryIds(userId?: string): Set<string> {
  if (typeof window === 'undefined' || !userId) return new Set();
  try {
    const raw = sessionStorage.getItem(userCategoryStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveUserCategoryIds(userId: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(userCategoryStorageKey(userId), JSON.stringify([...ids]));
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
  onSubItemsLoaded?: (subItems: SubItem[]) => void;
  compact?: boolean;
  itemsLoading?: boolean;
}

type CreateLevel = 'category' | 'item' | 'subItem';

const CREATE_ITEM_OPTION = '__create_item__';
const PLACEHOLDER_ITEM_OPTION = '__pick_item__';
const PLACEHOLDER_SUB_ITEM_OPTION = '__pick_sub_item__';
const CREATE_SUB_ITEM_OPTION = '__create_sub_item__';
const PLACEHOLDER_PHASE_OPTION = '__no_phase__';

export default function ActivityContextPicker({
  items,
  value,
  onChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  compact = false,
  itemsLoading = false,
}: ActivityContextPickerProps) {
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [creating, setCreating] = useState<CreateLevel | null>(null);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userCategoryIds, setUserCategoryIds] = useState<Set<string>>(() => new Set());
  const scopedUserId = items[0]?.user_id;

  useEffect(() => {
    if (!scopedUserId) return;
    setUserCategoryIds(loadUserCategoryIds(scopedUserId));
  }, [scopedUserId]);

  useEffect(() => {
    if (!scopedUserId) return;
    saveUserCategoryIds(scopedUserId, userCategoryIds);
  }, [scopedUserId, userCategoryIds]);

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

  /** 二类下挂的三类 Item */
  const level3Items = useMemo(() => {
    if (!value.itemId || value.subItemId) return [];
    if (getItemDepth(items, value.itemId) !== 1) return [];
    return getChildItems(items, value.itemId);
  }, [items, value.itemId, value.subItemId]);

  const subItemHostId = useMemo(() => {
    if (!value.itemId) return null;
    if (value.subItemId) return resolveSubItemHostItemId(value);
    const depth = getItemDepth(items, value.itemId);
    if (depth === 2) {
      const item = items.find((i) => i.id === value.itemId);
      return item?.parent_item_id ?? null;
    }
    if (depth === 1) return value.itemId;
    return null;
  }, [value, items]);

  const phaseHostItemId = useMemo(() => resolveTargetItemId(value), [value]);

  const phaseOptions = useMemo(() => {
    const list = [...phases];
    if (value.phaseId && !list.some((p) => p.id === value.phaseId)) {
      list.unshift({
        id: value.phaseId,
        user_id: '',
        item_id: phaseHostItemId || '',
        title: value.phaseTitle || '已关联阶段',
        description: null,
        start_date: null,
        end_date: null,
        status: '进行中',
        is_historical: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      });
    }
    return list;
  }, [phases, value.phaseId, value.phaseTitle, phaseHostItemId]);

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
  }, [subItemHostId, onSubItemsLoaded]);

  useEffect(() => {
    if (!phaseHostItemId) {
      setPhases([]);
      return;
    }
    let cancelled = false;
    setPhaseLoading(true);
    fetch(
      `/api/v2/phases?item_id=${encodeURIComponent(phaseHostItemId)}&status=${encodeURIComponent('进行中')}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPhases(data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPhases([]);
      })
      .finally(() => {
        if (!cancelled) setPhaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phaseHostItemId]);

  const labelClass = compact
    ? 'text-[10px] text-slate-400 w-8 shrink-0'
    : 'text-[10px] text-slate-400 w-10 shrink-0';

  const selectClass =
    'flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-50 min-w-0';

  const clearPhase = (): Pick<ActivityContextValue, 'phaseId' | 'phaseTitle'> => ({
    phaseId: '',
    phaseTitle: undefined,
  });

  const setCategory = (categoryItemId: string, categoryTitle?: string) => {
    onChange({
      categoryItemId,
      categoryTitle,
      itemId: '',
      itemTitle: undefined,
      subItemId: '',
      subItemTitle: undefined,
      ...clearPhase(),
    });
  };

  const setItem = (itemId: string, itemTitle?: string) => {
    onChange({
      ...value,
      itemId,
      itemTitle,
      subItemId: '',
      subItemTitle: undefined,
      ...clearPhase(),
    });
  };

  const setSubItem = (subItemId: string, subItemTitle?: string) => {
    onChange({ ...value, subItemId, subItemTitle });
  };

  const setPhase = (phaseId: string, phaseTitle?: string) => {
    onChange({ ...value, phaseId, phaseTitle });
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
      const msg = '请先选择一类';
      setCreateError(msg);
      onCreateError?.(msg);
      return;
    }
    if (creating === 'subItem' && !subItemHostId) {
      const msg = '请先选择二类';
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
        if (!item?.id) throw new Error('创建成功但未返回数据');
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
        if (!item?.id) throw new Error('创建成功但未返回数据');
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
        if (!sub?.id) throw new Error('创建成功但未返回数据');
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

  const pathParts = [value.categoryTitle, value.itemTitle, value.subItemTitle].filter(Boolean);
  const showPhaseRow =
    !!phaseHostItemId &&
    (phaseLoading || phaseOptions.length > 0 || !!value.phaseId);

  const isL2Selected =
    !!value.itemId && getItemDepth(items, value.itemId) === 1;

  const showL3Row = isL2Selected;

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {!compact && (
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">一类</p>
        )}

        {creating === 'category' ? (
          renderCreateRow('新一类名称')
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {categoryItems.length === 0 && items.length === 0 && itemsLoading && (
              <span className="text-[11px] text-slate-400 py-0.5">加载…</span>
            )}
            {categoryItems.length === 0 && items.length === 0 && !itemsLoading && (
              <span className="text-[11px] text-slate-400 py-0.5">暂无一类，请新建</span>
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

        {value.categoryItemId && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            {creating === 'item' ? (
              renderCreateRow('新二类名称')
            ) : (
              <>
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
                >
                  <option value={PLACEHOLDER_ITEM_OPTION} disabled>
                    选择二类
                  </option>
                  <option value={CREATE_ITEM_OPTION}>+ 新建二类</option>
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
                  aria-label="新建二类"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}

        {isL2Selected && showL3Row && creating !== 'subItem' && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            {subLoading ? (
              <span className="text-[11px] text-slate-400">加载三类…</span>
            ) : subItems.length === 0 && level3Items.length === 0 ? (
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-slate-400">无三类（可不选）</span>
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
              <>
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
                    if (sub) {
                      setSubItem(sub.id, sub.title);
                      return;
                    }
                    const l3 = level3Items.find((i) => i.id === e.target.value);
                    if (l3) setItem(l3.id, l3.title);
                  }}
                  className={selectClass}
                >
                  <option value={PLACEHOLDER_SUB_ITEM_OPTION}>不选三类</option>
                  {level3Items.map((l3) => (
                    <option key={l3.id} value={l3.id}>
                      {l3.title}
                    </option>
                  ))}
                  {subItems.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.title}
                    </option>
                  ))}
                  <option value={CREATE_SUB_ITEM_OPTION}>+ 新建三类</option>
                </select>
                <button
                  type="button"
                  onClick={() => startCreate('subItem')}
                  className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
                  aria-label="新建三类"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}

        {isL2Selected && creating === 'subItem' && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            {renderCreateRow('新三类名称')}
          </div>
        )}
      </div>

      {showPhaseRow && (
        <div className="flex items-center gap-2">
          <span className={labelClass}>阶段</span>
          {phaseLoading ? (
            <span className="text-[11px] text-slate-400">加载阶段…</span>
          ) : (
            <select
              value={value.phaseId || PLACEHOLDER_PHASE_OPTION}
              onChange={(e) => {
                if (e.target.value === PLACEHOLDER_PHASE_OPTION) {
                  setPhase('', undefined);
                  return;
                }
                const phase = phaseOptions.find((p) => p.id === e.target.value);
                setPhase(e.target.value, phase?.title);
              }}
              className={selectClass}
            >
              <option value={PLACEHOLDER_PHASE_OPTION}>不选阶段</option>
              {phaseOptions.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {(pathParts.length > 0 || value.phaseTitle) && (
        <p className="text-[10px] text-slate-400">
          {[pathParts.join(' → '), value.phaseTitle].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}
