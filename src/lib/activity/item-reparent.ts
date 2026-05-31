import type { Item } from '@/types/teto';
import {
  getChildItems,
  getItemDepth,
  getItemPath,
  isActiveItem,
  MAX_ITEM_DEPTH,
} from '@/lib/activity/item-tree';

export type ItemLevel = 1 | 2 | 3;

export interface ReparentValidationResult {
  ok: boolean;
  error?: string;
  newDepth?: number;
  subtreeSpan?: number;
}

function buildChildrenMap(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.parent_item_id || !isActiveItem(item)) continue;
    const list = map.get(item.parent_item_id) ?? [];
    list.push(item);
    map.set(item.parent_item_id, list);
  }
  return map;
}

/** 子树内相对根节点的最大深度（根自身为 0） */
export function getSubtreeDepthSpan(items: Item[], rootId: string): number {
  const childrenMap = buildChildrenMap(items);
  let max = 0;
  const walk = (id: string, rel: number) => {
    max = Math.max(max, rel);
    for (const child of childrenMap.get(id) ?? []) {
      walk(child.id, rel + 1);
    }
  };
  walk(rootId, 0);
  return max;
}

function collectDescendantIds(items: Item[], rootId: string): Set<string> {
  const childrenMap = buildChildrenMap(items);
  const ids = new Set<string>();
  const walk = (id: string) => {
    for (const child of childrenMap.get(id) ?? []) {
      ids.add(child.id);
      walk(child.id);
    }
  };
  walk(rootId);
  return ids;
}

function expectedParentDepthForLevel(asLevel: ItemLevel): number | null {
  if (asLevel === 1) return null;
  if (asLevel === 2) return 0;
  return 1;
}

/**
 * 校验 Item reparent：防环、深度上限、父节点须 active
 */
export function validateItemReparent(
  itemId: string,
  newParentId: string | null,
  items: Item[],
  asLevel?: ItemLevel
): ReparentValidationResult {
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: '事项不存在' };
  if (!isActiveItem(item)) return { ok: false, error: '已归档事项不可移动' };

  const subtreeSpan = getSubtreeDepthSpan(items, itemId);

  if (newParentId === null) {
    if (asLevel !== undefined && asLevel !== 1) {
      return { ok: false, error: '升格为一类时不可指定父节点' };
    }
    if (subtreeSpan > MAX_ITEM_DEPTH) {
      return {
        ok: false,
        error: '子树过深，无法升格为一类；请先移走下级节点',
        subtreeSpan,
      };
    }
    return { ok: true, newDepth: 0, subtreeSpan };
  }

  if (newParentId === itemId) {
    return { ok: false, error: '不能移动到自身下面' };
  }

  const descendants = collectDescendantIds(items, itemId);
  if (descendants.has(newParentId)) {
    return { ok: false, error: '不能移动到自身的子节点下' };
  }

  const parent = items.find((i) => i.id === newParentId);
  if (!parent) return { ok: false, error: '目标父节点不存在' };
  if (!isActiveItem(parent)) return { ok: false, error: '目标父节点不可用' };

  const parentDepth = getItemDepth(items, newParentId);
  if (parentDepth < 0 || parentDepth >= MAX_ITEM_DEPTH) {
    return { ok: false, error: '目标父节点层级过深' };
  }

  if (asLevel !== undefined) {
    const expectedParentDepth = expectedParentDepthForLevel(asLevel);
    if (expectedParentDepth === null) {
      return { ok: false, error: '一类标签不可指定父节点' };
    }
    if (parentDepth !== expectedParentDepth) {
      const label = asLevel === 2 ? '一类' : '二类';
      return { ok: false, error: `作为${asLevel}类标签时，需挂在一${label}下` };
    }
  }

  const newDepth = parentDepth + 1;
  if (newDepth + subtreeSpan > MAX_ITEM_DEPTH) {
    return {
      ok: false,
      error:
        subtreeSpan > 0
          ? '移动后子树会超过三层；请先移走下级节点，或选择「作为二类」'
          : '无法移动到该层级',
      newDepth,
      subtreeSpan,
    };
  }

  return { ok: true, newDepth, subtreeSpan };
}

/** 列出可作为父节点的合法目标（按目标层级过滤） */
export function listReparentTargets(
  itemId: string,
  items: Item[],
  asLevel: ItemLevel
): Array<{ item: Item; disabled: boolean; reason?: string }> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return [];

  const subtreeSpan = getSubtreeDepthSpan(items, itemId);
  const descendants = collectDescendantIds(items, itemId);
  const currentParentId = item.parent_item_id ?? null;
  const expectedParentDepth = expectedParentDepthForLevel(asLevel);

  if (expectedParentDepth === null) {
    return [];
  }

  return items
    .filter((i) => isActiveItem(i) && i.id !== itemId && !descendants.has(i.id))
    .map((candidate) => {
      if (candidate.id === currentParentId) {
        return { item: candidate, disabled: true, reason: '当前所在' };
      }
      const depth = getItemDepth(items, candidate.id);
      if (depth !== expectedParentDepth) {
        return { item: candidate, disabled: true, reason: '层级不匹配' };
      }
      const newDepth = depth + 1;
      if (newDepth + subtreeSpan > MAX_ITEM_DEPTH) {
        return { item: candidate, disabled: true, reason: '移动后超过三层' };
      }
      return { item: candidate, disabled: false };
    })
    .sort((a, b) => a.item.title.localeCompare(b.item.title, 'zh-CN'));
}

/** 构建移动确认文案用的路径标签 */
export function buildReparentPathLabel(items: Item[], itemId: string): string {
  return getItemPath(items, itemId)
    .map((i) => i.title)
    .join(' / ');
}

/** 节点在 UI 上对应的一类/二类/三类（1-based） */
export function getItemLevel(items: Item[], itemId: string): ItemLevel | null {
  const depth = getItemDepth(items, itemId);
  if (depth < 0 || depth > MAX_ITEM_DEPTH) return null;
  return (depth + 1) as ItemLevel;
}

/** 二类节点：depth=1 的 Item，可作为 SubItem 挂载目标 */
export function isLevel2ItemHost(items: Item[], itemId: string): boolean {
  return getItemDepth(items, itemId) === 1;
}

/** 获取某节点下的三类 Item 子节点 */
export function getLevel3ItemChildren(items: Item[], parentItemId: string): Item[] {
  return getChildItems(items, parentItemId).filter(
    (i) => getItemDepth(items, i.id) === 2
  );
}
