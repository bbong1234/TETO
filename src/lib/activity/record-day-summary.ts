import type { Record as TetoRecord } from '@/types/teto';

export interface DiarySummaryPayload {
  diary: string;
  contextNotes: string;
}

export function parseDiarySummary(raw: string | null | undefined): DiarySummaryPayload {
  if (!raw?.trim()) return { diary: '', contextNotes: '' };
  try {
    const parsed = JSON.parse(raw) as Partial<DiarySummaryPayload>;
    if (parsed && typeof parsed === 'object' && 'diary' in parsed) {
      return {
        diary: typeof parsed.diary === 'string' ? parsed.diary : '',
        contextNotes: typeof parsed.contextNotes === 'string' ? parsed.contextNotes : '',
      };
    }
  } catch {
    /* legacy plain text */
  }
  return { diary: raw, contextNotes: '' };
}

export function serializeDiarySummary(payload: DiarySummaryPayload): string {
  if (!payload.contextNotes.trim()) return payload.diary;
  return JSON.stringify({
    diary: payload.diary,
    contextNotes: payload.contextNotes,
  });
}

export function isDraftRecordId(id: string): boolean {
  return id.startsWith('draft:');
}

export function createDraftRecord(date: string): TetoRecord {
  const now = new Date().toISOString();
  const draftId = `draft:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: draftId,
    user_id: '',
    record_day_id: '',
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
    raw_input: '',
    time_anchor_date: date,
    linked_record_id: null,
    location: null,
    people: [],
    lifecycle_status: 'completed',
    review_status: 'unchecked',
    input_source: 'manual',
    created_at: now,
    updated_at: now,
    date,
    tags: [],
    item: null,
    linked_records: [],
  };
}
