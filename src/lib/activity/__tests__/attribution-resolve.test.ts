import { describe, expect, it } from 'vitest';
import { matchLevel2Child, resolveTextAttribution } from '../attribution-resolve';
import { getItemDepth } from '../item-tree';
import type { Item } from '@/types/teto';

const baseItem = (overrides: Partial<Item> & Pick<Item, 'id' | 'title'>): Item => ({
  user_id: 'u',
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
  ...overrides,
});

describe('resolveTextAttribution L1/L2 title match', () => {
  const prog = baseItem({ id: 'cat-prog', title: '编程' });
  const teto = baseItem({ id: 'item-teto', title: 'teto开发', parent_item_id: 'cat-prog' });
  const insurance = baseItem({ id: 'cat-ins', title: '保险' });
  const items = [prog, teto, insurance];

  it('单字符输入不匹配任何归属', () => {
    expect(resolveTextAttribution('t', items, [])).toEqual({ category: null, l2: null });
    expect(resolveTextAttribution('吃', items, [])).toEqual({ category: null, l2: null });
  });

  it('两个字符起才匹配', () => {
    const tetoL3 = baseItem({
      id: 'item-teto-17',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const { category, l2 } = resolveTextAttribution('te', [prog, teto, tetoL3], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto-17');
  });

  it('输入 teto 匹配二类 teto开发', () => {
    const { category, l2 } = resolveTextAttribution('我在搞teto', items, []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto');
  });

  it('纯输入 teto 在存在三类时优先选三类', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const tetoL3 = baseItem({
      id: 'item-teto-proj',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const { category, l2 } = resolveTextAttribution('teto', [prog, tetoL2, tetoL3], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto-proj');
  });

  it('顶层同名误挂 Item 时，teto 仍归到编程/teto开发', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const orphanTeto = baseItem({ id: 'orphan-teto', title: 'TETO开发' });
    const { category, l2 } = resolveTextAttribution('teto', [prog, tetoL2, orphanTeto], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto');
  });

  it('输入 teto项目 匹配三类，一类固定为编程', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const tetoL3 = baseItem({
      id: 'item-teto-proj',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const orphanTeto = baseItem({ id: 'orphan-teto', title: 'TETO开发' });
    const all = [prog, tetoL2, tetoL3, orphanTeto];

    const { category, l2 } = resolveTextAttribution('teto项目', all, []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto-proj');
  });

  it('输入 teto项目1.7版本 匹配三类', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const tetoL3 = baseItem({
      id: 'item-teto-proj',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const { category, l2 } = resolveTextAttribution('teto项目1.7版本', [prog, tetoL2, tetoL3], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto-proj');
    expect(getItemDepth([prog, tetoL2, tetoL3], l2!.id)).toBe(2);
  });

  it('输入 teto 1.7 匹配三类（多关键词）', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const tetoL3 = baseItem({
      id: 'item-teto-proj',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const { category, l2 } = resolveTextAttribution('teto 1.7', [prog, tetoL2, tetoL3], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto-proj');
  });

  it('仅输入 teto开发 时仍选二类，不强行升到三类', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const tetoL3 = baseItem({
      id: 'item-teto-proj',
      title: 'TETO项目1.7版本',
      parent_item_id: 'item-teto',
    });
    const { category, l2 } = resolveTextAttribution('teto开发', [prog, tetoL2, tetoL3], []);
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto');
  });

  it('输入 保险 匹配一类', () => {
    const { category, l2 } = resolveTextAttribution('买了保险', items, []);
    expect(category?.id).toBe('cat-ins');
    expect(l2).toBeNull();
  });

  it('SubItem 作为第三标签：teto 优先匹配 SubItem 而非二类', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const sub: import('@/types/teto').SubItem = {
      id: 'sub-proj',
      user_id: 'u',
      item_id: 'item-teto',
      title: 'TETO项目1.7版本',
      description: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    const { category, l2, subItemId } = resolveTextAttribution(
      'teto',
      [prog, tetoL2],
      [],
      { subItems: [sub] }
    );
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto');
    expect(subItemId).toBe('sub-proj');
  });

  it('输入第三标签方案报批匹配 SubItem', () => {
    const prog = baseItem({ id: 'cat-prog', title: '编程' });
    const tetoL2 = baseItem({ id: 'item-teto', title: 'TETO开发', parent_item_id: 'cat-prog' });
    const sub: import('@/types/teto').SubItem = {
      id: 'sub-plan',
      user_id: 'u',
      item_id: 'item-teto',
      title: '第三标签方案报批',
      description: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    const { category, l2, subItemId } = resolveTextAttribution(
      '第三标签方案报批',
      [prog, tetoL2],
      [],
      { subItems: [sub] }
    );
    expect(category?.id).toBe('cat-prog');
    expect(l2?.id).toBe('item-teto');
    expect(subItemId).toBe('sub-plan');
  });
});

describe('matchLevel2Child', () => {
  const category = baseItem({ id: 'cat-eat', title: '吃饭' });
  const breakfast = baseItem({ id: 'item-breakfast', title: '早饭', parent_item_id: 'cat-eat' });
  const duplicateEat = baseItem({ id: 'item-eat-dup', title: '吃饭', parent_item_id: 'cat-eat' });
  const items = [category, breakfast, duplicateEat];

  it('吃早饭优先匹配二类早饭，而非与一类同名的二类', () => {
    const matched = matchLevel2Child(
      '吃早饭两个蛋',
      ['早饭', '吃早饭'],
      items.filter((i) => i.parent_item_id === 'cat-eat'),
      '吃饭'
    );
    expect(matched?.id).toBe('item-breakfast');
  });

  it('resolveTextAttribution 与 QuickCreate 一致', () => {
    const { category: cat, l2 } = resolveTextAttribution('吃早饭', items, [
      { trigger_pattern: '早饭', target_id: 'cat-eat', rule_type: 'item_mapping', is_active: true },
    ]);
    expect(cat?.id).toBe('cat-eat');
    expect(l2?.id).toBe('item-breakfast');
  });

  it('输入「吃饭」只选一类，不匹配同名二类（含已搁置）', () => {
    const lunch = baseItem({ id: 'item-lunch', title: '午饭', parent_item_id: 'cat-eat' });
    const dinner = baseItem({ id: 'item-dinner', title: '晚饭', parent_item_id: 'cat-eat' });
    const shelvedEatL2 = baseItem({
      id: 'item-eat-shelved',
      title: '吃饭',
      parent_item_id: 'cat-eat',
      status: '已搁置',
    });
    const eatItems = [category, breakfast, lunch, dinner, shelvedEatL2];

    const { category: cat, l2 } = resolveTextAttribution('吃饭', eatItems, []);
    expect(cat?.id).toBe('cat-eat');
    expect(l2).toBeNull();
  });

  it('输入「吃早饭」优先二类早饭，不受已搁置同名二类干扰', () => {
    const shelvedEatL2 = baseItem({
      id: 'item-eat-shelved',
      title: '吃饭',
      parent_item_id: 'cat-eat',
      status: '已搁置',
    });
    const eatItems = [category, breakfast, shelvedEatL2];

    const { category: cat, l2 } = resolveTextAttribution('吃早饭', eatItems, [
      { trigger_pattern: '早饭', target_id: 'cat-eat', rule_type: 'item_mapping', is_active: true },
    ]);
    expect(cat?.id).toBe('cat-eat');
    expect(l2?.id).toBe('item-breakfast');
  });

  it('规则「吃饭」指向已搁置二类时，输入「吃早饭」仍匹配早饭', () => {
    const lunch = baseItem({ id: 'item-lunch', title: '午饭', parent_item_id: 'cat-eat' });
    const shelvedEatL2 = baseItem({
      id: 'item-eat-shelved',
      title: '吃饭',
      parent_item_id: 'cat-eat',
      status: '已搁置',
    });
    const eatItems = [category, breakfast, lunch, shelvedEatL2];

    const { category: cat, l2 } = resolveTextAttribution('吃早饭', eatItems, [
      {
        trigger_pattern: '吃饭',
        target_id: 'item-eat-shelved',
        rule_type: 'item_mapping',
        is_active: true,
      },
      {
        trigger_pattern: '早饭',
        target_id: 'cat-eat',
        rule_type: 'item_mapping',
        is_active: true,
      },
    ]);
    expect(cat?.id).toBe('cat-eat');
    expect(l2?.id).toBe('item-breakfast');
  });
});
