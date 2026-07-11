import { describe, it, expect } from 'vitest';
import type { Item, Record as TetoRecord } from '@/types/teto';
import { getRecentItemsForChips } from '../recent-context';

const items: Item[] = [
  { id: 'cat1', title: '学习', status: '活跃', parent_item_id: null } as Item,
  { id: 'item1', title: '英语', status: '活跃', parent_item_id: 'cat1' } as Item,
  { id: 'item2', title: '跑步', status: '活跃', parent_item_id: 'cat1' } as Item,
  { id: 'item3', title: '阅读', status: '活跃', parent_item_id: 'cat1' } as Item,
];

const records: TetoRecord[] = [
  { id: 'r1', item_id: 'item2', content: '跑', type: '发生' } as TetoRecord,
  { id: 'r2', item_id: 'item1', content: '背词', type: '发生' } as TetoRecord,
];

describe('getRecentItemsForChips', () => {
  it('优先上次上下文事项，再取今日记录', () => {
    const chips = getRecentItemsForChips(items, records, {
      categoryItemId: 'cat1',
      itemId: 'item3',
      subItemId: '',
    }, 3);
    expect(chips.map((i) => i.id)).toEqual(['item3', 'item1', 'item2']);
  });

  it('无上下文时按今日记录倒序', () => {
    const chips = getRecentItemsForChips(items, records, null, 2);
    expect(chips.map((i) => i.id)).toEqual(['item1', 'item2']);
  });
});
