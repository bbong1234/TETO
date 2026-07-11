import type { Item, Record as TetoRecord } from '@/types/teto';
import { DEFAULT_QUICK_START_LABELS } from '@/lib/activity/constants';
import {
  getCategoryItems,
  getItemPath,
  isCategoryItem,
} from '@/lib/activity/item-tree';

export interface QuickStartBubble {
  key: string;
  label: string;
  /** 归属 L1 大类 item id */
  categoryItemId: string;
}

const DEFAULT_LIMIT = 6;

function recordSortTime(r: TetoRecord): string {
  return r.occurred_at || r.created_at || '';
}

/** 按标题匹配顶层大类（含未使用的预置大类） */
export function findCategoryItemByTitle(items: Item[], title: string): Item | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const categories = getCategoryItems(items, undefined, undefined, {
    showUnusedPresets: true,
  });
  return categories.find((c) => c.title === trimmed) ?? null;
}

function categoryFromRecord(
  record: TetoRecord,
  items: Item[]
): { label: string; categoryItemId: string } | null {
  if (record.item_id) {
    const path = getItemPath(items, record.item_id);
    const root = path[0];
    if (root && isCategoryItem(root, items)) {
      return { label: root.title, categoryItemId: root.id };
    }
  }
  return null;
}

/**
 * 从近期「发生」记录统计 L1 大类使用频次；不足时用 DEFAULT + 在用的类别补齐。
 * 气泡仅展示已存在的大类节点。
 */
export function buildQuickStartBubbles(
  records: TetoRecord[],
  items: Item[] = [],
  options?: { limit?: number; todayDate?: string }
): QuickStartBubble[] {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const todayDate = options?.todayDate;

  if (items.length === 0) return [];

  const occurrence = records.filter((r) => r.type === '发生');
  const sorted = [...occurrence].sort((a, b) =>
    recordSortTime(b).localeCompare(recordSortTime(a))
  );

  const stats = new Map<
    string,
    { label: string; categoryItemId: string; count: number; lastAt: string }
  >();

  for (const record of sorted) {
    const cat = categoryFromRecord(record, items);
    if (!cat) continue;

    const lastAt = recordSortTime(record);
    const existing = stats.get(cat.categoryItemId);
    if (existing) {
      existing.count += 1;
      if (lastAt > existing.lastAt) existing.lastAt = lastAt;
    } else {
      stats.set(cat.categoryItemId, { ...cat, count: 1, lastAt });
    }
  }

  const ranked = [...stats.values()].sort((a, b) => {
    if (todayDate) {
      const aToday = sorted.some((r) => {
        const cat = categoryFromRecord(r, items);
        return (
          cat?.categoryItemId === a.categoryItemId &&
          (r.occurred_at?.startsWith(todayDate) || r.date === todayDate)
        );
      });
      const bToday = sorted.some((r) => {
        const cat = categoryFromRecord(r, items);
        return (
          cat?.categoryItemId === b.categoryItemId &&
          (r.occurred_at?.startsWith(todayDate) || r.date === todayDate)
        );
      });
      if (aToday !== bToday) return aToday ? -1 : 1;
    }
    const timeCmp = b.lastAt.localeCompare(a.lastAt);
    if (timeCmp !== 0) return timeCmp;
    return b.count - a.count;
  });

  const result: QuickStartBubble[] = [];
  const seen = new Set<string>();

  const pushBubble = (label: string, categoryItemId: string) => {
    if (seen.has(categoryItemId) || result.length >= limit) return;
    seen.add(categoryItemId);
    result.push({ key: categoryItemId, label, categoryItemId });
  };

  for (const entry of ranked) {
    pushBubble(entry.label, entry.categoryItemId);
  }

  for (const fallbackLabel of DEFAULT_QUICK_START_LABELS) {
    if (result.length >= limit) break;
    const cat = findCategoryItemByTitle(items, fallbackLabel);
    if (cat) pushBubble(cat.title, cat.id);
  }

  if (result.length < limit) {
    for (const cat of getCategoryItems(items, undefined, undefined, {
      showUnusedPresets: true,
    })) {
      if (result.length >= limit) break;
      pushBubble(cat.title, cat.id);
    }
  }

  return result;
}
