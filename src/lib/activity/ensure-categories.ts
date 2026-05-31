import type { Item } from '@/types/teto';

/** 同页并发去重，避免多处同时触发种子 */
let seedPromise: Promise<Item[] | null> | null = null;

/** 是否需首次种子（库中尚无任何顶层 item） */
export function needsCategorySeed(items: Item[]): boolean {
  return !items.some((i) => !i.parent_item_id);
}

/**
 * 若尚无顶层 item，调用服务端批量种子（单次请求）。
 * 返回最新 items 列表；无需更新时返回 null。
 */
export async function ensureCategoryItems(items: Item[]): Promise<Item[] | null> {
  if (!needsCategorySeed(items)) return null;
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
