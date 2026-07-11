import { describe, expect, it } from 'vitest';
import {
  buildBlockDisplayRecord,
  buildBlockUndoSnapshotActivity,
  mergeBlockAttributionFromServer,
  resolveBlockActionTagId,
  resolveBlockAttributionItemIds,
  resolveBlockDisplayContext,
  resolveBlockPatchBaseline,
  resolveSegmentAttributionForPersist,
} from '@/lib/activity/block-attribution-display';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';

const items = [
  {
    id: 'cat-prog',
    user_id: 'u1',
    title: '编程',
    parent_item_id: null,
    status: '活跃',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'item-teto',
    user_id: 'u1',
    title: 'TETO开发',
    parent_item_id: 'cat-prog',
    status: '活跃',
    created_at: '',
    updated_at: '',
  },
] as Item[];

function activity(overrides: Partial<TetoRecord> = {}): TetoRecord {
  return {
    id: 'a1',
    user_id: 'u1',
    record_day_id: 'rd1',
    content: '编程',
    type: '发生',
    occurred_at: '2026-07-04T13:00:00.000Z',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: 'cat-prog',
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
    created_at: '',
    updated_at: '',
    date: '2026-07-04',
    tags: [],
    ...overrides,
  };
}

describe('resolveBlockAttributionItemIds', () => {
  it('prefers segment child item when activity only has locked category', () => {
    const ids = resolveBlockAttributionItemIds(activity(), 'cat-prog', {
      item_id: 'item-teto',
      sub_item_id: null,
    });
    expect(ids.item_id).toBe('item-teto');
  });

  it('ignores stale activity sub_item when open segment has no sub_item', () => {
    const ids = resolveBlockAttributionItemIds(
      activity({ item_id: 'item-teto', sub_item_id: 'sub-stale' }),
      'cat-prog',
      { item_id: 'item-teto', sub_item_id: null }
    );
    expect(ids.item_id).toBe('item-teto');
    expect(ids.sub_item_id).toBeNull();
  });
  it('resolveBlockPatchBaseline drops stale activity sub_item when segment has none', () => {
    const segments = [
      {
        label: 'TETO开发',
        startMs: 1,
        endMs: null,
        item_id: 'item-teto',
        sub_item_id: null,
      },
    ];
    const baseline = resolveBlockPatchBaseline(
      activity({ item_id: 'item-teto', sub_item_id: 'sub-stale' }),
      'cat-prog',
      segments
    );
    expect(baseline.item_id).toBe('item-teto');
    expect(baseline.sub_item_id).toBeNull();
  });
});

describe('resolveSegmentAttributionForPersist', () => {
  it('does not inherit activity sub_item when segment item differs', () => {
    const ids = resolveSegmentAttributionForPersist(
      activity({ item_id: 'item-a', sub_item_id: 'sub-a' }),
      {
        label: '项目B',
        startMs: 1,
        endMs: 2,
        item_id: 'item-b',
      },
      null
    );
    expect(ids.item_id).toBe('item-b');
    expect(ids.sub_item_id).toBeNull();
  });
});

describe('resolveBlockActionTagId', () => {
  it('falls back to segment function tag when activity tags empty', () => {
    expect(
      resolveBlockActionTagId(activity(), { tag_ids: ['tag-read'] })
    ).toBe('tag-read');
  });

  it('does not inherit activity function tag when current segment has no action', () => {
    expect(
      resolveBlockActionTagId(
        activity({
          tags: [
            {
              id: 'tag-old',
              user_id: 'u1',
              name: '旧动作',
              type: 'function',
              color: null,
              created_at: '',
            },
          ],
        }),
        { item_id: 'item-teto', sub_item_id: 'sub-1', tag_ids: [] }
      )
    ).toBeNull();
  });
});

describe('resolveBlockDisplayContext', () => {
  it('selects L2 item from segment meta under locked category', () => {
    const ctx = resolveBlockDisplayContext(items, activity(), 'cat-prog', null, {
      item_id: 'item-teto',
      sub_item_id: null,
    });
    expect(ctx.itemId).toBe('item-teto');
  });
});

describe('buildBlockDisplayRecord', () => {
  it('merges segment item and action when activity only has category', () => {
    const tags = [
      { id: 'tag-read', user_id: 'u1', name: '阅读', type: 'function', color: null, created_at: '' },
    ] as Tag[];
    const merged = buildBlockDisplayRecord(
      activity(),
      tags,
      'cat-prog',
      { item_id: 'item-teto', sub_item_id: null, action_text: '阅读', tag_ids: ['tag-read'] }
    );
    expect(merged.item_id).toBe('item-teto');
    expect(merged.action_text).toBe('阅读');
    expect(merged.tags?.some((t) => t.id === 'tag-read')).toBe(true);
  });

  it('returns activity unchanged outside block mode', () => {
    const base = activity({ item_id: 'item-teto' });
    expect(buildBlockDisplayRecord(base, [], null, null)).toBe(base);
  });
});

describe('buildBlockUndoSnapshotActivity', () => {
  it('merges open segment meta into undo snapshot when activity is category-only', () => {
    const tags = [
      { id: 'tag-read', user_id: 'u1', name: '阅读', type: 'function', color: null, created_at: '' },
    ] as Tag[];
    const snapshot = buildBlockUndoSnapshotActivity(activity(), [
      {
        label: 'TETO开发 · 阅读',
        startMs: 1,
        endMs: null,
        item_id: 'item-teto',
        sub_item_id: 'sub-1',
        action_text: '阅读',
        tag_ids: ['tag-read'],
      },
    ], tags);
    expect(snapshot.item_id).toBe('item-teto');
    expect(snapshot.sub_item_id).toBe('sub-1');
    expect(snapshot.action_text).toBe('阅读');
    expect(snapshot.tags?.some((t) => t.id === 'tag-read')).toBe(true);
  });
});

describe('mergeBlockAttributionFromServer', () => {
  it('keeps specific client attribution when server returns category only', () => {
    const prev = activity({
      item_id: 'item-teto',
      action_text: '阅读',
      tags: [{ id: 'tag-read', user_id: 'u1', name: '阅读', type: 'function', color: null, created_at: '' }],
    });
    const updated = activity({ item_id: 'cat-prog', tags: [] });
    const merged = mergeBlockAttributionFromServer(prev, updated, 'cat-prog');
    expect(merged.item_id).toBe('item-teto');
    expect(merged.action_text).toBe('阅读');
    expect(merged.tags?.length).toBe(1);
  });
});
