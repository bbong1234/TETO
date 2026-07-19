import { describe, expect, it } from 'vitest';
import type { Item, SubItem, Tag } from '@/types/teto';
import {
  buildActionFacets,
  buildProjectFacets,
  buildTopLevelSummariesFromRecords,
  compareExplorerTimesDesc,
  computeExplorerStats,
  filterExplorerRecords,
  paginateRecords,
  type ExplorerRecordRow,
} from '@/lib/activity/item-record-explorer-logic';
import {
  getProjectItemsUnderRoot,
  getSubtreeItemIds,
} from '@/lib/activity/item-tree';

function makeItem(
  id: string,
  title: string,
  parent_item_id: string | null = null
): Item {
  return {
    id,
    user_id: 'u1',
    title,
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function fnTag(id: string, name: string): Tag {
  return { id, user_id: 'u1', name, color: null, type: 'function', created_at: '2026-01-01' };
}

function record(
  id: string,
  item_id: string,
  tags: Tag[] = [],
  duration = 30,
  sub_item_id: string | null = null
): ExplorerRecordRow {
  return {
    id,
    item_id,
    sub_item_id,
    duration_minutes: duration,
    occurred_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    tags,
  };
}

const items = [
  makeItem('root', '编程'),
  makeItem('p1', '公司系统', 'root'),
  makeItem('p2', '方案报批', 'p1'),
  makeItem('other-root', '运动'),
  makeItem('p3', '跑步', 'other-root'),
];

const subItems: SubItem[] = [
  {
    id: 'sub1',
    user_id: 'u1',
    item_id: 'p1',
    title: '接口开发',
    description: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

describe('item-tree explorer helpers', () => {
  it('resolves subtree under root', () => {
    expect(getSubtreeItemIds(items, 'root').sort()).toEqual(['p1', 'p2', 'root'].sort());
    expect(getProjectItemsUnderRoot(items, 'root').map((i) => i.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('item-record-explorer-logic', () => {
  const records = [
    record('r1', 'p2', [fnTag('a1', '开发')]),
    record('r2', 'p1', [fnTag('a2', '评审')]),
    record('r3', 'root', [fnTag('a1', '开发')]),
    record('r4', 'p3', [fnTag('a1', '开发')]),
    record('r5', 'p1', [fnTag('a1', '开发')], 20, 'sub1'),
  ];

  const baseInput = {
    items,
    subItems,
    rootItemId: 'root',
    records,
  };

  it('builds L2 and L3 project facets including sub_items', () => {
    const facets = buildProjectFacets({
      ...baseInput,
      functionTagId: null,
    });
    expect(facets.find((f) => f.level === 2 && f.id === 'p1')).toBeTruthy();
    expect(facets.find((f) => f.level === 3 && f.id === 'p2')).toBeTruthy();
    expect(facets.find((f) => f.kind === 'sub_item' && f.id === 'sub1')).toBeTruthy();
    expect(facets.find((f) => f.id === 'sub1')?.record_count).toBe(1);
  });

  it('builds project facets with cross-filtered action counts', () => {
    const facets = buildProjectFacets({
      ...baseInput,
      functionTagId: 'a1',
    });
    expect(facets.find((f) => f.id === 'p2')?.record_count).toBe(1);
    expect(facets.find((f) => f.id === 'p1')?.record_count).toBe(2);
  });

  it('filters by sub_item_id', () => {
    const filtered = filterExplorerRecords({
      ...baseInput,
      subItemId: 'sub1',
    });
    expect(filtered.map((r) => r.id)).toEqual(['r5']);
  });

  it('filters records by project and action intersection', () => {
    const filtered = filterExplorerRecords({
      ...baseInput,
      projectId: 'p1',
      functionTagId: 'a1',
    });
    expect(filtered.map((r) => r.id).sort()).toEqual(['r1', 'r5'].sort());
  });

  it('excludes records outside root scope even with same action tag', () => {
    const filtered = filterExplorerRecords({
      ...baseInput,
      functionTagId: 'a1',
    });
    expect(filtered.map((r) => r.id).sort()).toEqual(['r1', 'r3', 'r5'].sort());
    expect(filtered.some((r) => r.id === 'r4')).toBe(false);
  });

  it('computes stats and paginates', () => {
    const filtered = filterExplorerRecords(baseInput);
    const stats = computeExplorerStats(filtered);
    expect(stats.record_count).toBe(4);
    expect(stats.total_duration_minutes).toBe(110);

    const page = paginateRecords(filtered, 2, 0);
    expect(page.records).toHaveLength(2);
    expect(page.pagination.has_more).toBe(true);
  });

  it('builds top-level summaries', () => {
    const map = buildTopLevelSummariesFromRecords(items, records);
    expect(map.get('root')?.record_count).toBe(4);
    expect(map.get('other-root')?.record_count).toBe(1);
    expect(map.get('root')?.action_ids.size).toBe(2);
  });

  it('normalizes non-string timestamps in top-level summaries', () => {
    const date = new Date('2026-07-10T12:00:00.000Z');
    const map = buildTopLevelSummariesFromRecords(items, [
      {
        ...records[0],
        occurred_at: date as unknown as string,
        updated_at: date as unknown as string,
      },
    ]);
    expect(map.get('root')?.last_active_at).toBe(date.toISOString());
    expect(() =>
      compareExplorerTimesDesc(map.get('root')?.last_active_at, '2026-07-01')
    ).not.toThrow();
  });
});
