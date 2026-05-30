import { describe, it, expect } from 'vitest';
import type { Record as TetoRecord } from '@/types/teto';
import {
  buildDayFeedFromRecords,
  getRecordDisplayDate,
  recordBelongsToDay,
} from '../timeline-utils';

function baseRecord(overrides: Partial<TetoRecord> = {}): TetoRecord {
  return {
    id: 'r1',
    user_id: 'u1',
    record_day_id: 'd1',
    content: '测试内容',
    type: '发生',
    occurred_at: null,
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: null,
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
    time_anchor_date: null,
    linked_record_id: null,
    location: null,
    people: [],
    batch_id: null,
    input_id: null,
    parent_input_id: null,
    lifecycle_status: undefined,
    review_status: undefined,
    confidence_level: null,
    input_source: 'manual',
    created_at: '2026-05-27T10:00:00.000Z',
    updated_at: '2026-05-27T10:00:00.000Z',
    date: '2026-05-27',
    tags: [],
    item: null,
    linked_records: [],
    ...overrides,
  };
}

describe('recordBelongsToDay / getRecordDisplayDate', () => {
  it('计划按 time_anchor_date 归属', () => {
    const plan = baseRecord({
      id: 'plan1',
      type: '计划',
      content: '写报告',
      time_anchor_date: '2026-05-28',
      date: '2026-05-27',
      lifecycle_status: 'active',
    });
    expect(recordBelongsToDay(plan, '2026-05-28')).toBe(true);
    expect(recordBelongsToDay(plan, '2026-05-27')).toBe(false);
    expect(getRecordDisplayDate(plan)).toBe('2026-05-28');
  });

  it('想法按 created_at 归属（无 date 时）', () => {
    const idea = baseRecord({
      id: 'idea1',
      type: '想法',
      content: '突然想到',
      date: undefined as unknown as string,
      created_at: '2026-05-27T02:00:00.000Z',
    });
    expect(recordBelongsToDay(idea, '2026-05-27')).toBe(true);
    expect(getRecordDisplayDate(idea)).toBe('2026-05-27');
  });
});

describe('buildDayFeedFromRecords', () => {
  const date = '2026-05-27';

  it('纳入未定时计划与想法', () => {
    const plan = baseRecord({
      id: 'plan1',
      type: '计划',
      content: '整理桌面',
      lifecycle_status: 'active',
      time_anchor_date: date,
    });
    const idea = baseRecord({
      id: 'idea1',
      type: '想法',
      content: '买牛奶',
    });

    const feed = buildDayFeedFromRecords([plan, idea], date, '今天');

    const kinds = feed.records.map((e) => e.kind);
    expect(kinds).toContain('plan');
    expect(kinds).toContain('idea');
    expect(feed.records.find((e) => e.id === 'plan1')?.is_pinned).toBe(true);
    expect(feed.records.find((e) => e.id === 'idea1')?.text).toBe('买牛奶');
  });

  it('纳入带 occurred_at 的定时计划', () => {
    const plan = baseRecord({
      id: 'plan2',
      type: '计划',
      content: '下午开会',
      lifecycle_status: 'active',
      occurred_at: `${date}T14:00:00.000+08:00`,
      time_anchor_date: date,
    });

    const feed = buildDayFeedFromRecords([plan], date, '今天');
    const entry = feed.records.find((e) => e.id === 'plan2');
    expect(entry?.kind).toBe('plan');
    expect(entry?.start_time).toBeDefined();
  });
});
