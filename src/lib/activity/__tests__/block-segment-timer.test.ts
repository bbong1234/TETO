import { describe, expect, it } from 'vitest';
import { buildSegmentTimerRecord } from '@/lib/activity/block-segment-timer';
import type { BlockTimelineSegment } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
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

describe('buildSegmentTimerRecord', () => {
  it('uses the latest activity segment start as occurred_at', () => {
    const segments: BlockTimelineSegment[] = [
      {
        label: '段1',
        startMs: Date.parse('2026-07-04T06:00:00.000Z'),
        endMs: Date.parse('2026-07-04T07:00:00.000Z'),
      },
      {
        label: '段2',
        startMs: Date.parse('2026-07-04T07:00:00.000Z'),
        endMs: null,
      },
    ];

    const timer = buildSegmentTimerRecord(segments, baseActivity());
    expect(timer.occurred_at).toBe('2026-07-04T07:00:00.000Z');
    expect(timer.paused_total_seconds).toBe(0);
  });

  it('freezes timer at segment end when paused', () => {
    const segments: BlockTimelineSegment[] = [
      {
        label: '段1',
        startMs: Date.parse('2026-07-04T07:00:00.000Z'),
        endMs: Date.parse('2026-07-04T07:30:00.000Z'),
      },
      { label: '空白时间', startMs: Date.parse('2026-07-04T07:30:00.000Z'), endMs: Date.parse('2026-07-04T07:30:00.000Z'), isGap: true },
    ];

    const timer = buildSegmentTimerRecord(segments, {
      ...baseActivity(),
      session_state: 'paused',
      paused_at: '2026-07-04T07:30:00.000Z',
    });

    expect(timer.occurred_at).toBe('2026-07-04T07:00:00.000Z');
    expect(timer.occurred_at_end).toBe('2026-07-04T07:30:00.000Z');
  });
});
