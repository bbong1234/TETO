import { describe, expect, it } from 'vitest';
import {
  buildOptimisticActiveRecord,
  buildOptimisticManualRecord,
  buildStoppedSnapshot,
  isOptimisticRecordId,
  mergeRecordUpdated,
  mergeSwitchIntoRecords,
  overlayCurrentActivityOnRecords,
  preserveActiveTimingSnapshot,
  replaceOptimisticRecord,
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

  it('纯停止时清除遗留 active，只保留 completed', () => {
    const orphan = activeRecord('orphan-1', '进行中');
    const current = activeRecord('cur-1', '当前');
    const stopped = buildStoppedSnapshot(current);

    const after = mergeSwitchIntoRecords(
      [orphan, current],
      { record: null, stopped: [stopped] },
      items,
      '2026-05-31'
    );

    const actives = after.filter((r) => r.lifecycle_status === 'active' && !r.occurred_at_end);
    expect(actives).toHaveLength(0);
    expect(after.find((r) => r.id === 'cur-1')?.lifecycle_status).toBe('completed');
  });

  it('取消（record null + 无 stopped）时剥离 optimistic 与 active', () => {
    const optimistic = buildOptimisticActiveRecord({
      content: '刚进入',
      item_id: 'item-1',
      items,
      date: '2026-05-31',
    });
    const serverActive = activeRecord('real-active', '服务器进行中');

    const after = mergeSwitchIntoRecords(
      [optimistic, serverActive],
      { record: null, stopped: [] },
      items,
      '2026-05-31'
    );

    const actives = after.filter((r) => r.lifecycle_status === 'active' && !r.occurred_at_end);
    expect(actives).toHaveLength(0);
    expect(after.some((r) => isOptimisticRecordId(r.id))).toBe(false);
  });

  it('keeps completed snapshot when switching away from optimistic active', () => {
    const prior = buildOptimisticActiveRecord({
      content: '第一段',
      item_id: 'item-1',
      items,
      date: '2026-05-31',
    });
    prior.id = 'optimistic-prior';

    const list = mergeSwitchIntoRecords(
      [],
      { record: prior, stopped: [] },
      items,
      '2026-05-31'
    );

    const next = buildOptimisticActiveRecord({
      content: '第二段',
      item_id: 'item-1',
      items,
      date: '2026-05-31',
    });
    next.id = 'optimistic-next';
    const stopped = buildStoppedSnapshot(prior);
    const afterSwitch = mergeSwitchIntoRecords(
      list,
      { record: next, stopped: [stopped] },
      items,
      '2026-05-31'
    );

    const completed = afterSwitch.filter(
      (r) => r.lifecycle_status === 'completed' && r.content === '第一段'
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].occurred_at_end).toBeTruthy();
    expect(afterSwitch.filter((r) => r.lifecycle_status === 'active')).toHaveLength(1);
  });

  it('replaces optimistic block segment placeholders when server stop settles', () => {
    const active = activeRecord('real-id-1', '块时间');
    const optimisticStop = [
      { ...active, lifecycle_status: 'completed' as const, occurred_at_end: '2026-07-04T10:00:00.000Z' },
      {
        ...active,
        id: 'optimistic-block-seg-1000-1',
        content: '段2',
        occurred_at: '2026-07-04T09:00:00.000Z',
        occurred_at_end: '2026-07-04T09:30:00.000Z',
        lifecycle_status: 'completed' as const,
      },
      {
        ...active,
        id: 'optimistic-block-seg-2000-2',
        content: '段3',
        occurred_at: '2026-07-04T09:30:00.000Z',
        occurred_at_end: '2026-07-04T10:00:00.000Z',
        lifecycle_status: 'completed' as const,
      },
    ];

    const afterOptimistic = mergeSwitchIntoRecords(
      [active],
      { record: null, stopped: optimisticStop },
      items,
      '2026-07-04'
    );
    expect(afterOptimistic).toHaveLength(3);

    const serverStop = [
      { ...optimisticStop[0], id: 'real-id-1' },
      { ...optimisticStop[1], id: 'real-id-2' },
      { ...optimisticStop[2], id: 'real-id-3' },
    ];
    const afterSettle = mergeSwitchIntoRecords(
      afterOptimistic,
      { record: null, stopped: serverStop },
      items,
      '2026-07-04'
    );

    expect(afterSettle).toHaveLength(3);
    expect(afterSettle.some((r) => r.id.startsWith('optimistic-block-seg-'))).toBe(false);
    expect(afterSettle.map((r) => r.id).sort()).toEqual(['real-id-1', 'real-id-2', 'real-id-3']);
  });
});

describe('preserveActiveTimingSnapshot', () => {
  it('keeps baseline occurred_at when PATCH response carries a newer timestamp', () => {
    const baseline = activeRecord('real-id-1', '进行中');
    baseline.occurred_at = '2026-07-04T06:00:00.000Z';
    const incoming = {
      ...baseline,
      action_text: '写代码',
      occurred_at: '2026-07-04T08:00:00.000Z',
    };

    const merged = preserveActiveTimingSnapshot(incoming, baseline);

    expect(merged.occurred_at).toBe('2026-07-04T06:00:00.000Z');
    expect(merged.action_text).toBe('写代码');
  });
});

