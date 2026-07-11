import { describe, expect, it } from 'vitest';
import { blockSessionReducer, initialBlockSessionState } from '@/lib/activity/block-session-reducer';
import type { Record as TetoRecord } from '@/types/teto';

function activity(id: string, itemId = 'cat-1'): TetoRecord {
  return {
    id,
    user_id: 'u',
    record_day_id: 'd1',
    content: '块时间',
    type: '发生',
    occurred_at: '2026-07-05T08:00:00.000Z',
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
    time_anchor_date: '2026-07-05',
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
    date: '2026-07-05',
    tags: [],
  } as TetoRecord;
}

describe('blockSessionReducer P1 enter + cancel start', () => {
  it('enter block sets activity and lock', () => {
    const act = activity('optimistic-1');
    const state = blockSessionReducer(initialBlockSessionState(), {
      type: 'ENTER_BLOCK_OPTIMISTIC',
      activity: act,
      lockedCategoryId: 'cat-1',
      segments: [{ label: '编程', startMs: 1, endMs: null }],
    });
    expect(state.activity?.id).toBe('optimistic-1');
    expect(state.lockedCategoryId).toBe('cat-1');
    expect(state.segments).toHaveLength(1);
  });

  it('cancel start clears session but keeps tombstones', () => {
    let state = blockSessionReducer(initialBlockSessionState(), {
      type: 'ADD_TOMBSTONE',
      id: 'old-del',
    });
    state = blockSessionReducer(state, {
      type: 'ENTER_BLOCK_OPTIMISTIC',
      activity: activity('opt-1'),
      lockedCategoryId: 'cat-1',
      segments: [],
    });
    state = blockSessionReducer(state, { type: 'CANCEL_START_OPTIMISTIC' });
    expect(state.activity).toBeNull();
    expect(state.lockedCategoryId).toBeNull();
    expect(state.tombstones).toContain('old-del');
    expect(state.sessionGen).toBe(1);
  });
});

describe('blockSessionReducer P2 switch + undo', () => {
  it('append segment on switch outside grace', () => {
    const prev = activity('real-1', 'cat-1');
    const next = activity('real-1', 'item-2');
    const state = blockSessionReducer(
      {
        ...initialBlockSessionState(),
        activity: prev,
        lockedCategoryId: 'cat-1',
        segments: [{ label: '编程', startMs: 1, endMs: null }],
      },
      {
        type: 'SWITCH_ATTRIBUTION_OPTIMISTIC',
        activity: next,
        undo: { previousActivity: prev, attributionOnly: true, blockSegmentsSnapshot: [{ label: '编程', startMs: 1, endMs: null }] },
        appendSegment: true,
        segment: { label: '保险', startMs: 2, endMs: null, item_id: 'item-2' },
      }
    );
    expect(state.segments).toHaveLength(2);
    expect(state.activity?.item_id).toBe('item-2');
    expect(state.undo?.previousActivity.item_id).toBe('cat-1');
  });

  it('undo restores snapshot segments', () => {
    const prev = activity('real-1', 'cat-1');
    const next = activity('real-1', 'item-2');
    const snapshot = [{ label: '编程', startMs: 1, endMs: null }];
    let state = blockSessionReducer(
      {
        ...initialBlockSessionState(),
        activity: next,
        lockedCategoryId: 'cat-1',
        segments: [...snapshot, { label: '保险', startMs: 2, endMs: null }],
      },
      {
        type: 'UNDO_SWITCH_OPTIMISTIC',
        activity: prev,
        segments: snapshot,
      }
    );
    expect(state.activity?.item_id).toBe('cat-1');
    expect(state.segments).toHaveLength(1);
    expect(state.undo).toBeNull();
  });
});

describe('blockSessionReducer P3 sync gen', () => {
  it('stale sync is discarded', () => {
    const act = activity('real-1');
    const state = {
      ...initialBlockSessionState(),
      sessionGen: 2,
      activity: act,
    };
    const next = blockSessionReducer(state, {
      type: 'SYNC_FROM_SERVER',
      activity: { ...act, item_id: 'stale' },
      gen: 1,
    });
    expect(next.activity?.item_id).toBe('cat-1');
  });

  it('matching gen sync applies', () => {
    const act = activity('real-1');
    const state = { ...initialBlockSessionState(), sessionGen: 2, activity: act };
    const synced = { ...act, item_id: 'item-new' };
    const next = blockSessionReducer(state, {
      type: 'SYNC_FROM_SERVER',
      activity: synced,
      gen: 2,
    });
    expect(next.activity?.item_id).toBe('item-new');
  });
});

describe('blockSessionReducer P4 tombstone', () => {
  it('add and reconcile tombstones', () => {
    let state = blockSessionReducer(initialBlockSessionState(), {
      type: 'ADD_TOMBSTONE',
      id: 'r1',
    });
    expect(state.tombstones).toContain('r1');
    state = blockSessionReducer(state, {
      type: 'TOMBSTONE_RECONCILE',
      serverRecordIds: [],
    });
    expect(state.tombstones).toEqual([]);
  });
});
