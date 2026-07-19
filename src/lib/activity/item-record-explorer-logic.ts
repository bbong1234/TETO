import type { Item, SubItem, Tag } from '@/types/teto';
import {
  buildItemIdToRootMap,
  getItemDepth,
  getItemPath,
  getProjectItemsUnderRoot,
  getSubtreeItemIds,
} from '@/lib/activity/item-tree';

import {
  compareTimesDesc,
  toSortableTimeString,
} from '@/lib/utils/sortable-time';

export interface ExplorerRecordRow {
  id: string;
  item_id: string | null;
  sub_item_id: string | null;
  duration_minutes: number | null;
  occurred_at: string | null;
  updated_at: string;
  tags?: Tag[];
}

export interface ExplorerFacetInput {
  items: Item[];
  subItems: SubItem[];
  rootItemId: string;
  records: ExplorerRecordRow[];
  projectId?: string | null;
  subItemId?: string | null;
  functionTagId?: string | null;
}

/** @deprecated 使用 toSortableTimeString */
export function normalizeExplorerTime(value: unknown): string | null {
  const s = toSortableTimeString(value);
  return s || null;
}

export function compareExplorerTimesDesc(a: unknown, b: unknown): number {
  return compareTimesDesc(a, b);
}

function getFunctionTagId(record: ExplorerRecordRow): string | null {
  const tag = record.tags?.find((t) => t.type === 'function');
  return tag?.id ?? null;
}

function getSubItemIdsForHost(subItems: SubItem[], hostItemId: string): Set<string> {
  return new Set(subItems.filter((s) => s.item_id === hostItemId).map((s) => s.id));
}

function recordMatchesProjectItem(
  items: Item[],
  subItems: SubItem[],
  record: ExplorerRecordRow,
  projectId: string
): boolean {
  if (record.item_id) {
    const subtree = new Set(getSubtreeItemIds(items, projectId));
    if (subtree.has(record.item_id)) return true;
  }
  if (record.sub_item_id) {
    const hostSubIds = getSubItemIdsForHost(subItems, projectId);
    if (hostSubIds.has(record.sub_item_id)) return true;
  }
  return false;
}

function recordMatchesSubItem(record: ExplorerRecordRow, subItemId: string): boolean {
  return record.sub_item_id === subItemId;
}

function filterRecords(
  items: Item[],
  subItems: SubItem[],
  records: ExplorerRecordRow[],
  scopeItemIds: Set<string>,
  projectId?: string | null,
  subItemId?: string | null,
  functionTagId?: string | null
): ExplorerRecordRow[] {
  return records.filter((record) => {
    const inScope =
      (record.item_id && scopeItemIds.has(record.item_id)) ||
      (record.sub_item_id &&
        subItems.some(
          (s) =>
            s.id === record.sub_item_id &&
            record.item_id &&
            scopeItemIds.has(record.item_id)
        ));
    if (!inScope) return false;
    if (subItemId && !recordMatchesSubItem(record, subItemId)) return false;
    else if (projectId && !recordMatchesProjectItem(items, subItems, record, projectId)) {
      return false;
    }
    if (functionTagId && getFunctionTagId(record) !== functionTagId) return false;
    return true;
  });
}

export function resolveRootScopeItemIds(items: Item[], rootItemId: string): Set<string> {
  return new Set(getSubtreeItemIds(items, rootItemId));
}

function countRecordsForFacet(
  items: Item[],
  subItems: SubItem[],
  records: ExplorerRecordRow[],
  facet: { kind: 'item' | 'sub_item'; id: string }
): number {
  return records.filter((r) => {
    if (facet.kind === 'sub_item') return recordMatchesSubItem(r, facet.id);
    return recordMatchesProjectItem(items, subItems, r, facet.id);
  }).length;
}

export function buildProjectFacets(input: ExplorerFacetInput) {
  const { items, subItems, rootItemId, records, functionTagId } = input;
  const scopeIds = resolveRootScopeItemIds(items, rootItemId);
  const baseRecords = filterRecords(
    items,
    subItems,
    records,
    scopeIds,
    null,
    null,
    functionTagId ?? null
  );

  const l2Items = getProjectItemsUnderRoot(items, rootItemId).filter(
    (i) => getItemDepth(items, i.id) === 1
  );
  const l3Items = getProjectItemsUnderRoot(items, rootItemId).filter(
    (i) => getItemDepth(items, i.id) === 2
  );
  const hostIds = new Set(l2Items.map((i) => i.id));
  const scopedSubItems = subItems.filter((s) => hostIds.has(s.item_id));

  const facets: Array<{
    id: string;
    title: string;
    kind: 'item' | 'sub_item';
    level: 2 | 3;
    parent_id: string | null;
    record_count: number;
    path_label: string;
  }> = [];

  for (const l2 of l2Items) {
    facets.push({
      id: l2.id,
      title: l2.title,
      kind: 'item',
      level: 2,
      parent_id: rootItemId,
      record_count: countRecordsForFacet(items, subItems, baseRecords, {
        kind: 'item',
        id: l2.id,
      }),
      path_label: l2.title,
    });
  }

  for (const l3 of l3Items) {
    const path = getItemPath(items, l3.id);
    const l2 = path.length >= 2 ? path[1] : null;
    facets.push({
      id: l3.id,
      title: l3.title,
      kind: 'item',
      level: 3,
      parent_id: l2?.id ?? null,
      record_count: countRecordsForFacet(items, subItems, baseRecords, {
        kind: 'item',
        id: l3.id,
      }),
      path_label: l2 ? `${l2.title} / ${l3.title}` : l3.title,
    });
  }

  for (const sub of scopedSubItems) {
    const host = items.find((i) => i.id === sub.item_id);
    facets.push({
      id: sub.id,
      title: sub.title,
      kind: 'sub_item',
      level: 3,
      parent_id: sub.item_id,
      record_count: countRecordsForFacet(items, subItems, baseRecords, {
        kind: 'sub_item',
        id: sub.id,
      }),
      path_label: host ? `${host.title} / ${sub.title}` : sub.title,
    });
  }

  return facets.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.parent_id !== b.parent_id) {
      return (a.parent_id ?? '').localeCompare(b.parent_id ?? '', 'zh-CN');
    }
    return b.record_count - a.record_count || a.title.localeCompare(b.title, 'zh-CN');
  });
}

