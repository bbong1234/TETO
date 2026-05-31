import { describe, it, expect } from 'vitest';
import type { Item } from '@/types/teto';
import {
  getItemDepth,
  getItemPath,
} from '../item-tree';
import {
  getSubtreeDepthSpan,
  validateItemReparent,
  listReparentTargets,
} from '../item-reparent';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'title'>): Item {
  return {
    user_id: 'u1',
    status: '活跃',
    parent_item_id: null,
    description: null,
    folder_id: null,
    is_pinned: false,
    created_at: '',
    updated_at: '',
    ...partial,
  } as Item;
}

describe('item-reparent', () => {
  const sport = item({ id: 'l1-sport', title: '运动' });
  const eat = item({ id: 'l1-eat', title: '吃饭' });
  const run = item({ id: 'l2-run', title: '跑步', parent_item_id: 'l1-sport' });
  const lunch = item({ id: 'l2-lunch', title: '吃午饭', parent_item_id: 'l1-eat' });
  const morningRun = item({ id: 'l3-morning', title: '晨跑', parent_item_id: 'l2-run' });
  const items = [sport, eat, run, lunch, morningRun];

  it('getItemDepth and getItemPath', () => {
    expect(getItemDepth(items, 'l1-sport')).toBe(0);
    expect(getItemDepth(items, 'l2-lunch')).toBe(1);
    expect(getItemDepth(items, 'l3-morning')).toBe(2);
    expect(getItemPath(items, 'l3-morning').map((i) => i.title)).toEqual(['运动', '跑步', '晨跑']);
  });

  it('allows moving L2 to another L1', () => {
    const result = validateItemReparent('l2-lunch', 'l1-sport', items, 2);
    expect(result.ok).toBe(true);
  });

  it('blocks L1 with children from becoming L3', () => {
    const withChild = [...items];
    const result = validateItemReparent('l1-eat', 'l2-run', withChild, 3);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('三层');
  });

  it('allows leaf L1 to become L3 under L2', () => {
    const solo = item({ id: 'l1-solo', title: '单独' });
    const all = [...items, solo];
    const result = validateItemReparent('l1-solo', 'l2-run', all, 3);
    expect(result.ok).toBe(true);
  });

  it('blocks cycle reparent', () => {
    const result = validateItemReparent('l1-sport', 'l2-run', items, 3);
    expect(result.ok).toBe(false);
  });

  it('getSubtreeDepthSpan', () => {
    expect(getSubtreeDepthSpan(items, 'l1-eat')).toBe(1);
    expect(getSubtreeDepthSpan(items, 'l1-sport')).toBe(2);
    expect(getSubtreeDepthSpan(items, 'l2-lunch')).toBe(0);
  });

  it('listReparentTargets filters by level', () => {
    const targets = listReparentTargets('l2-lunch', items, 2);
    expect(targets.filter((t) => !t.disabled).map((t) => t.item.id)).toContain('l1-sport');
    expect(targets.find((t) => t.item.id === 'l1-eat')?.disabled).toBe(true);
  });
});
