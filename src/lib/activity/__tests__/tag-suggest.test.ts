import { describe, expect, it } from 'vitest';
import { suggestItems, suggestTags } from '../tag-suggest';
import type { Item, Tag } from '@/types/teto';

const tags: Tag[] = [
  { id: '1', user_id: 'u', name: '报批', color: null, type: 'function', created_at: '' },
  { id: '2', user_id: 'u', name: '保险', color: null, type: 'project', created_at: '' },
];

const items: Item[] = [
  {
    id: 'i1',
    user_id: 'u',
    title: '报批项目',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: null,
    created_at: '',
    updated_at: '',
  },
];

describe('suggestTags', () => {
  it('matches tag name substring', () => {
    const result = suggestTags('我在做报批', tags);
    expect(result[0]?.tag.name).toBe('报批');
  });

  it('returns empty for short input', () => {
    expect(suggestTags('a', tags)).toEqual([]);
  });
});

describe('suggestItems', () => {
  it('matches item title', () => {
    const result = suggestItems('报批项目材料', items);
    expect(result[0]?.item.title).toBe('报批项目');
  });
});
