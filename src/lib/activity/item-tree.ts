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

/** Item 树最大 depth（0=一类，1=二类，2=三类 Item） */
export const MAX_ITEM_DEPTH = 2;

export function isActiveItem(item: Item): boolean {
  return ACTIVE_ITEM_STATUSES.has(item.status);
}

/** 从根到该节点的路径（path[0]=一类） */
export function getItemPath(items: Item[], itemId: string): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const path: Item[] = [];
  let current = byId.get(itemId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_item_id ? byId.get(current.parent_item_id) : undefined;
  }
  return path;
}

/** 节点 depth：一类=0，二类=1，三类 Item=2；不存在返回 -1 */
export function getItemDepth(items: Item[], itemId: string): number {
  const path = getItemPath(items, itemId);
  if (path.length === 0) return -1;
  return path.length - 1;
}

export function getItemAncestors(items: Item[], itemId: string): Item[] {
  const path = getItemPath(items, itemId);
  return path.slice(0, -1);
}

/** 是否为一类（顶层）节点 */
export function isLevel1Item(items: Item[], itemId: string): boolean {
  return getItemDepth(items, itemId) === 0;
}

export interface ItemPathForRecord {
  l1?: Item;
  l2?: Item;
  l3Item?: Item;
}

export function getItemPathForRecord(items: Item[], itemId: string): ItemPathForRecord {
  const path = getItemPath(items, itemId);
  return {
    l1: path[0],
    l2: path[1],
    l3Item: path[2],
  };
}

/** 是否为大类节点（结构判定：含空预设名，供详情页/服务端） */
export function isCategoryItem(item: Item, items: Item[], selectedCategoryId?: string): boolean {
  if (!isActiveItem(item) || item.parent_item_id) return false;
  if (PRESET_SET.has(item.title)) return true;
  if (items.some((i) => i.parent_item_id === item.id)) return true;
  if (selectedCategoryId && item.id === selectedCategoryId) return true;
  return false;
}

/** 记录页 chip / 桌面：仅展示「在用」的一类（有子项、用户新建、或当前选中） */
export function isUsedCategoryItem(
  item: Item,
  items: Item[],
  selectedCategoryId?: string,
  userCategoryIds?: ReadonlySet<string>
): boolean {
  if (!isActiveItem(item) || item.parent_item_id) return false;
  if (userCategoryIds?.has(item.id)) return true;
  if (selectedCategoryId && item.id === selectedCategoryId) return true;
  if (items.some((i) => i.parent_item_id === item.id && isActiveItem(i))) return true;
  return false;
}

/** 服务端轻量判断：已知子事项数量时无需拉全量 items */
export function isCategoryItemLite(item: Item, childCount: number): boolean {
  if (!isActiveItem(item) || item.parent_item_id) return false;
  if (PRESET_SET.has(item.title)) return true;
  if (childCount > 0) return true;
  return false;
}

