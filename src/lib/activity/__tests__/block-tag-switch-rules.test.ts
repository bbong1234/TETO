import { describe, expect, it } from 'vitest';
import {
  buildBlockActionSegmentMeta,
  buildBlockAttributionPatchPlan,
  buildBlockItemSegmentMeta,
  ensureBlockAttributionPutBody,
  isBlockAttributionChanged,
  resolveBlockItemSwitchRoute,
  resolveBlockCancelRoute,
  shouldAppendBlockSegmentOnSwitch,
  shouldPreserveBlockGraceWindow,
  shouldPushBlockSwitchUndoFrame,
} from '@/lib/activity/block-tag-switch-rules';
import type { Record as TetoRecord, Tag } from '@/types/teto';

const tags = [
  { id: 'tag-read', user_id: 'u1', name: '阅读', type: 'function', color: null, created_at: '' },
  { id: 'tag-code', user_id: 'u1', name: '写代码', type: 'function', color: null, created_at: '' },
] as Tag[];

function baseActivity(overrides: Partial<TetoRecord> = {}): TetoRecord {
  return {
    id: 'a1',
    user_id: 'u1',
    record_day_id: 'rd1',
    content: '旧内容',
    type: '发生',
    occurred_at: '2026-07-04T13:00:00.000Z',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: 'item-l2',
    phase_id: null,
    sub_item_id: null,
    sort_order: 0,
    is_starred: false,
    cost: null,
    metric_value: null,
    metric_unit: null,
    metric_name: null,
    duration_minutes: null,
    raw_input: null,
    parsed_semantic: null,
    time_anchor_date: '2026-07-04',
    linked_record_id: null,
    location: null,
    people: [],
    batch_id: null,
    input_id: null,
    parent_input_id: null,
    review_status: 'confirmed',
    confidence_level: null,
    input_source: 'manual',
    tool_label: null,
    created_at: '',
    updated_at: '',
    date: '2026-07-04',
    tags: [tags[0]],
    action_text: '阅读',
    ...overrides,
  };
}

describe('isBlockAttributionChanged', () => {
  it('detects sub_item_id change as attribution switch', () => {
    expect(
      isBlockAttributionChanged(baseActivity(), {
        item_id: 'item-l2',
        sub_item_id: 'sub-l3',
      })
    ).toBe(true);
  });
});

describe('shouldAppendBlockSegmentOnSwitch', () => {
  it('appends only outside 5s grace window for all switch kinds', () => {
    expect(shouldAppendBlockSegmentOnSwitch(false, 'item')).toBe(true);
    expect(shouldAppendBlockSegmentOnSwitch(false, 'action')).toBe(true);
    expect(shouldAppendBlockSegmentOnSwitch(true, 'item')).toBe(false);
    expect(shouldAppendBlockSegmentOnSwitch(true, 'action')).toBe(false);
  });
});

describe('shouldPushBlockSwitchUndoFrame', () => {
  it('does not push undo inside grace for any switch kind', () => {
    expect(shouldPushBlockSwitchUndoFrame('item', true)).toBe(false);
    expect(shouldPushBlockSwitchUndoFrame('action', true)).toBe(false);
    expect(shouldPushBlockSwitchUndoFrame('clear_action', true)).toBe(false);
  });

  it('pushes undo outside grace', () => {
    expect(shouldPushBlockSwitchUndoFrame('item', false)).toBe(true);
    expect(shouldPushBlockSwitchUndoFrame('action', false)).toBe(true);
  });
});

describe('shouldPreserveBlockGraceWindow', () => {
  it('always resets timer on each tag switch', () => {
    expect(
      shouldPreserveBlockGraceWindow({
        inActiveSwitchWindow: true,
        hasUndo: true,
      })
    ).toBe(false);
    expect(
      shouldPreserveBlockGraceWindow({
        inActiveSwitchWindow: false,
        hasUndo: true,
      })
    ).toBe(false);
  });
});

