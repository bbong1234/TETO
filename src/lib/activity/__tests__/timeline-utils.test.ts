import { describe, it, expect } from 'vitest';
import type { Record as TetoRecord } from '@/types/teto';
import {
  buildDayFeedFromRecords,
  getRecordDisplayDate,
  recordBelongsToDay,
} from '../timeline-utils';
import {
  buildOptimisticManualRecord,
  mergeRecordUpdated,
  replaceOptimisticRecord,
} from '../records-mutation';

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

  it('随手记在 optimistic、服务端替换、属性增强三个阶段都留在时间线', () => {
    const occurredAt = `${date}T09:00:00+08:00`;
    const optimistic = buildOptimisticManualRecord(
      {
        content: '',
        raw_input: '早上9点吃早饭',
        date,
        type: '发生',
        occurred_at: occurredAt,
        lifecycle_status: 'completed',
        input_source: 'quick',
      },
      []
    );
    expect(
      buildDayFeedFromRecords([optimistic], date, '今天').records.some(
        (entry) => entry.id === optimistic.id
      )
    ).toBe(true);

    const server = baseRecord({
      id: 'quick-server',
      content: '',
      raw_input: '早上9点吃早饭',
      occurred_at: occurredAt,
      lifecycle_status: 'completed',
      input_source: 'quick',
      date,
    });
    const settled = replaceOptimisticRecord([optimistic], server, [], date);
    expect(
      buildDayFeedFromRecords(settled, date, '今天').records.some(
        (entry) => entry.id === 'quick-server'
      )
    ).toBe(true);

    const enhanced = { ...server, mood: '平静', action_text: '吃早饭' };
    const afterEnhance = mergeRecordUpdated(settled, enhanced, [], date);
    expect(
      buildDayFeedFromRecords(afterEnhance, date, '今天').records.some(
        (entry) => entry.id === 'quick-server'
      )
    ).toBe(true);
  });

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

  it('includeGaps: false 时不插入空白时间', () => {
    const a = baseRecord({
      id: 'a1',
      type: '发生',
      content: '活动 A',
      occurred_at: `${date}T10:00:00.000+08:00`,
      occurred_at_end: `${date}T10:30:00.000+08:00`,
    });
    const b = baseRecord({
      id: 'b1',
      type: '发生',
      content: '活动 B',
      occurred_at: `${date}T12:00:00.000+08:00`,
      occurred_at_end: `${date}T12:30:00.000+08:00`,
    });

    const withGaps = buildDayFeedFromRecords([a, b], date, '今天');
    const withoutGaps = buildDayFeedFromRecords([a, b], date, '今天', [], { includeGaps: false });

    expect(withGaps.records.some((e) => e.is_gap)).toBe(true);
    expect(withoutGaps.records.some((e) => e.is_gap)).toBe(false);
    expect(withoutGaps.records.filter((e) => e.kind === 'activity')).toHaveLength(2);
  });

  it('仅当前 running 会话显示进行中，已结束未归类不展示占位文案', () => {
    const completedUnassigned = baseRecord({
      id: 'done1',
      content: '进行中',
      lifecycle_status: 'completed',
      occurred_at: `${date}T09:43:00.000+08:00`,
      occurred_at_end: `${date}T10:13:00.000+08:00`,
      duration_minutes: 30,
    });
    const staleActive = baseRecord({
      id: 'stale1',
      content: '进行中',
      lifecycle_status: 'active',
      occurred_at: `${date}T10:34:00.000+08:00`,
      occurred_at_end: null,
      session_state: 'nested_paused',
      paused_at: `${date}T10:50:00.000+08:00`,
    });
    const current = baseRecord({
      id: 'cur1',
      content: '测试123',
      item_id: 'item-1',
      lifecycle_status: 'active',
      occurred_at: `${date}T11:17:00.000+08:00`,
      occurred_at_end: null,
      session_state: 'running',
      action_text: '开发',
    });

    const items = [
      {
        id: 'cat-1',
        user_id: 'u1',
        title: '编程',
        description: null,
        status: '活跃' as const,
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
      {
        id: 'item-1',
        user_id: 'u1',
        title: '测试123',
        description: null,
        status: '活跃' as const,
        color: null,
        icon: null,
        is_pinned: false,
        started_at: null,
        ended_at: null,
        folder_id: null,
        parent_item_id: 'cat-1',
        created_at: '',
        updated_at: '',
      },
    ];

    const feed = buildDayFeedFromRecords(
      [completedUnassigned, staleActive, current],
      date,
      '今天',
      items,
      { currentActivityId: 'cur1' }
    );

    const actives = feed.records.filter((e) => e.is_current);
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe('cur1');
    expect(actives[0].text).toBe('编程-测试123 开发');

    const doneEntry = feed.records.find((e) => e.id === 'done1');
    expect(doneEntry?.text).not.toContain('进行中');
  });

  it('瞬时记录应推进时间链，不产生重复空白段', () => {
    const block = baseRecord({
      id: 'block1',
      content: '未归类时段',
      lifecycle_status: 'completed',
      occurred_at: `${date}T10:34:00.000+08:00`,
      occurred_at_end: `${date}T11:05:00.000+08:00`,
      duration_minutes: 31,
    });
    const instant = baseRecord({
      id: 'meal1',
      content: '吃早饭',
      action_text: '吃早饭',
      lifecycle_status: 'completed',
      occurred_at: `${date}T11:13:00.000+08:00`,
      occurred_at_end: null,
      item_id: 'meal-item',
    });
    const orphan = baseRecord({
      id: 'orphan1',
      content: '进行中',
      lifecycle_status: 'active',
      occurred_at: `${date}T11:16:00.000+08:00`,
      occurred_at_end: `${date}T11:16:00.000+08:00`,
      duration_minutes: 0,
      session_state: 'nested_paused',
      paused_at: `${date}T11:16:00.000+08:00`,
    });

    const feed = buildDayFeedFromRecords([block, instant, orphan], date, '今天');
    const gaps = feed.records.filter((e) => e.is_gap);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].start_time).toBe('11:05');
    expect(gaps[0].end_time).toBe('11:13');
    expect(gaps[0].duration_minutes).toBe(8);
  });

  it('空白时间 duration_seconds 保留秒级精度', () => {
    const a = baseRecord({
      id: 'a1',
      type: '发生',
      content: '活动 A',
      occurred_at: `${date}T10:00:40.000+08:00`,
      occurred_at_end: `${date}T10:05:40.000+08:00`,
      duration_minutes: 5,
    });
    const b = baseRecord({
      id: 'b1',
      type: '发生',
      content: '活动 B',
      occurred_at: `${date}T11:38:20.000+08:00`,
      occurred_at_end: `${date}T11:38:30.000+08:00`,
      duration_minutes: 0,
    });

    const feed = buildDayFeedFromRecords([a, b], date, '今天');
    const gap = feed.records.find((e) => e.is_gap);
    expect(gap).toBeDefined();
    // 10:05:40 → 11:38:20 = 1h32m40s = 5560s
    expect(gap!.duration_seconds).toBe(5560);
    expect(gap!.duration_seconds! % 60).not.toBe(0);
  });

  it('取消后无 currentActivityId 时不展示进行中占位', () => {
    const cancelled = baseRecord({
      id: 'cancelled1',
      content: '已撤销',
      lifecycle_status: 'completed',
      occurred_at: `${date}T10:00:00.000+08:00`,
      occurred_at_end: `${date}T10:00:05.000+08:00`,
      duration_minutes: 0,
    });

    const feed = buildDayFeedFromRecords([cancelled], date, '今天', [], {
      currentActivityId: null,
    });

    expect(feed.records.some((e) => e.is_current)).toBe(false);
    expect(feed.records.some((e) => e.text?.includes('进行中'))).toBe(false);
  });
});

