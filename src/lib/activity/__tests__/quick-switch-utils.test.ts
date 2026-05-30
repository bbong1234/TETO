import { describe, it, expect } from 'vitest';
import type { Item, Record as TetoRecord } from '@/types/teto';
import { buildRecentSwitchEntries } from '../quick-switch-utils';
import { buildQuickSwitchLabel } from '../item-tree';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'title'>): Item {
  return {
    user_id: 'u1',
    status: '活跃',
    parent_item_id: null,
    description: null,
    folder_id: null,
    is_pinned: false,
    color: null,
    icon: null,
    started_at: null,
    ended_at: null,
    created_at: '',
    updated_at: '',
    ...partial,
  } as Item;
}

const items = [
  item({ id: 'cat-prog', title: '编程' }),
  item({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' }),
];

const subItemTitles = new Map([['sub-1', 'cursor开发']]);

describe('buildQuickSwitchLabel', () => {
  it('shows item and sub-item without category', () => {
    expect(
      buildQuickSwitchLabel(items, {
        itemId: 'item-teto',
        subItemId: 'sub-1',
        subItemTitles,
      })
    ).toBe('TETO开发 · cursor开发');
  });

  it('returns null without sub-item', () => {
    expect(buildQuickSwitchLabel(items, { itemId: 'item-teto' })).toBeNull();
  });

  it('returns null when sub-item title not loaded', () => {
    expect(
      buildQuickSwitchLabel(items, { itemId: 'item-teto', subItemId: 'sub-unknown' })
    ).toBeNull();
  });
});

describe('buildRecentSwitchEntries', () => {
  it('collects context tool labels', () => {
    const records: TetoRecord[] = [
      {
        id: 'r1',
        type: '发生',
        item_id: 'item-teto',
        sub_item_id: 'sub-1',
        tool_label: 'Cursor',
        content: '写代码',
        occurred_at: '2026-05-30T10:00:00Z',
        created_at: '2026-05-30T10:00:00Z',
      } as TetoRecord,
    ];
    const entries = buildRecentSwitchEntries(records, items, 10, subItemTitles);
    expect(entries[0].label).toBe('TETO开发 · cursor开发');
    expect(entries[0].contextToolLabels).toEqual(['Cursor']);
  });

  it('skips records without sub_item_id', () => {
    const records: TetoRecord[] = [
      {
        id: 'r1',
        type: '发生',
        item_id: 'item-teto',
        sub_item_id: null,
        content: '吃午饭',
        occurred_at: '2026-05-30T10:00:00Z',
        created_at: '2026-05-30T10:00:00Z',
      } as TetoRecord,
    ];
    expect(buildRecentSwitchEntries(records, items, 10, subItemTitles)).toEqual([]);
  });

  it('dedupes by item+sub_item not content', () => {
    const records: TetoRecord[] = [
      {
        id: 'r1',
        type: '发生',
        item_id: 'item-teto',
        sub_item_id: 'sub-1',
        content: 'A',
        occurred_at: '2026-05-30T11:00:00Z',
        created_at: '2026-05-30T11:00:00Z',
      } as TetoRecord,
      {
        id: 'r2',
        type: '发生',
        item_id: 'item-teto',
        sub_item_id: 'sub-1',
        content: 'B',
        occurred_at: '2026-05-30T10:00:00Z',
        created_at: '2026-05-30T10:00:00Z',
      } as TetoRecord,
    ];
    const entries = buildRecentSwitchEntries(records, items, 10, subItemTitles);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('A');
  });
});
