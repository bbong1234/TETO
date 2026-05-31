import { describe, expect, it } from 'vitest';
import {
  buildCorrectionPayload,
  formStateToUpdatePayload,
  isLegacyRecordType,
  recordToFormState,
} from '@/lib/activity/record-form';
import type { Item, Record } from '@/types/teto';

const items: Item[] = [
  {
    id: 'cat-prog',
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
    id: 'item-teto',
    user_id: 'u',
    title: 'TETO开发',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'cat-prog',
    created_at: '',
    updated_at: '',
  },
];

function baseRecord(overrides: Partial<Record> = {}): Record {
  return {
    id: 'rec-1',
    user_id: 'u',
    record_day_id: 'day-1',
    content: '',
    type: '发生',
    occurred_at: '2026-05-31T06:28:00.000+08:00',
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: 'item-teto',
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
    time_anchor_date: '2026-05-31',
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
    created_at: '2026-05-31T06:28:00.000Z',
    updated_at: '2026-05-31T06:28:00.000Z',
    date: '2026-05-31',
    tags: [],
    item: null,
    linked_records: [],
    ...overrides,
  };
}

describe('record-form', () => {
  it('recordToFormState preserves empty content', () => {
    const form = recordToFormState(baseRecord({ content: '' }), items);
    expect(form.content).toBe('');
  });

  it('formStateToUpdatePayload allows empty content with item', () => {
    const record = baseRecord({ content: '' });
    const form = recordToFormState(record, items);
    const payload = formStateToUpdatePayload(form, record);
    expect(payload.content).toBe('');
    expect(payload.item_id).toBe('item-teto');
  });

  it('formStateToUpdatePayload sets time_anchor_date when recordDate changes', () => {
    const record = baseRecord({ date: '2026-05-31', time_anchor_date: '2026-05-31' });
    const form = recordToFormState(record, items);
    form.recordDate = '2026-06-01';
    const payload = formStateToUpdatePayload(form, record);
    expect(payload.time_anchor_date).toBe('2026-06-01');
  });

  it('buildCorrectionPayload detects tool_label change', () => {
    const record = baseRecord({ tool_label: null });
    const form = recordToFormState(record, items);
    form.toolLabel = 'Cursor';
    const payload = formStateToUpdatePayload(form, record);
    const diffs = buildCorrectionPayload(record, payload);
    expect(diffs.some((d) => d.field === 'tool_label')).toBe(true);
  });

  it('isLegacyRecordType identifies non-user types', () => {
    expect(isLegacyRecordType('回顾')).toBe(true);
    expect(isLegacyRecordType('发生')).toBe(false);
  });
});
