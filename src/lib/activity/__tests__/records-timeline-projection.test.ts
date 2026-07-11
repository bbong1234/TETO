import { describe, expect, it } from 'vitest';
import {
  filterRecordsForBootstrap,
  reconcileTombstonesAfterFetch,
  selectTimelineRecords,
  shouldClearTombstoneOnFetch,
} from '@/lib/activity/select-timeline-records';
import { overlayCurrentActivityOnRecords } from '@/lib/activity/records-mutation';
import type { Record as TetoRecord } from '@/types/teto';

function activeRecord(id: string): TetoRecord {
  return {
    id,
    user_id: 'u',
    record_day_id: 'd1',
    content: 'test',
    type: '发生',
    occurred_at: '2026-07-05T08:00:00.000Z',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: 'item-1',
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
  };
}

describe('selectTimelineRecords', () => {
  it('filters tombstoned records', () => {
    const r1 = activeRecord('a1');
    const r2 = { ...activeRecord('a2'), lifecycle_status: 'completed' as const, occurred_at_end: '2026-07-05T09:00:00.000Z' };
    const result = selectTimelineRecords([r1, r2], { activity: null, tombstones: ['a1'] });
    expect(result.map((r) => r.id)).toEqual(['a2']);
  });

  it('keeps completed optimistic block segments for immediate stop display', () => {
    const seg = {
      ...activeRecord('optimistic-block-seg-1000-1'),
      lifecycle_status: 'completed' as const,
      occurred_at_end: '2026-07-05T09:00:00.000Z',
    };
    const result = selectTimelineRecords([seg], { activity: null, tombstones: [] });
    expect(result.map((r) => r.id)).toEqual(['optimistic-block-seg-1000-1']);
  });

  it('prepends current activity when not in list', () => {
    const completed = {
      ...activeRecord('done'),
      lifecycle_status: 'completed' as const,
      occurred_at_end: '2026-07-05T10:00:00.000Z',
    };
    const current = activeRecord('optimistic-1');
    const result = selectTimelineRecords([completed], { activity: current, tombstones: [] });
    expect(result[0].id).toBe('optimistic-1');
  });
});

describe('tombstone reconcile', () => {
  it('keeps tombstone when record still on server (P4 delete in flight)', () => {
    expect(shouldClearTombstoneOnFetch('del-1', ['del-1', 'other'])).toBe(false);
    expect(reconcileTombstonesAfterFetch(['del-1'], ['del-1'])).toEqual(['del-1']);
  });

  it('clears tombstone when record absent from server', () => {
    expect(shouldClearTombstoneOnFetch('del-1', ['other'])).toBe(true);
    expect(reconcileTombstonesAfterFetch(['del-1', 'gone'], ['other'])).toEqual([]);
  });

  it('filterRecordsForBootstrap respects tombstones', () => {
    const records = [activeRecord('a'), activeRecord('b')];
    expect(filterRecordsForBootstrap(records, ['a']).map((r) => r.id)).toEqual(['b']);
  });
});

describe('overlayCurrentActivityOnRecords', () => {
  it('overlays attribution onto matching id', () => {
    const base = activeRecord('real-1');
    const current = { ...base, action_text: '阅读' };
    const after = overlayCurrentActivityOnRecords([base], current);
    expect(after[0].action_text).toBe('阅读');
  });
});
