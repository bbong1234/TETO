import { describe, expect, it } from 'vitest';
import type { Item, Tag } from '@/types/teto';
import {
  buildDiaryRecordPayload,
  buildDiaryRecordPreview,
  resolveDiaryRecordOccurredAt,
} from '../diary-record-from-text';

const items: Item[] = [
  {
    id: 'cat-code',
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
    parent_item_id: 'cat-code',
    created_at: '',
    updated_at: '',
  },
];

const tags: Tag[] = [
  { id: 'tag-write', name: '写代码', type: 'function', scope_item_id: 'cat-code' } as Tag,
];

describe('diary-record-from-text', () => {
  it('extracts time on anchor date from explicit clock', () => {
    const occurredAt = resolveDiaryRecordOccurredAt('2026-07-12', '上午10点 写代码');
    expect(new Date(occurredAt).getHours()).toBe(10);
    expect(new Date(occurredAt).getMinutes()).toBe(0);
  });

  it('builds payload with item, action, and expense', () => {
    const payload = buildDiaryRecordPayload({
      text: '上午10点 编程 公司系统开发 写代码 花了30元',
      anchorDate: '2026-07-12',
      items,
      tags,
      userRules: [],
    });

    expect(payload.date).toBe('2026-07-12');
    expect(payload.raw_input).toContain('30元');
    expect(payload.item_id).toBe('item-dev');
    expect(payload.tag_ids).toEqual(['tag-write']);
    expect(payload.action_text).toBe('写代码');
    expect(payload.cost).toBe(30);
    expect(payload.money_direction).toBe('expense');
    expect(payload.occurred_at).toBeTruthy();
  });

  it('builds preview chips for parsed fields', () => {
    const preview = buildDiaryRecordPreview({
      text: '上午10点 编程 公司系统开发 写代码 花了30元',
      anchorDate: '2026-07-12',
      items,
      tags,
      userRules: [],
    });

    expect(preview.timeLabel).toBe('10:00');
    expect(preview.itemLabel).toContain('编程');
    expect(preview.actionLabel).toBe('写代码');
    expect(preview.costLabel).toBe('-¥30');
  });
});
