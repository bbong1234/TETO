import { describe, expect, it } from 'vitest';
import {
  buildOptimisticActiveRecord,
  mergeSwitchIntoRecords,
} from '@/lib/activity/records-mutation';
import type { Item, Record } from '@/types/teto';

const items: Item[] = [
  {
    id: 'item-1',
    user_id: 'u',
    title: 'TETO开发',
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

function activeRecord(id: string, content: string): Record {
  return {
    id,
    user_id: 'u',
    record_day_id: 'day-1',
    content,
    type: '发生',
    occurred_at: '2026-05-31T06:28:00.000Z',
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
    time_anchor_date: '2026-05-31',
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
    created_at: '2026-05-31T06:28:00.000Z',
    updated_at: '2026-05-31T06:28:00.000Z',
    date: '2026-05-31',
    tags: [],
    item: null,
    linked_records: [],
  };
}

describe('mergeSwitchIntoRecords', () => {
  it('replaces optimistic active record with server record (no duplicate 进行中)', () => {
    const optimistic = buildOptimisticActiveRecord({
      content: '时代法国红酒看来',
      item_id: 'item-1',
      items,
      date: '2026-05-31',
    });
    const afterOptimistic = mergeSwitchIntoRecords(
      [],
      { record: optimistic, stopped: [] },
      items,
      '2026-05-31'
    );
    expect(afterOptimistic.filter((r) => r.lifecycle_status === 'active')).toHaveLength(1);

    const server = activeRecord('real-id-1', '时代法国红酒看来');
    const afterServer = mergeSwitchIntoRecords(
      afterOptimistic,
      { record: server, stopped: [] },
      items,
      '2026-05-31'
    );
    const actives = afterServer.filter((r) => r.lifecycle_status === 'active' && !r.occurred_at_end);
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe('real-id-1');
  });
});
