import { describe, it, expect } from 'vitest';
import type { Item, Record as TetoRecord } from '@/types/teto';
import {
  buildQuickStartBubbles,
  findCategoryItemByTitle,
} from '@/lib/activity/quick-start-bubbles';

const items: Item[] = [
  {
    id: 'cat-eat',
    title: '吃饭',
    status: '活跃',
    parent_item_id: null,
    user_id: 'u1',
    created_at: '',
    updated_at: '',
  } as Item,
  {
    id: 'cat-sleep',
    title: '睡觉',
    status: '活跃',
    parent_item_id: null,
    user_id: 'u1',
    created_at: '',
    updated_at: '',
  } as Item,
  {
    id: 'item-code',
    title: 'TETO开发',
    status: '活跃',
    parent_item_id: 'cat-code',
    user_id: 'u1',
    created_at: '',
    updated_at: '',
  } as Item,
  {
    id: 'cat-code',
    title: '编程',
    status: '活跃',
    parent_item_id: null,
    user_id: 'u1',
    created_at: '',
    updated_at: '',
  } as Item,
];

function occ(
  partial: Partial<TetoRecord> & { id: string; content: string }
): TetoRecord {
  return {
    type: '发生',
    date: '2026-06-21',
    occurred_at: '2026-06-21T10:00:00.000Z',
    lifecycle_status: 'completed',
    ...partial,
  } as TetoRecord;
}

describe('findCategoryItemByTitle', () => {
  it('finds preset category by title', () => {
    expect(findCategoryItemByTitle(items, '吃饭')?.id).toBe('cat-eat');
  });
});

describe('buildQuickStartBubbles', () => {
  it('returns default categories that exist when no records', () => {
    const bubbles = buildQuickStartBubbles([], items, { limit: 4 });
    expect(bubbles.map((b) => b.label)).toEqual(['吃饭', '睡觉', '编程']);
    expect(bubbles.every((b) => b.categoryItemId)).toBe(true);
  });

  it('prefers category from item_id over content', () => {
    const records = [
      occ({
        id: '1',
        content: '写代码',
        item_id: 'item-code',
        occurred_at: '2026-06-21T12:00:00.000Z',
      }),
    ];
    const bubbles = buildQuickStartBubbles(records, items, { limit: 3 });
    expect(bubbles[0]).toMatchObject({ label: '编程', categoryItemId: 'cat-code' });
  });

  it('dedupes and ranks by recency', () => {
    const records = [
      occ({
        id: '1',
        content: '吃饭',
        item_id: 'cat-eat',
        occurred_at: '2026-06-21T08:00:00.000Z',
      }),
      occ({
        id: '2',
        content: '吃饭',
        item_id: 'cat-eat',
        occurred_at: '2026-06-21T18:00:00.000Z',
      }),
      occ({
        id: '3',
        content: '睡觉',
        item_id: 'cat-sleep',
        occurred_at: '2026-06-21T17:00:00.000Z',
      }),
    ];
    const bubbles = buildQuickStartBubbles(records, items, { limit: 2 });
    expect(bubbles.map((b) => b.label)).toEqual(['吃饭', '睡觉']);
    expect(bubbles[0].categoryItemId).toBe('cat-eat');
  });

  it('ignores records without category attribution', () => {
    const records = [
      occ({ id: '1', content: '进行中' }),
      occ({
        id: '2',
        content: '这是一段非常长的描述不应该出现在气泡里',
      }),
    ];
    const bubbles = buildQuickStartBubbles(records, items, { limit: 2 });
    expect(bubbles.length).toBe(2);
    expect(bubbles.every((b) => b.categoryItemId)).toBe(true);
  });

  it('returns empty when items list is empty', () => {
    expect(buildQuickStartBubbles([], [], { limit: 4 })).toEqual([]);
  });
});
