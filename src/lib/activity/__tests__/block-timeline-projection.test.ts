import { describe, expect, it } from 'vitest';
import { expandFeedWithBlockSegments } from '@/lib/activity/block-timeline-projection';
import type { DayTimeline } from '@/types/teto';

function baseFeed(): DayTimeline {
  return {
    date: '2026-07-04',
    label: '今天',
    record_count: 1,
    records: [
      {
        id: 'active-1',
        kind: 'activity',
        record_type: '发生',
        start_time: '14:00',
        text: '工作-项目A · 写代码',
        tag_path: '工作-项目A',
        action_label: '写代码',
        is_current: true,
        occurred_at: '2026-07-04T06:00:00.000Z',
      },
    ],
  };
}

describe('expandFeedWithBlockSegments', () => {
  it('expands single current entry into multiple block segments', () => {
    const feed = baseFeed();
    const segments = [
      { label: '工作-项目A · 写代码', startMs: Date.parse('2026-07-04T14:00:00'), endMs: Date.parse('2026-07-04T14:30:00') },
      { label: '工作-项目A · 开会', startMs: Date.parse('2026-07-04T14:30:00'), endMs: null },
    ];

    const expanded = expandFeedWithBlockSegments(feed, segments, 'active-1');

    expect(expanded.records.filter((r) => r.kind === 'activity' && !r.is_gap)).toHaveLength(2);
    expect(expanded.records.find((r) => r.is_current)?.action_label).toBe('开会');
    expect(expanded.records.find((r) => !r.is_current)?.end_time).toBeDefined();
  });

  it('does not expand when feed already has multiple block activity entries', () => {
    const feed: DayTimeline = {
      ...baseFeed(),
      records: [
        {
          id: 'done-1',
          kind: 'activity',
          record_type: '发生',
          start_time: '14:00',
          end_time: '14:30',
          text: '工作 · 写代码',
          is_current: false,
        },
        {
          id: 'active-1',
          kind: 'activity',
          record_type: '发生',
          start_time: '14:30',
          text: '工作 · 开会',
          is_current: true,
        },
      ],
    };
    const segments = [
      { label: '工作 · 写代码', startMs: Date.parse('2026-07-04T14:00:00'), endMs: Date.parse('2026-07-04T14:30:00') },
      { label: '工作 · 开会', startMs: Date.parse('2026-07-04T14:30:00'), endMs: null },
    ];

    const expanded = expandFeedWithBlockSegments(feed, segments, 'active-1');
    expect(expanded.records).toEqual(feed.records);
  });

  it('returns feed unchanged for single segment', () => {
    const feed = baseFeed();
    const segments = [{ label: '工作', startMs: Date.now(), endMs: null }];
    expect(expandFeedWithBlockSegments(feed, segments, 'active-1')).toEqual(feed);
  });
});
