import { describe, it, expect } from 'vitest';
import type { Item } from '@/types/teto';
import {
  findSkillDefaultItem,
  isSkillCategoryItem,
  resolveTargetItemId,
  resolveSubItemHostItemId,
  validateActivityContext,
} from '../item-tree';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'title'>): Item {
  return {
    user_id: 'u1',
    status: '活跃',
    parent_item_id: null,
    description: null,
    folder_id: null,
    is_pinned: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...partial,
  } as Item;
}

describe('item-tree hierarchy rules', () => {
  const english = item({ id: 'cat-en', title: '英语' });
  const englishStudy = item({
    id: 'item-en',
    title: '英语学习',
    parent_item_id: 'cat-en',
  });
  const insurance = item({ id: 'cat-ins', title: '保险' });
  const projectA = item({ id: 'proj-a', title: 'A公司寿险', parent_item_id: 'cat-ins' });
  const items = [english, englishStudy, insurance, projectA];

  it('isSkillCategoryItem identifies skill presets', () => {
    expect(isSkillCategoryItem(english)).toBe(true);
    expect(isSkillCategoryItem(insurance)).toBe(false);
  });

  it('does not allow direct attachment to category', () => {
    expect(resolveTargetItemId({})).toBeNull();
    expect(
      validateActivityContext({ categoryItemId: 'cat-en' }, items)
    ).toBe('请选择事项，或新建一个');
  });

  it('allows item without sub-item (sub-item is optional)', () => {
    expect(
      validateActivityContext(
        { categoryItemId: 'cat-ins', itemId: 'proj-a' },
        items,
        2
      )
    ).toBeNull();
    expect(
      validateActivityContext({ itemId: 'proj-a' }, items, 0)
    ).toBeNull();
    expect(
      validateActivityContext(
        { categoryItemId: 'cat-ins', itemId: 'proj-a', subItemId: 'sub-1' },
        items,
        2
      )
    ).toBeNull();
  });

  it('resolveTargetItemId only returns item id', () => {
    expect(resolveTargetItemId({ itemId: 'proj-a' })).toBe('proj-a');
    expect(resolveTargetItemId({})).toBeNull();
  });

  it('resolveSubItemHostItemId uses item id only', () => {
    expect(resolveSubItemHostItemId({ itemId: 'proj-a' })).toBe('proj-a');
    expect(resolveSubItemHostItemId({})).toBeNull();
  });

  it('findSkillDefaultItem locates seeded default item', () => {
    expect(findSkillDefaultItem(items, 'cat-en')?.id).toBe('item-en');
  });
});
