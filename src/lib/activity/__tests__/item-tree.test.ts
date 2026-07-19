import { describe, it, expect } from 'vitest';
import type { Item } from '@/types/teto';
import {
  buildItemTreeIndex,
  findSkillDefaultItem,
  getAttributionPickerChildItems,
  getCategoryItems,
  getItemDepth,
  getItemPath,
  getItemsForCategoryFromIndex,
  isSkillCategoryItem,
  isUsedCategoryItem,
  resolveTargetItemId,
  resolveSubItemHostItemId,
  validateActivityContext,
  resolveActivityContextFromRecord,
  normalizeOrgLevels,
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

  it('getCategoryItems shows L1 with records but no children via categoryIdsWithRecords', () => {
    const sport = item({ id: 'cat-sport', title: '运动' });
    const list = [sport, english, englishStudy];
    const withRecords = new Set(['cat-sport']);
    expect(getCategoryItems(list, undefined, undefined, { categoryIdsWithRecords: withRecords }).map(
      (i) => i.title
    )).toContain('运动');
    expect(isUsedCategoryItem(sport, list, undefined, undefined, withRecords)).toBe(true);
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

  it('normalizeOrgLevels maps two-level path to L1+L2 only', () => {
    const eat = item({ id: 'cat-eat', title: '吃饭' });
    const breakfast = item({ id: 'item-breakfast', title: '早饭', parent_item_id: 'cat-eat' });
    const levels = normalizeOrgLevels([eat, breakfast], 'item-breakfast');
    expect(levels).toMatchObject({
      categoryItemId: 'cat-eat',
      l2ItemId: 'item-breakfast',
      l3ItemId: '',
      subItemId: '',
      itemDepth: 1,
    });
  });

  it('二类与一类同名时仍出现在记录页选择器', () => {
    const eat = item({ id: 'cat-eat', title: '吃饭' });
    const breakfast = item({ id: 'item-breakfast', title: '早饭', parent_item_id: 'cat-eat' });
    const lunch = item({ id: 'item-lunch', title: '午饭', parent_item_id: 'cat-eat' });
    const dinner = item({ id: 'item-dinner', title: '晚饭', parent_item_id: 'cat-eat' });
    const eatL2 = item({ id: 'item-eat-dup', title: '吃饭', parent_item_id: 'cat-eat' });
    const all = [eat, breakfast, lunch, dinner, eatL2];

    const titles = (list: Item[]) =>
      list.map((i) => i.title).sort((a, b) => a.localeCompare(b, 'zh-CN'));

    const index = buildItemTreeIndex(all);
    const fromIndex = getItemsForCategoryFromIndex(all, index, 'cat-eat');
    expect(fromIndex).toHaveLength(4);
    expect(titles(fromIndex)).toEqual(titles(all.filter((i) => i.parent_item_id === 'cat-eat')));

    const picker = getAttributionPickerChildItems(all, 'cat-eat');
    expect(picker).toHaveLength(4);
    expect(titles(picker)).toEqual(titles(all.filter((i) => i.parent_item_id === 'cat-eat')));
  });

  it('已完成二类不在记录页选择器展示', () => {
    const eat = item({ id: 'cat-eat', title: '吃饭' });
    const completedEatL2 = item({
      id: 'item-eat-dup',
      title: '吃饭',
      parent_item_id: 'cat-eat',
      status: '已完成',
    });
    const picker = getAttributionPickerChildItems([eat, completedEatL2], 'cat-eat');
    expect(picker).toHaveLength(0);
  });

  it('已搁置二类不在记录页选择器展示', () => {
    const eat = item({ id: 'cat-eat', title: '吃饭' });
    const shelvedEatL2 = item({
      id: 'item-eat-shelved',
      title: '吃饭',
      parent_item_id: 'cat-eat',
      status: '已搁置',
    });
    const picker = getAttributionPickerChildItems([eat, shelvedEatL2], 'cat-eat');
    expect(picker).toHaveLength(0);
  });
});
