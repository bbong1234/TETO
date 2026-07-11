import { describe, expect, it } from 'vitest';
import {
  buildSwitchUndoFrame,
  clearSwitchUndoStack,
  popSwitchUndoFrame,
  pushSwitchUndoFrame,
  shouldRearmGraceAfterPop,
} from '@/lib/activity/block-switch-undo-stack';
import type { Record as TetoRecord } from '@/types/teto';

function activity(id: string, itemId = 'item-a'): TetoRecord {
  return {
    id,
    user_id: 'u1',
    record_day_id: 'rd1',
    content: id,
    type: '发生',
    occurred_at: '2026-07-04T13:00:00.000Z',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: itemId,
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
    tags: [],
  };
}

describe('pushSwitchUndoFrame / popSwitchUndoFrame', () => {
  it('pushes and pops in LIFO order for A→B→C switches', () => {
    let stack = clearSwitchUndoStack();
    stack = pushSwitchUndoFrame(stack, {
      previousActivity: activity('state-a'),
      attributionOnly: true,
    });
    stack = pushSwitchUndoFrame(stack, {
      previousActivity: activity('state-b'),
      attributionOnly: true,
    });

    const firstPop = popSwitchUndoFrame(stack);
    expect(firstPop.frame?.previousActivity.id).toBe('state-b');
    expect(firstPop.stack).toHaveLength(1);

    const secondPop = popSwitchUndoFrame(firstPop.stack);
    expect(secondPop.frame?.previousActivity.id).toBe('state-a');
    expect(secondPop.stack).toHaveLength(0);
  });

  it('returns null frame when popping empty stack', () => {
    const { frame, stack } = popSwitchUndoFrame([]);
    expect(frame).toBeNull();
    expect(stack).toEqual([]);
  });
});

describe('shouldRearmGraceAfterPop', () => {
  it('returns true when earlier undo frames remain', () => {
    expect(
      shouldRearmGraceAfterPop([
        { previousActivity: activity('state-a'), attributionOnly: true },
      ])
    ).toBe(true);
  });

  it('returns false when stack is empty', () => {
    expect(shouldRearmGraceAfterPop([])).toBe(false);
  });
});

describe('buildSwitchUndoFrame', () => {
  it('captures baseline activity and segment snapshot', () => {
    const baseline = activity('rec-1', 'item-b');
    const frame = buildSwitchUndoFrame(
      baseline,
      [
        {
          label: '项目A',
          startMs: 1,
          endMs: null,
          item_id: 'item-a',
        },
      ],
      [],
      { attributionOnly: true, blockSegmentAppended: true }
    );

    expect(frame.previousActivity.item_id).toBe('item-a');
    expect(frame.blockSegmentsSnapshot).toHaveLength(1);
    expect(frame.blockSegmentAppended).toBe(true);
    expect(frame.attributionOnly).toBe(true);
  });
});
