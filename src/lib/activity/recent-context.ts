import type { Item, Record as TetoRecord } from '@/types/teto';
import {
  type ActivityContextShape,
  buildItemPathLabel,
  getItemPath,
  getItemDepth,
  isActiveItem,
  resolveActivityContextFromRecord,
  resolveCategoryTitleForItem,
  resolveTargetItemId,
  extractSwitchLabel,
} from '@/lib/activity/item-tree';

const LAST_CONTEXT_KEY = 'teto_last_activity_context';

/** 无归属进行中的占位文案（与 activity-service 一致） */
export const UNASSIGNED_ACTIVE_PLACEHOLDER = '进行中';

/** 计时中展示标题：大类已选时不重复拼接占位/大类名 */
export function formatActiveActivityTitle(
  items: Item[],
  activity: { item_id?: string | null; content?: string | null }
): string {
  const contextLabel = activity.item_id
    ? buildItemPathLabel(items, activity.item_id)
    : '';
  const content = activity.content?.trim() ?? '';

  if (!contextLabel) {
    return content || UNASSIGNED_ACTIVE_PLACEHOLDER;
  }
  if (!content || content === UNASSIGNED_ACTIVE_PLACEHOLDER) {
    return contextLabel;
  }

  if (extractSwitchLabel(content)) {
    return contextLabel;
  }

  const categoryTitle = resolveCategoryTitleForItem(items, activity.item_id);
  if (categoryTitle && content === categoryTitle) {
    return contextLabel;
  }

  const path = activity.item_id ? getItemPath(items, activity.item_id) : [];
  const leaf = path[path.length - 1]?.title;
  if (leaf && content === leaf) {
    return contextLabel;
  }

  return `${contextLabel} › ${content}`;
}

export const PAYMENT_SOURCES = ['支付宝', '微信', '银行卡', '现金'] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

const LAST_PAYMENT_KEY = 'teto_last_payment_source';

export function loadLastActivityContext(): ActivityContextShape | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LAST_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivityContextShape;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastActivityContext(ctx: ActivityContextShape): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function loadLastPaymentSource(): PaymentSource {
  if (typeof window === 'undefined') return PAYMENT_SOURCES[0];
  try {
    const raw = localStorage.getItem(LAST_PAYMENT_KEY);
    if (raw && (PAYMENT_SOURCES as readonly string[]).includes(raw)) {
      return raw as PaymentSource;
    }
  } catch {
    /* ignore */
  }
  return PAYMENT_SOURCES[0];
}

export function saveLastPaymentSource(source: PaymentSource): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_PAYMENT_KEY, source);
  } catch {
    /* ignore */
  }
}

/** 记录页最近事项 chip：优先上次上下文，再取今日记录中的 item */
export function getRecentItemsForChips(
  items: Item[],
  todayRecords: TetoRecord[],
  lastContext: ActivityContextShape | null,
  limit = 3
): Item[] {
  const seen = new Set<string>();
  const result: Item[] = [];

  const pushItem = (itemId: string | null | undefined) => {
    if (!itemId || seen.has(itemId)) return;
    const item = items.find((i) => i.id === itemId);
    if (!item || !isActiveItem(item)) return;
    if (getItemDepth(items, item.id) < 1) return;
    seen.add(itemId);
    result.push(item);
  };

  const lastItemId = lastContext ? resolveTargetItemId(lastContext) : null;
  pushItem(lastItemId);

  for (let i = todayRecords.length - 1; i >= 0 && result.length < limit; i--) {
    pushItem(todayRecords[i].item_id);
  }

  if (result.length < limit) {
    for (const item of items) {
      if (result.length >= limit) break;
      if (!isActiveItem(item) || getItemDepth(items, item.id) < 1) continue;
      pushItem(item.id);
    }
  }

  return result.slice(0, limit);
}

export function contextFromItem(items: Item[], itemId: string): ActivityContextShape {
  return resolveActivityContextFromRecord(items, itemId);
}
