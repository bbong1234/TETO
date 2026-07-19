import { describe, expect, it } from 'vitest';
import { buildTimelineEntryText, buildTimelineEntryParts } from '../item-tree';
import { buildDayTimelineFromRecords } from '../timeline-utils';
import type { Item, Record as TetoRecord } from '@/types/teto';

const items: Item[] = [
  {
    id: 'cat-work',
    user_id: 'u',
    title: '编程',
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
  {
    id: 'item-dev',
    user_id: 'u',
    title: '公司系统开发',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'cat-work',
    created_at: '',
    updated_at: '',
  },
];

function record(overrides: Partial<TetoRecord> = {}): TetoRecord {
  return {
    id: 'r1',
    user_id: 'u',
    record_day_id: 'd1',
    content: '',
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
    created_at: '',
    updated_at: '',
    tags: [],
    item: null,
    linked_records: [],
    ...overrides,
  };
}

describe('buildTimelineEntryText', () => {
  it('格式：标签路径-动作-时间-摘要，不含进行中占位', () => {
    const text = buildTimelineEntryText(
      record({
        item_id: 'item-dev',
        content: '进行中',
        action_text: '联调',
        time_text: '上午',
        event_text: '接口字段需统一',
        lifecycle_status: 'completed',
        occurred_at_end: '2026-05-27T10:00:00.000Z',
      }),
      items
    );
    expect(text).toBe('编程-公司系统开发 联调 上午 接口字段需统一');
    expect(text).not.toContain('进行中');
  });

  it('未归类记录展示摘要正文', () => {
    const text = buildTimelineEntryText(
      record({
        content: '早饭，吃了两个茶叶蛋，一个馒头，花了5块',
        action_text: '吃早饭',
        lifecycle_status: 'completed',
        occurred_at_end: '2026-05-27T09:35:00.000Z',
      }),
      items
    );
    expect(text).toBe('吃早饭 早饭，吃了两个茶叶蛋，一个馒头，花了5块');
  });

  it('随手记优先展示 raw_input 原文', () => {
    const text = buildTimelineEntryText(
      record({
        input_source: 'quick',
        raw_input: '早饭，吃了两个茶叶蛋，花了5块',
        content: '早饭，吃了两个茶叶蛋，花了5块',
        action_text: '吃早饭',
        lifecycle_status: 'completed',
        occurred_at_end: '2026-05-27T09:35:00.000Z',
      }),
      items
    );
    expect(text).toBe('吃早饭 早饭，吃了两个茶叶蛋，花了5块');
  });

  it('进行中会话仅展示标签与动作，摘要不回退占位文案', () => {
    const text = buildTimelineEntryText(
      record({
        item_id: 'item-dev',
        content: '进行中',
        action_text: '开发',
        lifecycle_status: 'active',
      }),
      items,
      { isCurrent: true }
    );
    expect(text).toBe('编程-公司系统开发 开发');
  });

  it('子项归属：展示三级标签路径，且不重复「切换到」摘要', () => {
    const text = buildTimelineEntryText(
      record({
        item_id: 'item-dev',
        sub_item_id: 'sub-plan',
        content: '切换到 方案报批',
        lifecycle_status: 'completed',
        occurred_at_end: '2026-05-27T10:00:00.000Z',
      }),
      items,
      {
        subItemTitles: new Map([['sub-plan', '方案报批']]),
      }
    );
    expect(text).toBe('编程-公司系统开发-方案报批');
  });

  it('子项归属：无 subItemTitles 时从 content 解析第三级', () => {
    const text = buildTimelineEntryText(
      record({
        item_id: 'item-dev',
        sub_item_id: 'sub-plan',
        content: '切换到 方案报批',
        lifecycle_status: 'completed',
        occurred_at_end: '2026-05-27T10:00:00.000Z',
      }),
      items
    );
    expect(text).toBe('编程-公司系统开发-方案报批');
  });

  it('detail_text strips redundant time prefix from legacy raw_input', () => {
    const parts = buildTimelineEntryParts(
      record({
        raw_input: '早上去了港源量玻璃',
        time_text: '早上',
        time_precision: 'fuzzy',
        occurred_at: '2026-07-19T09:00:00+08:00',
        lifecycle_status: 'completed',
      }),
      items
    );
    expect(parts.detail).toBe('去了港源量玻璃');
  });

  it('fuzzy records show segment label instead of clock on timeline', () => {
    const timeline = buildDayTimelineFromRecords(
      [
        record({
          id: 'fuzzy-1',
          raw_input: '在家刷抖音',
          time_text: '晚上',
          time_precision: 'fuzzy',
          occurred_at: '2026-07-19T20:31:00+08:00',
          lifecycle_status: 'completed',
        }),
      ],
      '2026-07-19',
      '今天',
      items
    );

    const entry = timeline.records.find((item) => item.id === 'fuzzy-1');
    expect(entry?.start_time).toBeUndefined();
    expect(entry?.time_label).toBe('晚上');
    expect(entry?.detail_text).toBe('在家刷抖音');
  });

  it('exact records derive segment label from occurred_at', () => {
    const timeline = buildDayTimelineFromRecords(
      [
        record({
          id: 'exact-1',
          raw_input: '去了港源量玻璃',
          time_text: '09:00',
          time_precision: 'exact',
          occurred_at: '2026-07-19T09:00:00+08:00',
          lifecycle_status: 'completed',
        }),
      ],
      '2026-07-19',
      '今天',
      items
    );

    const entry = timeline.records.find((item) => item.id === 'exact-1');
    expect(entry?.start_time).toBe('09:00');
    expect(entry?.time_label).toBe('早上');
  });

  it('fuzzy morning sorts before evening exact entries in feed', () => {
    const timeline = buildDayTimelineFromRecords(
      [
        record({
          id: 'evening-exact',
          raw_input: '去接妹妹',
          time_text: '20:30',
          time_precision: 'exact',
          occurred_at: '2026-07-19T20:30:00+08:00',
          lifecycle_status: 'completed',
        }),
        record({
          id: 'morning-fuzzy',
          raw_input: '去了公司',
          time_text: '早上',
          time_precision: 'fuzzy',
          occurred_at: '2026-07-19T20:31:00+08:00',
          lifecycle_status: 'completed',
        }),
      ],
      '2026-07-19',
      '今天',
      items
    );

    const activityIds = timeline.records
      .filter((item) => item.kind === 'activity')
      .map((item) => item.id);
    expect(activityIds.indexOf('morning-fuzzy')).toBeLessThan(activityIds.indexOf('evening-exact'));
  });
});