describe('resolveBlockCancelRoute', () => {
  it('entry grace with only in-window tag switches → full exit', () => {
    expect(
      resolveBlockCancelRoute({
        inBlock: true,
        graceActive: true,
        undoStackDepth: 0,
        mode: 'switch',
      })
    ).toBe('entry_full');
  });

  it('switch grace with undo stack → pop one step', () => {
    expect(
      resolveBlockCancelRoute({
        inBlock: true,
        graceActive: true,
        undoStackDepth: 1,
        mode: 'switch',
      })
    ).toBe('switch_undo');
  });

  it('start mode without block → other', () => {
    expect(
      resolveBlockCancelRoute({
        inBlock: false,
        graceActive: true,
        undoStackDepth: 0,
        mode: 'start',
      })
    ).toBe('other');
  });
});

describe('resolveBlockItemSwitchRoute', () => {
  it('always uses patch inside block session', () => {
    expect(resolveBlockItemSwitchRoute({ inBlock: true, graceActive: true })).toBe('patch');
    expect(resolveBlockItemSwitchRoute({ inBlock: true, graceActive: false })).toBe('patch');
  });

  it('uses main postSwitch outside block', () => {
    expect(resolveBlockItemSwitchRoute({ inBlock: false, graceActive: false })).toBe(
      'mainPostSwitch'
    );
  });
});

describe('buildBlockAttributionPatchPlan', () => {
  it('clears action when switching item/sub_item without clearing content', () => {
    const plan = buildBlockAttributionPatchPlan(
      baseActivity(),
      { item_id: 'item-l2', sub_item_id: 'sub-l3' },
      tags
    );
    expect(plan.body.tag_ids).toEqual([]);
    expect(plan.body.action_text).toBeNull();
    expect(plan.body.content).toBeUndefined();
    expect(plan.segmentMeta.tag_ids).toEqual([]);
    expect(plan.segmentMeta.sub_item_id).toBe('sub-l3');
  });

  it('clears sub_item_id when item_id changes without explicit sub_item', () => {
    const plan = buildBlockAttributionPatchPlan(
      baseActivity({ sub_item_id: 'sub-old' }),
      { item_id: 'item-new' },
      tags
    );
    expect(plan.body.item_id).toBe('item-new');
    expect(plan.body.sub_item_id).toBeNull();
    expect(plan.optimisticFields.sub_item_id).toBeNull();
    expect(plan.segmentMeta.sub_item_id).toBeNull();
  });

  it('keeps item when switching action only', () => {
    const plan = buildBlockAttributionPatchPlan(
      baseActivity(),
      { tag_ids: ['tag-code'], action_text: '写代码' },
      tags
    );
    expect(plan.body.item_id).toBeUndefined();
    expect(plan.segmentMeta.item_id).toBe('item-l2');
    expect(plan.segmentMeta.tag_ids).toEqual(['tag-code']);
    expect(plan.body.content).toBeUndefined();
  });
});

describe('ensureBlockAttributionPutBody', () => {
  it('fills item_id when only sub_item_id is patched', () => {
    const body = ensureBlockAttributionPutBody(
      { sub_item_id: 'sub-l3' },
      { item_id: 'item-l2', sub_item_id: 'sub-l3' }
    );
    expect(body.item_id).toBe('item-l2');
    expect(body.sub_item_id).toBe('sub-l3');
  });
});

describe('segment meta builders', () => {
  it('buildBlockItemSegmentMeta clears action', () => {
    expect(buildBlockItemSegmentMeta('item-b', 'sub-b')).toEqual({
      item_id: 'item-b',
      sub_item_id: 'sub-b',
      action_text: null,
      tag_ids: [],
    });
  });

  it('buildBlockActionSegmentMeta keeps item', () => {
    expect(
      buildBlockActionSegmentMeta(
        { item_id: 'item-a', sub_item_id: null },
        '写代码',
        ['tag-code']
      )
    ).toEqual({
      item_id: 'item-a',
      sub_item_id: null,
      action_text: '写代码',
      tag_ids: ['tag-code'],
    });
  });
});
