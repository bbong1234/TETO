import { describe, expect, it } from 'vitest';
import { buildBlockItemSwitchSegmentLabel, buildBlockSegmentLabel, buildBlockAttributionSegmentLabel, resolveBlockSessionSubItemTitles, subItemTitleFromSegmentLabel } from '../use-block-session-segments';
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
  {
    id: 'item-module',
    user_id: 'u',
    title: '权限模块',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'item-dev',
    created_at: '',
    updated_at: '',
  },
];

function activity(overrides: Partial<TetoRecord> = {}): TetoRecord {
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

describe('buildBlockSegmentLabel', () => {
  it('二类归属：与外部时间线一致展示一级-二级', () => {
    const label = buildBlockSegmentLabel(
      items,
      activity({ item_id: 'item-dev' })
    );
    expect(label).toBe('编程-公司系统开发');
  });

  it('三类子项：展示一级-二级-三级', () => {
    const label = buildBlockSegmentLabel(
      items,
      activity({
        item_id: 'item-dev',
        sub_item_id: 'sub-plan',
        content: '切换到 方案报批',
      })
    );
    expect(label).toBe('编程-公司系统开发-方案报批');
  });

  it('三类事项：展示完整路径', () => {
    const label = buildBlockSegmentLabel(
      items,
      activity({ item_id: 'item-module' })
    );
    expect(label).toBe('编程-公司系统开发-权限模块');
  });

  it('行动后缀：标签路径 · 行动', () => {
    const label = buildBlockSegmentLabel(
      items,
      activity({ item_id: 'item-dev', action_text: '联调' })
    );
    expect(label).toBe('编程-公司系统开发 · 联调');
  });
});

describe('buildBlockAttributionSegmentLabel', () => {
  it('动作标签 PATCH 保留三级 SubItem 路径', () => {
    const subTitles = new Map([['sub-17', 'TETO项目1.7版本']]);
    const label = buildBlockAttributionSegmentLabel(
      items,
      activity({
        item_id: 'item-dev',
        sub_item_id: 'sub-17',
        action_text: '看书',
        tags: [{ id: 't1', name: '看书', type: 'function' } as never],
      }),
      { tag_ids: ['t1'], attributionChanged: false },
      subTitles
    );
    expect(label).toBe('编程-公司系统开发-TETO项目1.7版本 · 看书');
  });

  it('动作 PATCH 可从已有段 label 解析三级标题', () => {
    const segments = [
      {
        label: '编程-公司系统开发-TETO项目1.7版本',
        startMs: 1,
        endMs: null,
        sub_item_id: 'sub-17',
      },
    ];
    expect(subItemTitleFromSegmentLabel(segments, 'sub-17')).toBe('TETO项目1.7版本');
    const titles = resolveBlockSessionSubItemTitles('sub-17', {
      blockSegments: segments,
    });
    const label = buildBlockAttributionSegmentLabel(
      items,
      activity({
        item_id: 'item-dev',
        sub_item_id: 'sub-17',
        action_text: '看书',
        tags: [{ id: 't1', name: '看书', type: 'function' } as never],
      }),
      { tag_ids: ['t1'], attributionChanged: false },
      titles
    );
    expect(label).toBe('编程-公司系统开发-TETO项目1.7版本 · 看书');
  });
});

describe('buildBlockItemSwitchSegmentLabel', () => {
  it('事项切换：不含旧动作，SubItem 展示三级路径', () => {
    const label = buildBlockItemSwitchSegmentLabel(
      items,
      'item-dev',
      'sub-plan',
      '方案报批'
    );
    expect(label).toBe('编程-公司系统开发-方案报批');
  });

  it('事项切换：无 SubItem 时不带行动后缀', () => {
    const label = buildBlockItemSwitchSegmentLabel(
      items,
      'item-dev',
      null,
      undefined,
      undefined
    );
    expect(label).toBe('编程-公司系统开发');
  });
});
