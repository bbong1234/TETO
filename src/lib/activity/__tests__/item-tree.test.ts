import { describe, it, expect } from 'vitest';
import type { Item } from '@/types/teto';
import {
  findSkillDefaultItem,
  getCategoryItems,
  getItemDepth,
  getItemPath,
  isSkillCategoryItem,
  isUsedCategoryItem,
  resolveTargetItemId,
  resolveSubItemHostItemId,
  validateActivityContext,
  resolveActivityContextFromRecord,
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

  it('getCategoryItems hides empty preset categories by default', () => {
    const emptyEat = item({ id: 'cat-eat', title: '吃饭' });
    const withChildren = [english, englishStudy, insurance, projectA, emptyEat];
    expect(getCategoryItems(withChildren).map((i) => i.title)).toEqual(['英语', '保险']);
    expect(isUsedCategoryItem(emptyEat, withChildren)).toBe(false);
    expect(isUsedCategoryItem(insurance, withChildren)).toBe(true);
  });

  it('getCategoryItems showUnusedPresets includes empty presets', () => {
    const emptyEat = item({ id: 'cat-eat', title: '吃饭' });
    const list = [english, englishStudy, emptyEat];
    const titles = getCategoryItems(list, undefined, undefined, { showUnusedPresets: true }).map(
      (i) => i.title
    );
    expect(titles).toContain('吃饭');
    expect(titles).toContain('英语');
  });

  it('does not allow direct attachment to category', () => {
    expect(resolveTargetItemId({})).toBeNull();
    expect(
      validateActivityContext({ categoryItemId: 'cat-en' }, items)
    ).toBe('请选择归属路径');
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

  it('resolveActivityContextFromRecord handles three-level Item path', () => {
    const sport = item({ id: 'cat-sport', title: '运动' });
    const run = item({ id: 'item-run', title: '跑步', parent_item_id: 'cat-sport' });
    const morning = item({ id: 'item-am', title: '晨跑', parent_item_id: 'item-run' });
    const three = [sport, run, morning];
    expect(getItemDepth(three, 'item-am')).toBe(2);
    const ctx = resolveActivityContextFromRecord(three, 'item-am');
    expect(ctx.categoryItemId).toBe('cat-sport');
    expect(ctx.itemId).toBe('item-am');
    expect(getItemPath(three, 'item-am').map((i) => i.title)).toEqual(['运动', '跑步', '晨跑']);
  });
});
