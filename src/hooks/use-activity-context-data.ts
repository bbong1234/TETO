'use client';

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import type { Item, Phase, SubItem } from '@/types/teto';
import type {
  ActivityContextCreateLevel,
  ActivityContextValue,
} from '@/lib/activity/activity-context-types';
import {
  buildItemTreeIndex,
  getCategoryItemsFromIndex,
  getItemsForCategoryFromIndex,
  getItemPath,
  isActiveItem,
  listLevel3ItemOptions,
  normalizeOrgLevels,
  resolveSubItemHostItemId,
  resolveTargetItemId,
} from '@/lib/activity/item-tree';

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

const subItemsCache = new Map<string, SubItem[]>();
const phasesCache = new Map<string, Phase[]>();
const subItemsInflight = new Set<string>();
const phasesInflight = new Set<string>();

/** 批量加载多个 item 的 SubItems，复用同一个模块级缓存 */
export async function loadSubItemsForHosts(itemIds: string[]): Promise<Map<string, SubItem[]>> {
  const result = new Map<string, SubItem[]>();
  await Promise.all(
    itemIds.map(async (id) => {
      if (!subItemsCache.has(id)) {
        try {
          const res = await fetch(`/api/v2/sub-items?item_id=${id}`);
          const data = await res.json();
          subItemsCache.set(id, (data.data as SubItem[]) ?? []);
        } catch {
          subItemsCache.set(id, []);
        }
      }
      result.set(id, subItemsCache.get(id) ?? []);
    })
  );
  return result;
}

export function prefetchSubItemsForHost(hostId: string): void {
  if (subItemsCache.has(hostId) || subItemsInflight.has(hostId)) return;
  subItemsInflight.add(hostId);
  fetch(`/api/v2/sub-items?item_id=${hostId}`)
    .then((res) => res.json())
    .then((data) => {
      subItemsCache.set(hostId, (data.data as SubItem[]) ?? []);
    })
    .catch(() => {
      subItemsCache.set(hostId, []);
    })
    .finally(() => {
      subItemsInflight.delete(hostId);
    });
}

export function prefetchPhasesForHost(hostId: string): void {
  if (phasesCache.has(hostId) || phasesInflight.has(hostId)) return;
  phasesInflight.add(hostId);
  fetch(
    `/api/v2/phases?item_id=${encodeURIComponent(hostId)}&status=${encodeURIComponent('进行中')}`
  )
    .then((res) => res.json())
    .then((data) => {
      phasesCache.set(hostId, (data.data as Phase[]) ?? []);
    })
    .catch(() => {
      phasesCache.set(hostId, []);
    })
    .finally(() => {
      phasesInflight.delete(hostId);
    });
}

export interface UseActivityContextDataOptions {
  items: Item[];
  value: ActivityContextValue;
  onChange: (value: ActivityContextValue) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubItemsLoaded?: (subItems: SubItem[]) => void;
}