describe('quick-note optimistic records', () => {
  it('copies quick-note time and source fields from the submit payload', () => {
    const optimistic = buildOptimisticManualRecord(
      {
        content: '',
        raw_input: '早上9点吃早饭',
        date: '2026-07-05',
        type: '发生',
        occurred_at: '2026-07-05T09:00:00+08:00',
        lifecycle_status: 'completed',
        input_source: 'quick',
        item_id: 'item-1',
        cost: 30,
        duration_minutes: 10,
      },
      items
    );

    expect(optimistic.occurred_at).toBe('2026-07-05T09:00:00+08:00');
    expect(optimistic.raw_input).toBe('早上9点吃早饭');
    expect(optimistic.input_source).toBe('quick');
    expect(optimistic.cost).toBe(30);
    expect(optimistic.duration_minutes).toBe(10);
  });

  it('replaces only the matching optimistic quick note', () => {
    const first = buildOptimisticManualRecord(
      {
        content: '',
        raw_input: '第一条',
        date: '2026-07-05',
        type: '发生',
        occurred_at: '2026-07-05T09:00:00+08:00',
        input_source: 'quick',
        item_id: 'item-1',
      },
      items
    );
    const second = buildOptimisticManualRecord(
      {
        content: '',
        raw_input: '第二条',
        date: '2026-07-05',
        type: '发生',
        occurred_at: '2026-07-05T09:01:00+08:00',
        input_source: 'quick',
        item_id: 'item-1',
      },
      items
    );
    first.id = 'optimistic-first';
    second.id = 'optimistic-second';

    const server = {
      ...activeRecord('server-second', ''),
      raw_input: '第二条',
      input_source: 'quick' as const,
      lifecycle_status: 'completed' as const,
      occurred_at: '2026-07-05T09:01:00+08:00',
      date: '2026-07-05',
    };
    const result = replaceOptimisticRecord(
      [second, first],
      server,
      items,
      '2026-07-05'
    );

    expect(result.some((record) => record.id === 'optimistic-first')).toBe(true);
    expect(result.some((record) => record.id === 'optimistic-second')).toBe(false);
    expect(result.some((record) => record.id === 'server-second')).toBe(true);
  });
});

describe('mergeRecordUpdated', () => {
  it('merges action_text into active record when ids differ (optimistic patch)', () => {
    const serverActive = activeRecord('real-id-1', '进行中');
    const patch = {
      ...serverActive,
      id: 'optimistic-patch',
      action_text: '写代码',
    };

    const after = mergeRecordUpdated([serverActive], patch, items, '2026-05-31');

    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('real-id-1');
    expect(after[0].action_text).toBe('写代码');
  });
});

describe('overlayCurrentActivityOnRecords', () => {
  it('overlays action_text from currentActivity onto matching list record', () => {
    const serverActive = activeRecord('real-id-1', '进行中');
    const current = { ...serverActive, action_text: '调试' };

    const after = overlayCurrentActivityOnRecords([serverActive], current);

    expect(after[0].action_text).toBe('调试');
  });

  it('overlays onto sole active record when ids differ', () => {
    const serverActive = activeRecord('real-id-1', '进行中');
    const current = {
      ...serverActive,
      id: 'optimistic-current',
      action_text: '开会',
    };

    const after = overlayCurrentActivityOnRecords([serverActive], current);

    expect(after[0].id).toBe('real-id-1');
    expect(after[0].action_text).toBe('开会');
  });

  it('prepends currentActivity when not in list and no active record', () => {
    const completed = { ...activeRecord('done-1', '已完成'), lifecycle_status: 'completed' as const, occurred_at_end: '2026-07-05T10:00:00.000Z' };
    const current = activeRecord('optimistic-new', '刚进入');

    const after = overlayCurrentActivityOnRecords([completed], current);

    expect(after).toHaveLength(2);
    expect(after[0].id).toBe('optimistic-new');
  });
});

describe('findMatchingServerRecordId', () => {
  it('maps optimistic placeholder to server record by display_no', async () => {
    const { findMatchingServerRecordId } = await import('../records-mutation');
    const server = activeRecord('server-1', '写日报');
    server.display_no = '202607170001';
    const optimistic = activeRecord('optimistic-abc', '写日报');
    optimistic.display_no = '202607170001';

    expect(findMatchingServerRecordId(optimistic, [optimistic, server])).toBe('server-1');
  });

  it('maps optimistic block segment by occurred_at and end time', async () => {
    const { findMatchingServerRecordId } = await import('../records-mutation');
    const server = activeRecord('server-seg', '专注');
    server.occurred_at = '2026-07-17T02:00:00.000Z';
    server.occurred_at_end = '2026-07-17T03:00:00.000Z';
    server.lifecycle_status = 'completed';
    const optimistic = activeRecord('optimistic-block-seg-1-0', '专注');
    optimistic.occurred_at = server.occurred_at;
    optimistic.occurred_at_end = server.occurred_at_end;
    optimistic.lifecycle_status = 'completed';

    expect(findMatchingServerRecordId(optimistic, [optimistic, server])).toBe('server-seg');
  });
});