/** 大类 chips：默认仅「在用」一类；showUnusedPresets 含空预设（选父级等场景） */
export function getCategoryItems(
  items: Item[],
  selectedCategoryId?: string,
  userCategoryIds?: ReadonlySet<string>,
  options?: { includeCompleted?: boolean; showUnusedPresets?: boolean }
): Item[] {
  const includeCompleted = options?.includeCompleted ?? false;
  const showUnusedPresets = options?.showUnusedPresets ?? false;
  const cats = items.filter((i) => {
    if (i.parent_item_id) return false;
    if (!isActiveItem(i) && !(includeCompleted && i.status === '已完成')) return false;
    if (showUnusedPresets) {
      if (userCategoryIds?.has(i.id)) return true;
      return isCategoryItem(i, items, selectedCategoryId);
    }
    return isUsedCategoryItem(i, items, selectedCategoryId, userCategoryIds);
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

/** 一次遍历构建索引，供 ActivityContextPicker 等高频组件复用 */
export interface ItemTreeIndex {
  itemById: Map<string, Item>;
  childrenByParent: Map<string, Item[]>;
  activeChildCountByParent: Map<string, number>;
}

export function buildItemTreeIndex(items: Item[]): ItemTreeIndex {
  const itemById = new Map<string, Item>();
  const childrenByParent = new Map<string, Item[]>();
  const activeChildCountByParent = new Map<string, number>();

  for (const item of items) {
    itemById.set(item.id, item);
    const pid = item.parent_item_id;
    if (!pid || !isBoardVisibleItem(item)) continue;
    const list = childrenByParent.get(pid) ?? [];
    list.push(item);
    childrenByParent.set(pid, list);
    if (isActiveItem(item)) {
      activeChildCountByParent.set(pid, (activeChildCountByParent.get(pid) ?? 0) + 1);
    }
  }

  return { itemById, childrenByParent, activeChildCountByParent };
}

/** 基于索引的 depth，避免每次 getItemPath 分配数组 */
export function getItemDepthFromIndex(index: ItemTreeIndex, itemId: string): number {
  let depth = 0;
  let current = index.itemById.get(itemId);
  const seen = new Set<string>();
  while (current?.parent_item_id && !seen.has(current.id)) {
    seen.add(current.id);
    depth++;
    current = index.itemById.get(current.parent_item_id);
  }
  return current ? depth : -1;
}

/** 基于索引的大类 chips（O(n) 单次过滤） */
export function getCategoryItemsFromIndex(
  items: Item[],
  index: ItemTreeIndex,
  selectedCategoryId?: string,
  userCategoryIds?: ReadonlySet<string>
): Item[] {
  const cats = items.filter((i) => {
    if (i.parent_item_id) return false;
    if (!isActiveItem(i)) return false;
    if (userCategoryIds?.has(i.id)) return true;
    if (selectedCategoryId && i.id === selectedCategoryId) return true;
    return (index.activeChildCountByParent.get(i.id) ?? 0) > 0;
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

/** 基于索引的大类子项 */
export function getItemsForCategoryFromIndex(
  items: Item[],
  index: ItemTreeIndex,
  categoryItemId: string,
  selectedCategoryId?: string
): Item[] {
  const category = index.itemById.get(categoryItemId);
  const children = index.childrenByParent.get(categoryItemId) ?? [];
  if (category?.title === '其他') {
    return getItemsForCategory(items, categoryItemId, selectedCategoryId);
  }
  return children;
}

/** 某大类下的子事项 */
export function isBoardVisibleItem(item: Item, includeCompleted = false): boolean {
  return isActiveItem(item) || (includeCompleted && item.status === '已完成');
}

export function getChildItems(
  items: Item[],
  parentItemId: string,
  options?: { includeCompleted?: boolean }
): Item[] {
  const includeCompleted = options?.includeCompleted ?? false;
  return items.filter(
    (i) => i.parent_item_id === parentItemId && isBoardVisibleItem(i, includeCompleted)
  );
}

/** 未挂大类的 legacy 事项（parent 为空且不是大类） */
export function getOrphanItems(
  items: Item[],
  selectedCategoryId?: string,
  options?: { includeCompleted?: boolean }
): Item[] {
  const includeCompleted = options?.includeCompleted ?? false;
  return items.filter(
    (i) =>
      isBoardVisibleItem(i, includeCompleted) &&
      !i.parent_item_id &&
      !isCategoryItem(i, items, selectedCategoryId)
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
    return '请选择归属路径';
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

  const path = getItemPath(items, itemId);
  const item = path[path.length - 1];
  if (!item) return { ...base, itemId };

  if (subItemId) {
    const l1 = path[0];
    const host = path[path.length - 1];
    return {
      categoryItemId: l1?.id ?? '',
      categoryTitle: l1?.title,
      itemId: host.id,
      itemTitle: host.title,
      subItemId,
    };
  }

  if (path.length >= 3) {
    return {
      categoryItemId: path[0].id,
      categoryTitle: path[0].title,
      itemId: path[2].id,
      itemTitle: path[2].title,
      subItemId: '',
    };
  }

  if (path.length === 2) {
    return {
      categoryItemId: path[0].id,
      categoryTitle: path[0].title,
      itemId: path[1].id,
      itemTitle: path[1].title,
      subItemId: '',
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
        subItemId: '',
      };
    }
    return {
      categoryItemId: item.id,
      categoryTitle: item.title,
      itemId: '',
      subItemId: '',
    };
  }

  const otherCat = items.find((i) => i.title === '其他' && isCategoryItem(i, items));
  if (otherCat) {
    return {
      categoryItemId: otherCat.id,
      categoryTitle: otherCat.title,
      itemId: item.id,
      itemTitle: item.title,
      subItemId: '',
    };
  }

  return {
    categoryItemId: '',
    itemId: item.id,
    itemTitle: item.title,
    subItemId: '',
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
  const path = getItemPath(items, itemId);
  if (path.length === 0) return null;
  const root = path[0];
  if (isCategoryItem(root, items) || getItemDepth(items, root.id) === 0) {
    return root.title;
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
  const path = getItemPath(items, itemId);
  if (path.length === 0) return contentFallback?.trim() ?? '';
  const pathStr = path.map((i) => i.title).join(' / ');
  const content = contentFallback?.trim();
  const leaf = path[path.length - 1]?.title;
  if (content && content !== leaf && !pathStr.endsWith(content)) {
    return `${pathStr} · ${content}`;
  }
  return pathStr || content || leaf || '';
}

/** 快速切换标签：展示路径末两段（有子项时 事项·子项，无子项时 大类·事项 或 单标签名） */
export function buildQuickSwitchLabel(
  items: Item[],
  opts: {
    itemId?: string | null;
    subItemId?: string | null;
    subItemTitles?: ReadonlyMap<string, string>;
  }
): string | null {
  const { itemId, subItemId, subItemTitles } = opts;
  if (!itemId) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;

  if (subItemId) {
    const subTitle = subItemTitles?.get(subItemId);
    if (!subTitle) return null;
    return `${item.title} · ${subTitle}`;
  }

  const path = getItemPath(items, itemId);
  if (path.length >= 2) {
    return `${path[path.length - 2].title} · ${path[path.length - 1].title}`;
  }

  return item.title;
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

/** 服务端：根据 parent 链计算 depth 与祖先（不含自身） */
export async function resolveItemPathMeta(
  userId: string,
  item: Item,
  listLite: (uid: string) => Promise<Item[]>
): Promise<{ item_depth: number; ancestor_items: Item[] }> {
  const allItems = await listLite(userId);
  const path = getItemPath(allItems, item.id);
  return {
    item_depth: path.length > 0 ? path.length - 1 : 0,
    ancestor_items: path.slice(0, -1),
  };
}
