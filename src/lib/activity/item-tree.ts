import type { Item } from '@/types/teto';
import { ACTIVITY_CATEGORY_PRESETS } from '@/lib/activity/constants';

const ACTIVE_ITEM_STATUSES = new Set(['活跃', '推进中', '放缓', '停滞']);
const PRESET_SET = new Set<string>(ACTIVITY_CATEGORY_PRESETS);

export function isActiveItem(item: Item): boolean {
  return ACTIVE_ITEM_STATUSES.has(item.status);
}

/** 是否为大类节点 */
export function isCategoryItem(item: Item, items: Item[], selectedCategoryId?: string): boolean {
  if (!isActiveItem(item) || item.parent_item_id) return false;
  if (PRESET_SET.has(item.title)) return true;
  if (items.some((i) => i.parent_item_id === item.id)) return true;
  if (selectedCategoryId && item.id === selectedCategoryId) return true;
  return false;
}

/** 大类 chips：预设 / 有子事项 / 当前选中 */
export function getCategoryItems(items: Item[], selectedCategoryId?: string): Item[] {
  const cats = items.filter((i) => isCategoryItem(i, items, selectedCategoryId));
  return cats.sort((a, b) => {
    const aPreset = PRESET_SET.has(a.title) ? 0 : 1;
    const bPreset = PRESET_SET.has(b.title) ? 0 : 1;
    if (aPreset !== bPreset) return aPreset - bPreset;
    const aIdx = ACTIVITY_CATEGORY_PRESETS.indexOf(a.title as (typeof ACTIVITY_CATEGORY_PRESETS)[number]);
    const bIdx = ACTIVITY_CATEGORY_PRESETS.indexOf(b.title as (typeof ACTIVITY_CATEGORY_PRESETS)[number]);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

/** 某大类下的子事项 */
export function getChildItems(items: Item[], parentItemId: string): Item[] {
  return items.filter((i) => i.parent_item_id === parentItemId && isActiveItem(i));
}

/** 未挂大类的 legacy 事项（parent 为空且不是大类） */
export function getOrphanItems(items: Item[], selectedCategoryId?: string): Item[] {
  return items.filter(
    (i) => isActiveItem(i) && !i.parent_item_id && !isCategoryItem(i, items, selectedCategoryId)
  );
}

/** 某大类下可选的事项（「其他」含未归类事项） */
export function getItemsForCategory(
  items: Item[],
  categoryItemId: string,
  selectedCategoryId?: string
): Item[] {
  const category = items.find((i) => i.id === categoryItemId);
  const children = getChildItems(items, categoryItemId);
  if (category && category.title === '其他') {
    const orphans = getOrphanItems(items, selectedCategoryId);
    const seen = new Set(children.map((i) => i.id));
    return [...children, ...orphans.filter((i) => !seen.has(i.id))];
  }
  return children;
}

/** 解析记录/活动应关联的 item_id（优先最具体层级） */
export function resolveTargetItemId(ctx: {
  itemId?: string;
  categoryItemId?: string;
}): string | null {
  return ctx.itemId || ctx.categoryItemId || null;
}

/** 从上下文解析默认 content */
export function resolveContextLabel(
  ctx: {
    categoryItemId?: string;
    itemId?: string;
    categoryTitle?: string;
    itemTitle?: string;
    subItemTitle?: string;
  },
  items: Item[],
  text?: string
): string {
  if (text?.trim()) return text.trim();
  if (ctx.subItemTitle) return ctx.subItemTitle;
  if (ctx.itemTitle) return ctx.itemTitle;
  if (ctx.itemId) {
    const item = items.find((i) => i.id === ctx.itemId);
    if (item) return item.title;
  }
  if (ctx.categoryTitle) return ctx.categoryTitle;
  if (ctx.categoryItemId) {
    const cat = items.find((i) => i.id === ctx.categoryItemId);
    if (cat) return cat.title;
  }
  return '';
}

/** @deprecated 请使用 ensureCategoryItems */
export async function seedTopLevelCategories(): Promise<Item[]> {
  const res = await fetch('/api/v2/items/seed-categories', { method: 'POST' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data?.created ?? [];
}

export function buildContextPathLabel(
  items: Item[],
  categoryItemId: string,
  itemId: string,
  subItemTitle?: string
): string {
  const parts: string[] = [];
  const category = items.find((i) => i.id === categoryItemId);
  if (category) parts.push(category.title);
  const child = items.find((i) => i.id === itemId);
  if (child) parts.push(child.title);
  if (subItemTitle) parts.push(subItemTitle);
  return parts.join(' / ');
}

/** 从 item_id 解析大类名称（用于统计分组） */
export function resolveCategoryTitleForItem(
  items: Item[],
  itemId: string | null | undefined
): string | null {
  if (!itemId) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;
  if (item.parent_item_id) {
    const parent = items.find((i) => i.id === item.parent_item_id);
    return parent?.title ?? item.title;
  }
  return item.title;
}

/** 记录/快速切换展示标签 */
export function buildItemPathLabel(
  items: Item[],
  itemId: string | null | undefined,
  contentFallback?: string
): string {
  if (!itemId) return contentFallback?.trim() ?? '';
  const item = items.find((i) => i.id === itemId);
  if (!item) return contentFallback?.trim() ?? '';
  const parts: string[] = [];
  if (item.parent_item_id) {
    const parent = items.find((i) => i.id === item.parent_item_id);
    if (parent) parts.push(parent.title);
  }
  parts.push(item.title);
  const path = parts.join(' / ');
  const content = contentFallback?.trim();
  if (content && content !== item.title && !path.endsWith(content)) {
    return `${path} · ${content}`;
  }
  return path || content || item.title;
}

/** 记录展示文案（优先 item 树，兼容旧 category 字段） */
export function buildRecordDisplayLabel(record: {
  content?: string | null;
  category?: string | null;
  subcategory?: string | null;
  item_id?: string | null;
  item?: { title?: string } | null;
}, items?: Item[]): string {
  if (items && record.item_id) {
    const label = buildItemPathLabel(items, record.item_id, record.content ?? undefined);
    if (label) return label;
  }
  const parts = [record.category, record.subcategory, record.item?.title, record.content].filter(
    Boolean
  );
  return parts.join(' / ') || record.content || '';
}
