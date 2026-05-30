import type { Item } from '@/types/teto';
import {
  ACTIVITY_CATEGORY_PRESETS,
  SKILL_CATEGORY_PRESETS,
  SKILL_DEFAULT_ITEM_TITLES,
  type SkillCategoryPreset,
} from '@/lib/activity/constants';

const ACTIVE_ITEM_STATUSES = new Set(['活跃', '推进中', '放缓', '停滞']);
const PRESET_SET = new Set<string>(ACTIVITY_CATEGORY_PRESETS);
const SKILL_PRESET_SET = new Set<string>(SKILL_CATEGORY_PRESETS);

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

/** 大类 chips：预设 / 有子事项 / 当前选中 / 用户标记的大类 */
export function getCategoryItems(
  items: Item[],
  selectedCategoryId?: string,
  userCategoryIds?: ReadonlySet<string>
): Item[] {
  const cats = items.filter((i) => {
    if (!isActiveItem(i) || i.parent_item_id) return false;
    if (userCategoryIds?.has(i.id)) return true;
    return isCategoryItem(i, items, selectedCategoryId);
  });
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

/** 活动上下文（大类 / 事项 / 子项）— 与 ActivityContextPicker 一致 */
export interface ActivityContextShape {
  categoryItemId: string;
  categoryTitle?: string;
  itemId: string;
  itemTitle?: string;
  subItemId: string;
  subItemTitle?: string;
}

export const EMPTY_ACTIVITY_CONTEXT: ActivityContextShape = {
  categoryItemId: '',
  itemId: '',
  subItemId: '',
};

/** 是否为技能型大类 */
export function isSkillCategoryItem(item: Item): boolean {
  return SKILL_PRESET_SET.has(item.title);
}

/** 查找技能型大类下的默认事项 */
export function findSkillDefaultItem(
  items: Item[],
  categoryItemId: string
): Item | undefined {
  const category = items.find((i) => i.id === categoryItemId);
  if (!category || category.parent_item_id) return undefined;
  const defaultTitle = SKILL_DEFAULT_ITEM_TITLES[category.title as SkillCategoryPreset];
  if (!defaultTitle) return undefined;
  return items.find(
    (i) => i.parent_item_id === category.id && i.title === defaultTitle
  );
}

/** 查找英语大类下的默认事项「英语学习」 */
export function findEnglishDefaultItem(items: Item[]): Item | undefined {
  const english = items.find((i) => !i.parent_item_id && i.title === '英语');
  if (!english) return undefined;
  return findSkillDefaultItem(items, english.id);
}

/** 子项挂在事项 id 上 */
export function resolveSubItemHostItemId(ctx: { itemId?: string }): string | null {
  return ctx.itemId || null;
}

/** 解析记录/活动应关联的 item_id（必须为具体事项，不可直挂大类） */
export function resolveTargetItemId(ctx: { itemId?: string }): string | null {
  return ctx.itemId || null;
}

/**
 * 校验活动上下文：大类 → 事项必填；子项可选
 * @param _subItemsCount 保留参数以兼容调用方，不再用于校验
 */
export function validateActivityContext(
  ctx: {
    categoryItemId?: string;
    itemId?: string;
    subItemId?: string;
  },
  _items?: Item[],
  _subItemsCount?: number
): string | null {
  if (ctx.categoryItemId && !ctx.itemId) {
    return '请选择事项，或新建一个';
  }
  return null;
}

/** 从记录已有 item_id / sub_item_id 还原选择器上下文 */
export function resolveActivityContextFromRecord(
  items: Item[],
  itemId: string | null | undefined,
  subItemId?: string | null
): ActivityContextShape {
  const base: ActivityContextShape = {
    categoryItemId: '',
    itemId: '',
    subItemId: subItemId || '',
  };
  if (!itemId) return base;

  const item = items.find((i) => i.id === itemId);
  if (!item) return { ...base, itemId };

  if (item.parent_item_id) {
    const parent = items.find((i) => i.id === item.parent_item_id);
    return {
      categoryItemId: parent?.id ?? '',
      categoryTitle: parent?.title,
      itemId: item.id,
      itemTitle: item.title,
      subItemId: subItemId || '',
    };
  }

  if (isCategoryItem(item, items)) {
    const defaultChild = findSkillDefaultItem(items, item.id);
    if (defaultChild) {
      return {
        categoryItemId: item.id,
        categoryTitle: item.title,
        itemId: defaultChild.id,
        itemTitle: defaultChild.title,
        subItemId: subItemId || '',
      };
    }
    return {
      categoryItemId: item.id,
      categoryTitle: item.title,
      itemId: '',
      subItemId: subItemId || '',
    };
  }

  const otherCat = items.find((i) => i.title === '其他' && isCategoryItem(i, items));
  if (otherCat) {
    return {
      categoryItemId: otherCat.id,
      categoryTitle: otherCat.title,
      itemId: item.id,
      itemTitle: item.title,
      subItemId: subItemId || '',
    };
  }

  return {
    categoryItemId: '',
    itemId: item.id,
    itemTitle: item.title,
    subItemId: subItemId || '',
  };
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
    return parent?.title ?? null;
  }
  if (isCategoryItem(item, items)) {
    return item.title;
  }
  return null;
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

/** 快速切换标签：必须同时有事项与子项名称，不含大类 */
export function buildQuickSwitchLabel(
  items: Item[],
  opts: {
    itemId?: string | null;
    subItemId?: string | null;
    subItemTitles?: ReadonlyMap<string, string>;
  }
): string | null {
  const { itemId, subItemId, subItemTitles } = opts;
  if (!itemId || !subItemId) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;
  const subTitle = subItemTitles?.get(subItemId);
  if (!subTitle) return null;
  return `${item.title} · ${subTitle}`;
}

/** 是否应对该快速切换项弹出工具选择（技能型大类或该上下文曾用过工具） */
export function shouldPromptQuickSwitchToolPicker(
  entry: { item_id?: string | null; contextToolLabels?: string[] },
  items: Item[],
  userToolCount: number
): boolean {
  if (userToolCount <= 0) return false;
  if (entry.contextToolLabels && entry.contextToolLabels.length > 0) return true;
  const item = entry.item_id ? items.find((i) => i.id === entry.item_id) : undefined;
  if (!item?.parent_item_id) return false;
  const parent = items.find((i) => i.id === item.parent_item_id);
  return parent ? isSkillCategoryItem(parent) : false;
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
