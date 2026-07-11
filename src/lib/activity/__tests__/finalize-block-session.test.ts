import { describe, expect, it } from 'vitest';
import {
  buildOptimisticStoppedFromBlockSegments,
  shouldSplitBlockSessionOnStop,
} from '@/lib/activity/finalize-block-session';
import type { Record } from '@/types/teto';

function baseActivity(): Record {
  return {
    id: 'active-1',
    user_id: 'u1',
    record_day_id: 'rd1',
    content: '进行中',
    type: '发生',
    occurred_at: '2026-07-04T06:00:00.000Z',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: 'item-a',
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
    created_at: '2026-07-04T06:00:00.000Z',
    updated_at: '2026-07-04T06:00:00.000Z',
    date: '2026-07-04',
    tags: [],
    item: { id: 'item-a', title: '项目A' },
    linked_records: [],
    session_state: 'running',
    paused_total_seconds: 0,
    paused_at: null,
  };
}

describe('shouldSplitBlockSessionOnStop', () => {
  it('returns true when multiple non-gap segments exist', () => {
    expect(
      shouldSplitBlockSessionOnStop([
        { label: '编程-项目A · 写代码', startMs: 1, endMs: 2 },
        { label: '编程-项目B · 开会', startMs: 2, endMs: null },
      ])
    ).toBe(true);
  });

  it('ignores gap-only extra segments', () => {
    expect(
      shouldSplitBlockSessionOnStop([
        { label: '编程-项目A', startMs: 1, endMs: 2 },
        { label: '空白时间', startMs: 2, endMs: 2, isGap: true },
      ])
    ).toBe(false);
  });
});

describe('buildOptimisticStoppedFromBlockSegments', () => {
  it('builds one completed snapshot per activity segment', () => {
    const stopIso = '2026-07-04T08:00:00.000Z';
    const snapshots = buildOptimisticStoppedFromBlockSegments(
      baseActivity(),
      [
        {
          label: '编程-项目A · 写代码',
          startMs: Date.parse('2026-07-04T06:00:00.000Z'),
          endMs: Date.parse('2026-07-04T07:00:00.000Z'),
          item_id: 'item-a',
        },
        {
          label: '编程-项目B · 开会',
          startMs: Date.parse('2026-07-04T07:00:00.000Z'),
          endMs: null,
          item_id: 'item-b',
          action_text: '开会',
        },
      ],
      stopIso
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].lifecycle_status).toBe('completed');
    expect(snapshots[1].lifecycle_status).toBe('completed');
    expect(snapshots[0].item_id).toBe('item-a');
    expect(snapshots[1].item_id).toBe('item-b');
    expect(snapshots[1].occurred_at_end).toBe(stopIso);
    expect(snapshots[0].content).toBe('写代码');
    expect(snapshots[1].content).toBe('开会');
  });

  it('uses optimistic-block-seg id for first segment when activity id is still optimistic', () => {
    const stopIso = '2026-07-04T08:00:00.000Z';
    const startMs = Date.parse('2026-07-04T06:00:00.000Z');
    const snapshots = buildOptimisticStoppedFromBlockSegments(
      { ...baseActivity(), id: 'optimistic-abc123' },
      [
        {
          label: '段1',
          startMs,
          endMs: null,
          item_id: 'item-a',
        },
      ],
      stopIso
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe(`optimistic-block-seg-${startMs}-0`);
    expect(snapshots[0].lifecycle_status).toBe('completed');
  });

  it('does not inherit activity sub_item when segment switches to another item', () => {
    const snapshots = buildOptimisticStoppedFromBlockSegments(
      {
        ...baseActivity(),
        item_id: 'item-a',
        sub_item_id: 'sub-a',
      },
      [
        {
          label: '项目A · 写代码',
          startMs: Date.parse('2026-07-04T06:00:00.000Z'),
          endMs: Date.parse('2026-07-04T07:00:00.000Z'),
          item_id: 'item-a',
          sub_item_id: 'sub-a',
        },
        {
          label: '项目B · 开会',
          startMs: Date.parse('2026-07-04T07:00:00.000Z'),
          endMs: null,
          item_id: 'item-b',
        },
      ],
      '2026-07-04T08:00:00.000Z'
    );

    expect(snapshots[1].item_id).toBe('item-b');
    expect(snapshots[1].sub_item_id).toBeNull();
  });
});
