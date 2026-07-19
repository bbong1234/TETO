import { createClient } from '@/lib/supabase/server';
import { listItemsLite } from '@/lib/db/items';
import { getSubItemsByItemIds } from '@/lib/db/sub-items';
import { listTags } from '@/lib/db/tags';
import type {
  ItemRecordExplorerQuery,
  ItemRecordExplorerResult,
  Record as TetoRecord,
  Tag,
  TopLevelItemExplorerSummary,
} from '@/types/teto';
import {
  buildActionFacets,
  buildProjectFacets,
  buildTopLevelSummariesFromRecords,
  compareExplorerTimesDesc,
  computeExplorerStats,
  filterExplorerRecords,
  normalizeExplorerTime,
  paginateRecords,
  type ExplorerRecordRow,
} from '@/lib/activity/item-record-explorer-logic';
import { toSortableTimeString } from '@/lib/utils/sortable-time';
import { getItemDepth, getProjectItemsUnderRoot, getSubtreeItemIds } from '@/lib/activity/item-tree';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function mapRowToExplorerRecord(row: {
  id: string;
  item_id: string | null;
  sub_item_id: string | null;
  duration_minutes: number | null;
  occurred_at: string | null;
  updated_at: string;
  record_tags?: { tags: Tag | Tag[] | null }[];
}): ExplorerRecordRow {
  const tags = (row.record_tags ?? [])
    .map((rt) => (Array.isArray(rt.tags) ? rt.tags[0] : rt.tags))
    .filter((t): t is Tag => !!t && typeof t === 'object' && 'id' in t);
  return {
    id: row.id,
    item_id: row.item_id,
    sub_item_id: row.sub_item_id,
    duration_minutes: row.duration_minutes,
    occurred_at: normalizeExplorerTime(row.occurred_at),
    updated_at: toSortableTimeString(row.updated_at),
    tags,
  };
}

async function fetchScopeRecords(userId: string, itemIds: string[]): Promise<ExplorerRecordRow[]> {
  if (itemIds.length === 0) return [];
  const supabase = await createClient();
  const PAGE_SIZE = 1000;
  const allRows: ExplorerRecordRow[] = [];

  for (let i = 0; i < itemIds.length; i += PAGE_SIZE) {
    const chunk = itemIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from('records')
      .select('id, item_id, sub_item_id, duration_minutes, occurred_at, updated_at, record_tags(tags(*))')
      .eq('user_id', userId)
      .in('item_id', chunk)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`获取记录失败: ${error.message}`);
    for (const row of data ?? []) {
      allRows.push(mapRowToExplorerRecord(row));
    }
  }

  return allRows;
}

async function fetchExplorerRecordsPage(
  userId: string,
  recordIds: string[]
): Promise<TetoRecord[]> {
  if (recordIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('records')
    .select(`
      *,
      record_tags(tags(*)),
      record_days(date)
    `)
    .eq('user_id', userId)
    .in('id', recordIds)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`获取记录详情失败: ${error.message}`);
  if (!data?.length) return [];

  const itemIds = [...new Set(data.filter((r: any) => r.item_id).map((r: any) => r.item_id as string))];
  const itemMap = new Map<string, { id: string; title: string }>();
  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', itemIds);
    for (const item of itemsData ?? []) {
      itemMap.set(item.id, item);
    }
  }

  const idOrder = new Map(recordIds.map((id, idx) => [id, idx]));
  return (data as TetoRecord[])
    .map((row) => {
      const tags = ((row as TetoRecord & { record_tags?: { tags: Tag }[] }).record_tags ?? [])
        .map((rt) => rt.tags)
        .filter((t): t is Tag => !!t);
      const date = (row as TetoRecord & { record_days?: { date: string } }).record_days?.date;
      return {
        ...row,
        tags,
        date,
        item: row.item_id ? itemMap.get(row.item_id) ?? null : null,
        record_tags: undefined,
        record_days: undefined,
      } as TetoRecord;
    })
    .sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
}

