import type { Item } from '@/types/teto';
import { getCategoryItems } from '@/lib/activity/item-tree';

/** 同页并发去重，避免多处同时触发种子 */
let seedPromise: Promise<Item[] | null> | null = null;

/**
 * 若尚无大类，调用服务端批量种子（单次请求）。
 * 返回最新 items 列表；无需更新时返回 null。
 */
export async function ensureCategoryItems(items: Item[]): Promise<Item[] | null> {
  if (getCategoryItems(items).length > 0) return null;

  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const res = await fetch('/api/v2/items/seed-categories', { method: 'POST' });
        if (!res.ok) return null;
        const data = await res.json();
        const nextItems: Item[] = data.data?.items ?? [];
        return nextItems.length > 0 ? nextItems : null;
      } catch {
        return null;
      } finally {
        seedPromise = null;
      }
    })();
  }

  return seedPromise;
}