describe('isTimelineEntrySelectable', () => {
  it('allows completed activity records with time range', async () => {
    const { isTimelineEntrySelectable } = await import('../timeline-utils');
    expect(
      isTimelineEntrySelectable({
        id: 'rec-1',
        kind: 'activity',
        start_time: '10:32',
        end_time: '10:35',
        text: '编程',
      })
    ).toBe(true);
  });

  it('rejects gaps, current, pinned, and projection ids', async () => {
    const { isTimelineEntrySelectable } = await import('../timeline-utils');
    const base = {
      kind: 'activity' as const,
      start_time: '10:32',
      end_time: '10:35',
      text: '编程',
    };
    expect(isTimelineEntrySelectable({ ...base, id: 'gap:1', is_gap: true })).toBe(false);
    expect(isTimelineEntrySelectable({ ...base, id: 'r1', is_current: true })).toBe(true);
    expect(isTimelineEntrySelectable({ ...base, id: 'r1', is_pinned: true })).toBe(false);
    expect(isTimelineEntrySelectable({ ...base, id: 'block-seg-1' })).toBe(false);
    expect(isTimelineEntrySelectable({ ...base, id: 'session:1' })).toBe(false);
    expect(
      isTimelineEntrySelectable({
        ...base,
        id: 'optimistic-1',
        end_time: undefined,
      })
    ).toBe(false);
    expect(
      isTimelineEntrySelectable({
        ...base,
        id: 'optimistic-block-seg-123-1',
        end_time: '10:35',
      })
    ).toBe(true);
    expect(
      isTimelineEntrySelectable({
        ...base,
        id: 'optimistic-block-seg-123-1',
        is_current: true,
      })
    ).toBe(false);
    expect(
      isTimelineEntrySelectable({
        ...base,
        id: 'optimistic-abc123',
        end_time: '10:35',
      })
    ).toBe(true);
    expect(
      isTimelineEntrySelectable({
        ...base,
        id: 'optimistic-abc123',
        is_current: true,
      })
    ).toBe(false);
  });
});
