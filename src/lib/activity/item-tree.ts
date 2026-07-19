import type { Item, Record as TetoRecord } from '@/types/teto';
import {
  ACTIVITY_CATEGORY_PRESETS,
  SKILL_CATEGORY_PRESETS,
  SKILL_DEFAULT_ITEM_TITLES,
  type SkillCategoryPreset,
} from '@/lib/activity/constants';
import { UNASSIGNED_ACTIVE_PLACEHOLDER } from '@/lib/activity/recent-context';
import { stripRedundantTimePrefix } from '@/lib/activity/diary-time-normalize';

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
  userCategoryIds?: ReadonlySet<string>,
  categoryIdsWithRecords?: ReadonlySet<string>
): boolean {
  if (!isActiveItem(item) || item.parent_item_id) return false;
  if (userCategoryIds?.has(item.id)) return true;
  if (selectedCategoryId && item.id === selectedCategoryId) return true;
  if (categoryIdsWithRecords?.has(item.id)) return true;
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
  options?: { includeCompleted?: boolean; showUnusedPresets?: boolean; categoryIdsWithRecords?: ReadonlySet<string> }
): Item[] {
  const includeCompleted = options?.includeCompleted ?? false;
  const showUnusedPresets = options?.showUnusedPresets ?? false;
  const categoryIdsWithRecords = options?.categoryIdsWithRecords;
  const cats = items.filter((i) => {
    if (i.parent_item_id) return false;
    if (!isActiveItem(i) && !(includeCompleted && i.status === '已完成')) return false;
    if (showUnusedPresets) {
      if (userCategoryIds?.has(i.id)) return true;
      return isCategoryItem(i, items, selectedCategoryId);
    }
    return isUsedCategoryItem(i, items, selectedCategoryId, userCategoryIds, categoryIdsWithRecords);
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
  userCategoryIds?: ReadonlySet<string>,
  categoryIdsWithRecords?: ReadonlySet<string>
): Item[] {
  const cats = items.filter((i) => {
    if (i.parent_item_id) return false;
    if (!isActiveItem(i)) return false;
    if (userCategoryIds?.has(i.id)) return true;
    if (selectedCategoryId && i.id === selectedCategoryId) return true;
    if (categoryIdsWithRecords?.has(i.id)) return true;
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
  return getAttributionPickerChildItems(items, categoryItemId, selectedCategoryId, index);
}

/**
 * 记录页归属选择器用的大类下子项列表。
 * 仅展示在用二类（活跃/推进中/放缓/停滞），排除已搁置与已完成。
 */
export function getAttributionPickerChildItems(
  items: Item[],
  categoryItemId: string,
  selectedCategoryId?: string,
  index?: ItemTreeIndex
): Item[] {
  const category = index?.itemById.get(categoryItemId) ?? items.find((i) => i.id === categoryItemId);
  const children = items.filter(
    (i) => i.parent_item_id === categoryItemId && isActiveItem(i)
  );

  if (category?.title === '其他') {
    const orphans = getOrphanItems(items, selectedCategoryId, { includeCompleted: false }).filter(
      (i) => isActiveItem(i)
    );
    const seen = new Set(children.map((i) => i.id));
    return [...children, ...orphans.filter((i) => !seen.has(i.id))];
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

/** 某节点及其全部后代 item id（含自身） */
export function getSubtreeItemIds(items: Item[], itemId: string): string[] {
  const index = buildItemTreeIndex(items);
  const result: string[] = [];
  const queue = [itemId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const children = index.childrenByParent.get(id) ?? [];
    for (const child of children) {
      queue.push(child.id);
    }
  }
  return result;
}

/** 第一标签下的项目节点（L2/L3，不含顶层自身） */
export function getProjectItemsUnderRoot(items: Item[], rootItemId: string): Item[] {
  const rootDepth = getItemDepth(items, rootItemId);
  if (rootDepth !== 0) return [];
  const subtreeIds = new Set(getSubtreeItemIds(items, rootItemId));
  return items.filter((item) => {
    if (!subtreeIds.has(item.id) || item.id === rootItemId) return false;
    const depth = getItemDepth(items, item.id);
    return depth === 1 || depth === 2;
  });
}

/** 将 item_id 映射到其 L1 顶层祖先 id */
export function buildItemIdToRootMap(items: Item[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const path = getItemPath(items, item.id);
    const root = path[0];
    if (root) map.set(item.id, root.id);
  }
  return map;
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

/** 组织层级归一化：一类 / 二类 Item / 三类 Item 或 SubItem（与 QuickCreate 归属一致） */
export interface NormalizedOrgLevels {
  categoryItemId: string;
  l2ItemId: string;
  l3ItemId: string;
  subItemId: string;
  itemDepth: number;
}

export function normalizeOrgLevels(
  items: Item[],
  itemId: string,
  subItemId?: string | null
): NormalizedOrgLevels {
  const empty: NormalizedOrgLevels = {
    categoryItemId: '',
    l2ItemId: '',
    l3ItemId: '',
    subItemId: subItemId?.trim() ?? '',
    itemDepth: -1,
  };
  if (!itemId) return empty;

  const path = getItemPath(items, itemId);
  if (path.length === 0) return empty;

  const depth = path.length - 1;

  if (subItemId?.trim()) {
    return {
      categoryItemId: path[0]?.id ?? '',
      l2ItemId: depth >= 1 ? path[path.length - 1].id : '',
      l3ItemId: '',
      subItemId: subItemId.trim(),
      itemDepth: depth,
    };
  }

  if (depth === 0) {
    return {
      categoryItemId: itemId,
      l2ItemId: '',
      l3ItemId: '',
      subItemId: '',
      itemDepth: 0,
    };
  }

  if (depth === 1) {
    return {
      categoryItemId: path[0].id,
      l2ItemId: itemId,
      l3ItemId: '',
      subItemId: '',
      itemDepth: 1,
    };
  }

  return {
    categoryItemId: path[0].id,
    l2ItemId: path[path.length - 2].id,
    l3ItemId: itemId,
    subItemId: '',
    itemDepth: depth,
  };
}

/** 二类下的三类 Item 选项（不含 SubItem；包含已完成供归属选择） */
export function listLevel3ItemOptions(items: Item[], l2ItemId: string): Item[] {
  if (!l2ItemId) return [];
  return items.filter(
    (i) => i.parent_item_id === l2ItemId && i.status !== '已搁置'
  );
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
  subItemId?: string | null,
  hints?: { itemTitle?: string; subItemTitle?: string }
): ActivityContextShape {
  const base: ActivityContextShape = {
    categoryItemId: '',
    itemId: '',
    subItemId: subItemId || '',
  };
  if (!itemId) return base;

  const path = getItemPath(items, itemId);
  const item = path[path.length - 1];
  if (!item) {
    return {
      ...base,
      itemId,
      itemTitle: hints?.itemTitle,
      subItemTitle: hints?.subItemTitle,
    };
  }

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

const SWITCH_CONTENT_RE = /^切换到\s+(.+)$/;

/** 从块时间切换记录的 content 提取第三级标签名 */
export function extractSwitchLabel(content?: string | null): string | undefined {
  const m = content?.trim().match(SWITCH_CONTENT_RE);
  return m?.[1]?.trim() || undefined;
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
  if (!itemId) return sanitizeDisplayContent(contentFallback) ?? '';
  const path = getItemPath(items, itemId);
  if (path.length === 0) return sanitizeDisplayContent(contentFallback) ?? '';
  const pathStr = path.map((i) => i.title).join(' / ');
  const content = sanitizeDisplayContent(contentFallback);
  const leaf = path[path.length - 1]?.title;
  if (content && content !== leaf && !pathStr.endsWith(content)) {
    return `${pathStr} · ${content}`;
  }
  return pathStr || content || leaf || '';
}

function sanitizeDisplayContent(content?: string | null): string | undefined {
  const trimmed = content?.trim();
  if (!trimmed || trimmed === UNASSIGNED_ACTIVE_PLACEHOLDER) return undefined;
  if (extractSwitchLabel(trimmed)) return undefined;
  return trimmed;
}

function truncateTimelineText(text: string, maxLen = 36): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/** 时间线：一级-二级-三级标签路径（与组织选择器层级一致） */
export function buildTimelineTagPathParts(
  record: Pick<
    TetoRecord,
    'item_id' | 'category' | 'subcategory' | 'item' | 'tags' | 'sub_item_id' | 'content'
  >,
  items?: Item[],
  options?: { subItemTitle?: string; subItemTitles?: ReadonlyMap<string, string> }
): string[] {
  if (items && record.item_id) {
    const levels = normalizeOrgLevels(items, record.item_id, record.sub_item_id ?? undefined);
    const byId = new Map(items.map((i) => [i.id, i]));
    const parts: string[] = [];
    const l1 = levels.categoryItemId ? byId.get(levels.categoryItemId)?.title : undefined;
    const l2 = levels.l2ItemId ? byId.get(levels.l2ItemId)?.title : undefined;
    let resolvedSubTitle: string | undefined;
    if (levels.subItemId) {
      resolvedSubTitle =
        options?.subItemTitle?.trim() ||
        options?.subItemTitles?.get(levels.subItemId) ||
        extractSwitchLabel(record.content);
    }
    const l3 =
      levels.subItemId && resolvedSubTitle
        ? resolvedSubTitle
        : levels.l3ItemId
          ? byId.get(levels.l3ItemId)?.title
          : undefined;
    if (l1) parts.push(l1);
    if (l2) parts.push(l2);
    if (l3) parts.push(l3);
    if (parts.length > 0) return parts;
  }

  const legacy = [record.category, record.subcategory, record.item?.title]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (legacy.length > 0) {
    return legacy.slice(0, 3);
  }

  const fnTags =
    record.tags
      ?.filter((t) => t.type === 'function')
      .map((t) => t.name.trim())
      .filter(Boolean) ?? [];
  if (fnTags.length > 0) {
    return fnTags.slice(0, 3);
  }

  return [];
}

/** 时间线：一级-二级-三级标签路径（与组织选择器层级一致） */
export function buildTimelineTagPath(
  record: Pick<
    TetoRecord,
    'item_id' | 'category' | 'subcategory' | 'item' | 'tags' | 'sub_item_id' | 'content'
  >,
  items?: Item[],
  options?: { subItemTitle?: string; subItemTitles?: ReadonlyMap<string, string> }
): string {
  const parts = buildTimelineTagPathParts(record, items, options);
  if (parts.length > 0) return parts.join('-');

  return '';
}

export interface TimelineEntryParts {
  tagPath: string;
  tagPathParts: string[];
  action: string;
  timeText: string;
  detail: string;
  text: string;
}

type TimelineEntryRecord = Pick<
  TetoRecord,
  | 'content'
  | 'raw_input'
  | 'input_source'
  | 'action_text'
  | 'event_text'
  | 'object_text'
  | 'time_text'
  | 'note'
  | 'result'
  | 'item_id'
  | 'sub_item_id'
  | 'category'
  | 'subcategory'
  | 'item'
  | 'tags'
  | 'lifecycle_status'
  | 'occurred_at_end'
>;

/** 时间线分块：事项路径 / 动作 / 时间 / 摘要 */
export function buildTimelineEntryParts(
  record: TimelineEntryRecord,
  items?: Item[],
  options?: { isCurrent?: boolean; subItemTitles?: ReadonlyMap<string, string> }
): TimelineEntryParts {
  const tagPathParts = buildTimelineTagPathParts(record, items, {
    subItemTitles: options?.subItemTitles,
  });
  const tagPath = tagPathParts.length > 0 ? tagPathParts.join('-') : '';
  const action = record.action_text?.trim() ?? '';
  const timeText = record.time_text?.trim() ?? '';
  const originalText =
    record.raw_input?.trim() ||
    (record.input_source === 'quick' ? record.content?.trim() : '') ||
    '';
  const summary = stripRedundantTimePrefix(
    originalText || buildTimelineSummary(record, { isCurrent: options?.isCurrent, tagPath }),
    timeText
  );

  const parts = [tagPath, action, timeText, summary].filter(Boolean);
  let text: string;
  if (action && tagPath && isRedundantWithTagPath(action, tagPath)) {
    text = parts.filter((p) => p !== action).join(' ');
  } else {
    text = parts.join(' ');
  }

  return { tagPath, tagPathParts, action, timeText, detail: summary, text };
}

/** 时间线正文：一级-二级-三级  动作  时间  简单摘要（不含「进行中」占位） */
export function buildTimelineEntryText(
  record: TimelineEntryRecord,
  items?: Item[],
  options?: { isCurrent?: boolean; subItemTitles?: ReadonlyMap<string, string> }
): string {
  return buildTimelineEntryParts(record, items, options).text;
}

function isRedundantWithTagPath(text: string, tagPath: string, action?: string): boolean {
  const t = text.trim();
  if (!t || !tagPath) return false;
  if (action && t === action) return true;
  const parts = tagPath.split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.includes(t)) return true;
  // 文本恰为路径各级的顺序拼接（如「编程公司系统开发」）视为冗余
  if (parts.length >= 2) {
    let cursor = 0;
    for (const part of parts) {
      const idx = t.indexOf(part, cursor);
      if (idx === -1) return false;
      cursor = idx + part.length;
    }
    if (cursor >= t.length) return true;
  }
  return false;
}

function buildTimelineSummary(
  record: Pick<
    TetoRecord,
    | 'content'
    | 'raw_input'
    | 'input_source'
    | 'action_text'
    | 'event_text'
    | 'object_text'
    | 'note'
    | 'result'
    | 'body_state'
    | 'lifecycle_status'
    | 'occurred_at_end'
  >,
  options?: { isCurrent?: boolean; tagPath?: string }
): string {
  const action = record.action_text?.trim();
  const event = record.event_text?.trim();
  const object = record.object_text?.trim();
  const content = sanitizeDisplayContent(record.content);
  const tagPath = options?.tagPath ?? '';
  const skipContentDetail =
    record.input_source === 'quick' ||
    Boolean(
      record.raw_input?.trim() &&
        content &&
        record.raw_input.trim() === content.trim()
    );
  const tagParts = new Set(
    tagPath
      .split('-')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const switchLabel = extractSwitchLabel(content);

  const contentAsSummary =
    !skipContentDetail &&
    content &&
    content !== action &&
    !tagParts.has(content) &&
    !(switchLabel && tagParts.has(switchLabel)) &&
    !isRedundantWithTagPath(content, tagPath, action) &&
    !options?.isCurrent
      ? content
      : undefined;

  const candidates = [
    event,
    object && object !== action ? object : undefined,
    record.body_state?.trim() ? `身体：${record.body_state.trim()}` : undefined,
    record.result?.trim(),
    contentAsSummary,
    record.note?.trim(),
  ]
    .filter(Boolean)
    .filter((c) => !isRedundantWithTagPath(c as string, tagPath, action)) as string[];

  for (const candidate of candidates) {
    if (candidate === UNASSIGNED_ACTIVE_PLACEHOLDER) continue;
    return truncateTimelineText(candidate);
  }

  if (options?.isCurrent) return '';
  if (
    !skipContentDetail &&
    content &&
    !(switchLabel && tagParts.has(switchLabel)) &&
    !isRedundantWithTagPath(content, tagPath, action)
  ) {
    return truncateTimelineText(content);
  }
  return '';
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
  lifecycle_status?: string | null;
  occurred_at_end?: string | null;
}, items?: Item[]): string {
  let content = record.content?.trim() || undefined;
  if (content === UNASSIGNED_ACTIVE_PLACEHOLDER) {
    content = undefined;
  }
  if (items && record.item_id) {
    const label = buildItemPathLabel(items, record.item_id, content);
    if (label) return label;
  }
  const parts = [record.category, record.subcategory, record.item?.title, content].filter(
    Boolean
  );
  return parts.join(' / ') || content || '';
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