export function buildActionFacets(input: ExplorerFacetInput) {
  const { items, subItems, rootItemId, records, projectId, subItemId } = input;
  const scopeIds = resolveRootScopeItemIds(items, rootItemId);
  const baseRecords = filterRecords(
    items,
    subItems,
    records,
    scopeIds,
    projectId ?? null,
    subItemId ?? null,
    null
  );
  const counts = new Map<string, { id: string; name: string; record_count: number }>();

  for (const record of baseRecords) {
    const tag = record.tags?.find((t) => t.type === 'function');
    if (!tag) continue;
    const existing = counts.get(tag.id);
    if (existing) {
      existing.record_count += 1;
    } else {
      counts.set(tag.id, { id: tag.id, name: tag.name, record_count: 1 });
    }
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.record_count - a.record_count || a.name.localeCompare(b.name, 'zh-CN')
  );
}

export function computeExplorerStats(records: ExplorerRecordRow[]) {
  let totalDuration = 0;
  let lastActiveAt: string | null = null;

  for (const record of records) {
    if (record.duration_minutes != null) {
      totalDuration += Number(record.duration_minutes);
    }
    const candidate = record.occurred_at ?? record.updated_at;
    if (candidate && (!lastActiveAt || candidate > lastActiveAt)) {
      lastActiveAt = candidate;
    }
  }

  return {
    record_count: records.length,
    total_duration_minutes: totalDuration,
    last_active_at: lastActiveAt,
  };
}

export function filterExplorerRecords(input: ExplorerFacetInput): ExplorerRecordRow[] {
  const { items, subItems, rootItemId, records, projectId, subItemId, functionTagId } = input;
  const scopeIds = resolveRootScopeItemIds(items, rootItemId);
  return filterRecords(
    items,
    subItems,
    records,
    scopeIds,
    projectId ?? null,
    subItemId ?? null,
    functionTagId ?? null
  );
}

export function paginateRecords<T>(records: T[], limit: number, offset: number) {
  const total = records.length;
  const slice = records.slice(offset, offset + limit);
  return {
    records: slice,
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + slice.length < total,
    },
  };
}

export function buildTopLevelSummariesFromRecords(
  items: Item[],
  records: ExplorerRecordRow[]
): Map<
  string,
  {
    record_count: number;
    total_duration_minutes: number;
    last_active_at: string | null;
    project_ids: Set<string>;
    action_ids: Set<string>;
  }
> {
  const roots = items.filter((i) => !i.parent_item_id);
  const rootIds = new Set(roots.map((r) => r.id));
  const itemToRoot = buildItemIdToRootMap(items);
  const summaries = new Map<
    string,
    {
      record_count: number;
      total_duration_minutes: number;
      last_active_at: string | null;
      project_ids: Set<string>;
      action_ids: Set<string>;
    }
  >();

  for (const root of roots) {
    summaries.set(root.id, {
      record_count: 0,
      total_duration_minutes: 0,
      last_active_at: null,
      project_ids: new Set(),
      action_ids: new Set(),
    });
  }

  for (const record of records) {
    if (!record.item_id) continue;
    const rootId = itemToRoot.get(record.item_id);
    if (!rootId || !rootIds.has(rootId)) continue;
    const summary = summaries.get(rootId)!;
    summary.record_count += 1;
    if (record.duration_minutes != null) {
      summary.total_duration_minutes += Number(record.duration_minutes);
    }
    const candidate = toSortableTimeString(record.occurred_at ?? record.updated_at);
    if (candidate && (!summary.last_active_at || candidate > summary.last_active_at)) {
      summary.last_active_at = candidate;
    }
    const depth = getItemDepth(items, record.item_id);
    if (depth === 1 || depth === 2) {
      summary.project_ids.add(record.item_id);
    }
    if (record.sub_item_id) {
      summary.project_ids.add(record.sub_item_id);
    }
    const actionId = getFunctionTagId(record);
    if (actionId) summary.action_ids.add(actionId);
  }

  return summaries;
}