export async function listTopLevelExplorerSummaries(
  userId: string
): Promise<TopLevelItemExplorerSummary[]> {
  const items = await listItemsLite(userId, { parent_item_id: null });
  const activeRoots = items.filter((i) => i.status !== '已搁置');
  if (activeRoots.length === 0) return [];

  const allItems = await listItemsLite(userId, {});
  const allItemIds = [...new Set(allItems.map((i) => i.id))];
  const subtreeRecords = await fetchScopeRecords(userId, allItemIds);
  const summaryMap = buildTopLevelSummariesFromRecords(allItems, subtreeRecords);

  const allL2Ids = activeRoots.flatMap((root) =>
    getProjectItemsUnderRoot(allItems, root.id)
      .filter((i) => getItemDepth(allItems, i.id) === 1)
      .map((i) => i.id)
  );
  const allSubItems = await getSubItemsByItemIds(userId, [...new Set(allL2Ids)]);
  const subCountByHost = new Map<string, number>();
  for (const sub of allSubItems) {
    subCountByHost.set(sub.item_id, (subCountByHost.get(sub.item_id) ?? 0) + 1);
  }

  const summaries = activeRoots.map((root) => {
    const summary = summaryMap.get(root.id);
    const l2UnderRoot = getProjectItemsUnderRoot(allItems, root.id);
    const subCount = l2UnderRoot
      .filter((i) => getItemDepth(allItems, i.id) === 1)
      .reduce((sum, i) => sum + (subCountByHost.get(i.id) ?? 0), 0);
    const projectCount = l2UnderRoot.length + subCount;
    return {
      id: root.id,
      title: root.title,
      status: root.status,
      record_count: summary?.record_count ?? 0,
      total_duration_minutes: summary?.total_duration_minutes ?? 0,
      last_active_at: toSortableTimeString(summary?.last_active_at) || null,
      project_count: projectCount,
      action_count: summary?.action_ids.size ?? 0,
    };
  });

  return summaries
    .filter((s) => s.record_count > 0 || s.project_count > 0)
    .sort((a, b) => {
      const timeCmp = compareExplorerTimesDesc(a.last_active_at, b.last_active_at);
      if (timeCmp !== 0) return timeCmp;
      return b.record_count - a.record_count;
    });
}

export async function getItemRecordExplorer(
  userId: string,
  rootItemId: string,
  query: ItemRecordExplorerQuery
): Promise<ItemRecordExplorerResult | null> {
  const items = await listItemsLite(userId, {});
  const root = items.find((i) => i.id === rootItemId);
  if (!root) return null;

  const depth = getItemDepth(items, rootItemId);
  if (depth !== 0) {
    throw new Error('仅支持顶层第一标签作为浏览入口');
  }

  const itemIdsInScope = getSubtreeItemIds(items, rootItemId);
  const l2Ids = getProjectItemsUnderRoot(items, rootItemId)
    .filter((i) => getItemDepth(items, i.id) === 1)
    .map((i) => i.id);
  const subItems = await getSubItemsByItemIds(userId, l2Ids);
  const scopeRecords = await fetchScopeRecords(userId, itemIdsInScope);

  const facetInput = {
    items,
    subItems,
    rootItemId,
    records: scopeRecords,
    projectId: query.project_id ?? null,
    subItemId: query.sub_item_id ?? null,
    functionTagId: query.function_tag_id ?? null,
  };

  const filtered = filterExplorerRecords(facetInput);
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);
  const { records: pageRows, pagination } = paginateRecords(filtered, limit, offset);
  const pageRecordIds = pageRows.map((r) => r.id);
  const records = await fetchExplorerRecordsPage(userId, pageRecordIds);

  const projectFacets = buildProjectFacets({
    ...facetInput,
    projectId: null,
    subItemId: null,
    functionTagId: query.function_tag_id ?? null,
  });
  const usedActionFacets = buildActionFacets({
    ...facetInput,
    projectId: query.project_id ?? null,
    subItemId: query.sub_item_id ?? null,
    functionTagId: null,
  });
  const allFunctionTags = await listTags(userId, undefined, 'function');
  const usedCountMap = new Map(usedActionFacets.map((f) => [f.id, f.record_count]));
  const actionFacets = allFunctionTags
    .filter((t) => !t.scope_item_id || t.scope_item_id === rootItemId)
    .map((t) => ({
      id: t.id,
      name: t.name,
      record_count: usedCountMap.get(t.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.record_count - a.record_count || a.name.localeCompare(b.name, 'zh-CN')
    );

  return {
    root_item: { id: root.id, title: root.title, status: root.status },
    filters: {
      project_id: query.project_id ?? null,
      sub_item_id: query.sub_item_id ?? null,
      function_tag_id: query.function_tag_id ?? null,
    },
    stats: computeExplorerStats(filtered),
    project_facets: projectFacets,
    action_facets: actionFacets,
    records,
    pagination,
  };
}
