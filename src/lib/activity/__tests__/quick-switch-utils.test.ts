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
  item({ id: 'item-rest', title: '休息' }),
];

const subItemTitles = new Map([['sub-1', 'TETO项目1.7版本']]);

describe('buildQuickSwitchLabel', () => {
  it('三层路径：第二标签 · 第三标签', () => {
    expect(
      buildQuickSwitchLabel(items, {
        itemId: 'item-teto',
        subItemId: 'sub-1',
        subItemTitles,
      })
    ).toBe('TETO开发 · TETO项目1.7版本');
  });

  it('两层路径：第一标签 · 第二标签', () => {
    expect(buildQuickSwitchLabel(items, { itemId: 'item-teto' })).toBe('编程 · TETO开发');
  });

  it('单层标签：仅显示名称', () => {
    expect(buildQuickSwitchLabel(items, { itemId: 'item-rest' })).toBe('休息');
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
    expect(entries[0].label).toBe('TETO开发 · TETO项目1.7版本');
    expect(entries[0].contextToolLabels).toEqual(['Cursor']);
  });

  it('includes records without sub_item_id', () => {
    const records: TetoRecord[] = [
      {
        id: 'r1',
        type: '发生',
        item_id: 'item-teto',
        sub_item_id: null,
        content: '开会',
        occurred_at: '2026-05-30T10:00:00Z',
        created_at: '2026-05-30T10:00:00Z',
      } as TetoRecord,
    ];
    const entries = buildRecentSwitchEntries(records, items, 10, subItemTitles);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('编程 · TETO开发');
    expect(entries[0].sub_item_id).toBeNull();
  });

  it('dedupes by item+sub_item', () => {
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
    expect(entries[0].item_id).toBe('item-teto');
    expect(entries[0].sub_item_id).toBe('sub-1');
  });
});