export function useActivityContextData({
  items,
  value,
  onChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
}: UseActivityContextDataOptions) {
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [creating, setCreating] = useState<ActivityContextCreateLevel | null>(null);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userCategoryIds, setUserCategoryIds] = useState<Set<string>>(() => new Set());
  const [categoryIdsWithRecords, setCategoryIdsWithRecords] = useState<Set<string>>(() => new Set());
  const [activeCategoryId, setActiveCategoryId] = useState(value.categoryItemId);
  const scopedUserId = items[0]?.user_id;
  const onSubItemsLoadedRef = useRef(onSubItemsLoaded);
  onSubItemsLoadedRef.current = onSubItemsLoaded;

  const itemIndex = useMemo(() => buildItemTreeIndex(items), [items]);

  useEffect(() => {
    const catId = value.categoryItemId;
    if (!catId) {
      setActiveCategoryId('');
      return;
    }
    const cat = itemIndex.itemById.get(catId);
    if (cat?.parent_item_id) {
      const path = getItemPath(items, catId);
      setActiveCategoryId(path[0]?.id ?? catId);
      return;
    }
    setActiveCategoryId(catId);
  }, [value.categoryItemId, items, itemIndex]);

  useEffect(() => {
    if (!scopedUserId) return;
    setUserCategoryIds(loadUserCategoryIds(scopedUserId));
  }, [scopedUserId]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v2/items/explorer-summaries')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const ids = new Set<string>(
          (json.data ?? []).map((s: { id: string }) => s.id)
        );
        setCategoryIdsWithRecords(ids);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scopedUserId) return;
    saveUserCategoryIds(scopedUserId, userCategoryIds);
  }, [scopedUserId, userCategoryIds]);

  const categoryItems = useMemo(
    () =>
      getCategoryItemsFromIndex(
        items,
        itemIndex,
        activeCategoryId || undefined,
        userCategoryIds,
        categoryIdsWithRecords
      ),
    [items, itemIndex, activeCategoryId, userCategoryIds, categoryIdsWithRecords]
  );

  const orgLevels = useMemo(
    () => normalizeOrgLevels(items, value.itemId, value.subItemId),
    [items, value.itemId, value.subItemId]
  );

  const childItems = useMemo(() => {
    if (!activeCategoryId) return [];
    const base = getItemsForCategoryFromIndex(
      items,
      itemIndex,
      activeCategoryId,
      activeCategoryId
    );
    const l2Id = orgLevels.l2ItemId;
    if (!l2Id) return base;
    const selected = itemIndex.itemById.get(l2Id);
    if (
      selected &&
      isActiveItem(selected) &&
      !base.some((i) => i.id === selected.id)
    ) {
      return [...base, selected];
    }
    return base;
  }, [items, itemIndex, activeCategoryId, orgLevels.l2ItemId]);

  const itemDepth = orgLevels.itemDepth;

  const l2SelectedId = orgLevels.l2ItemId;

  const l2FallbackLabel = useMemo(() => {
    if (l2SelectedId && l2SelectedId !== value.itemId) {
      return itemIndex.itemById.get(l2SelectedId)?.title ?? value.itemTitle;
    }
    return value.itemTitle;
  }, [l2SelectedId, value.itemId, value.itemTitle, itemIndex]);

  const level3Items = useMemo(() => {
    if (!orgLevels.l2ItemId || value.subItemId) return [];
    return listLevel3ItemOptions(items, orgLevels.l2ItemId);
  }, [items, orgLevels.l2ItemId, value.subItemId]);

  const subItemHostId = useMemo(() => {
    if (!value.itemId) return null;
    if (value.subItemId) return orgLevels.l2ItemId || resolveSubItemHostItemId(value);
    if (orgLevels.l2ItemId && orgLevels.itemDepth >= 1) return orgLevels.l2ItemId;
    return null;
  }, [value, orgLevels.l2ItemId, orgLevels.itemDepth]);

  const phaseHostItemId = useMemo(() => resolveTargetItemId(value), [value]);

  const isL2Selected = Boolean(l2SelectedId && orgLevels.itemDepth >= 1);

  const hasL3Content =
    subLoading ||
    level3Items.length > 0 ||
    subItems.length > 0 ||
    Boolean(orgLevels.l3ItemId || orgLevels.subItemId);

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
    if (!activeCategoryId || childItems.length === 0) return;
    for (const child of childItems) {
      prefetchSubItemsForHost(child.id);
      prefetchPhasesForHost(child.id);
    }
  }, [activeCategoryId, childItems]);

  const notifySubItemsLoaded = useCallback((list: SubItem[]) => {
    queueMicrotask(() => onSubItemsLoadedRef.current?.(list));
  }, []);

  const applyCachedSubItemsForHost = useCallback(
    (hostId: string) => {
      const cached = subItemsCache.get(hostId);
      if (cached) {
        setSubItems(cached);
        setSubLoading(false);
        notifySubItemsLoaded(cached);
        return true;
      }
      setSubLoading(true);
      return false;
    },
    [notifySubItemsLoaded]
  );

  const applyCachedPhasesForHost = useCallback((hostId: string) => {
    const cached = phasesCache.get(hostId);
    if (cached) {
      setPhases(cached);
      setPhaseLoading(false);
      return true;
    }
    setPhaseLoading(true);
    return false;
  }, []);

  useEffect(() => {
    if (!subItemHostId) {
      setSubItems([]);
      setSubLoading(false);
      notifySubItemsLoaded([]);
      return;
    }

    const cached = subItemsCache.get(subItemHostId);
    if (cached) {
      setSubItems(cached);
      setSubLoading(false);
      notifySubItemsLoaded(cached);
      return;
    }

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setSubLoading(true);
    }, 120);

    fetch(`/api/v2/sub-items?item_id=${subItemHostId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list: SubItem[] = data.data ?? [];
        subItemsCache.set(subItemHostId, list);
        setSubItems(list);
        notifySubItemsLoaded(list);
      })
      .catch(() => {
        if (!cancelled) {
          setSubItems([]);
          notifySubItemsLoaded([]);
        }
      })
      .finally(() => {
        window.clearTimeout(loadingTimer);
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [subItemHostId, notifySubItemsLoaded]);

  useEffect(() => {
    if (!phaseHostItemId) {
      setPhases([]);
      setPhaseLoading(false);
      return;
    }

    const cached = phasesCache.get(phaseHostItemId);
    if (cached) {
      setPhases(cached);
      setPhaseLoading(false);
      return;
    }

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setPhaseLoading(true);
    }, 120);

    fetch(
      `/api/v2/phases?item_id=${encodeURIComponent(phaseHostItemId)}&status=${encodeURIComponent('进行中')}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list: Phase[] = data.data ?? [];
        phasesCache.set(phaseHostItemId, list);
        setPhases(list);
      })
      .catch(() => {
        if (!cancelled) setPhases([]);
      })
      .finally(() => {
        window.clearTimeout(loadingTimer);
        if (!cancelled) setPhaseLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [phaseHostItemId]);

  const clearPhase = (): Pick<ActivityContextValue, 'phaseId' | 'phaseTitle'> => ({
    phaseId: '',
    phaseTitle: undefined,
  });

  const setCategory = useCallback(
    (categoryItemId: string, categoryTitle?: string) => {
      setActiveCategoryId(categoryItemId);
      startTransition(() => {
        onChange({
          categoryItemId,
          categoryTitle,
          itemId: '',
          itemTitle: undefined,
          subItemId: '',
          subItemTitle: undefined,
          ...clearPhase(),
        });
      });
    },
    [onChange]
  );

  const setItem = useCallback(
    (itemId: string, itemTitle?: string) => {
      startTransition(() => {
        onChange({
          ...value,
          itemId,
          itemTitle,
          subItemId: '',
          subItemTitle: undefined,
          ...clearPhase(),
        });
      });
    },
    [onChange, value]
  );

  const setSubItem = useCallback(
    (subItemId: string, subItemTitle?: string) => {
      startTransition(() => {
        onChange({ ...value, subItemId, subItemTitle });
      });
    },
    [onChange, value]
  );

  const setPhase = useCallback(
    (phaseId: string, phaseTitle?: string) => {
      startTransition(() => {
        onChange({ ...value, phaseId, phaseTitle });
      });
    },
    [onChange, value]
  );

  const startCreate = useCallback((level: ActivityContextCreateLevel) => {
    setCreateError(null);
    setCreating(level);
    setCreateText('');
  }, []);

  const cancelCreate = useCallback(() => {
    setCreating(null);
    setCreateText('');
    setCreateError(null);
  }, []);

  const parseCreateError = (
    res: Response,
    data: { error?: { message?: string }; conflict?: { message?: string } }
  ) => {
    if (res.status === 409 && data.conflict?.message) return data.conflict.message;
    return data.error?.message ?? '创建失败';
  };

  const submitCreate = useCallback(async () => {
    const title = createText.trim();
    if (!title || !creating) return;
    if (creating === 'item' && !activeCategoryId) {
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
          body: JSON.stringify({ title, parent_item_id: activeCategoryId }),
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
        if (subItemHostId) subItemsCache.set(subItemHostId, next);
        setSubItems(next);
        notifySubItemsLoaded(next);
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
  }, [
    createText,
    creating,
    activeCategoryId,
    subItemHostId,
    subItems,
    markUserCategory,
    onItemCreated,
    onItemsChange,
    onCreateError,
    setCategory,
    setItem,
    setSubItem,
    notifySubItemsLoaded,
    cancelCreate,
  ]);

  const pathParts = [value.categoryTitle, value.itemTitle, value.subItemTitle].filter(Boolean);

  const l3SelectedId = orgLevels.subItemId || orgLevels.l3ItemId;

  const l3FallbackLabel =
    value.subItemTitle ||
    (orgLevels.l3ItemId ? itemIndex.itemById.get(orgLevels.l3ItemId)?.title : undefined);

  const clearL3Selection = useCallback(() => {
    if (value.subItemId) {
      setSubItem('', undefined);
      return;
    }
    if (orgLevels.l3ItemId && orgLevels.l2ItemId) {
      const parent = childItems.find((c) => c.id === orgLevels.l2ItemId);
      setItem(orgLevels.l2ItemId, parent?.title ?? value.itemTitle);
    }
  }, [value, orgLevels, childItems, setSubItem, setItem]);

  const pickL2Item = useCallback(
    (id: string) => {
      const child = childItems.find((i) => i.id === id);
      applyCachedSubItemsForHost(id);
      applyCachedPhasesForHost(id);
      setItem(id, child?.title);
    },
    [childItems, applyCachedSubItemsForHost, applyCachedPhasesForHost, setItem]
  );

  const pickL3Option = useCallback(
    (id: string) => {
      const sub = subItems.find((s) => s.id === id);
      if (sub) {
        setSubItem(sub.id, sub.title);
        return;
      }
      const l3 = level3Items.find((i) => i.id === id);
      if (l3) setItem(l3.id, l3.title);
    },
    [subItems, level3Items, setSubItem, setItem]
  );

  return {
    activeCategoryId,
    categoryItems,
    childItems,
    level3Items,
    subItems,
    subLoading,
    phases,
    phaseLoading,
    phaseOptions,
    phaseHostItemId,
    subItemHostId,
    itemDepth,
    isL2Selected,
    hasL3Content,
    creating,
    createText,
    setCreateText,
    createSubmitting,
    createError,
    pathParts,
    l3SelectedId,
    l3FallbackLabel,
    l2SelectedId,
    l2FallbackLabel,
    setCategory,
    setItem,
    setSubItem,
    setPhase,
    startCreate,
    cancelCreate,
    submitCreate,
    clearL3Selection,
    pickL2Item,
    pickL3Option,
    applyCachedSubItemsForHost,
    applyCachedPhasesForHost,
  };
}
