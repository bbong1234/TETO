import { describe, expect, it } from 'vitest';
import { buildTimelineEntryText } from '../item-tree';
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
});
