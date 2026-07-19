import { describe, expect, it } from 'vitest';
import type { Record as TetoRecord } from '@/types/teto';
import {
  appendPlainText,
  applyBodyEdit,
  normalizeLinkSurroundingSpaces,
  parseDiaryDocument,
  pruneLinksForMissingRecords,
  removeLinksForRecordIds,
  serializeDiaryDocument,
  updateLinkText,
} from '@/lib/activity/diary-document';

function makeRecord(id: string, raw: string, occurredAt?: string): TetoRecord {
  return {
    id,
    user_id: 'u1',
    record_day_id: 'day1',
    content: raw,
    type: '发生',
    occurred_at: occurredAt ?? null,
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
    raw_input: raw,
    time_anchor_date: '2026-07-18',
    linked_record_id: null,
    location: null,
    people: [],
    lifecycle_status: 'active',
    review_status: 'unchecked',
    input_source: 'quick',
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
    date: '2026-07-18',
    tags: [],
    item: null,
    linked_records: [],
  };
}

describe('diary-document v3', () => {
  it('parses legacy plain text into body with no links', () => {
    const doc = parseDiaryDocument('今天不错');
    expect(doc).toMatchObject({ version: 3, body: '今天不错', links: [] });
  });

  it('parses v1 json diary field', () => {
    const doc = parseDiaryDocument(JSON.stringify({ diary: '正文', contextNotes: '补充' }));
    expect(doc.body).toBe('正文');
    expect(doc.contextNotes).toBe('补充');
    expect(doc.links).toEqual([]);
  });

  it('migrates v2 blocks to body + links', () => {
    const doc = parseDiaryDocument(
      JSON.stringify({
        version: 2,
        contextNotes: '',
        blocks: [
          { type: 'text', id: 't1', text: '今天：' },
          { type: 'record', id: 'r1', recordId: 'rec-1', text: '吃了黄焖鸡' },
        ],
      })
    );
    expect(doc.version).toBe(3);
    expect(doc.body).toBe('今天：吃了黄焖鸡');
    expect(doc.links).toHaveLength(1);
    expect(doc.links[0]).toMatchObject({
      recordId: 'rec-1',
      start: '今天：'.length,
      end: '今天：吃了黄焖鸡'.length,
    });
  });

  it('round-trips v3 document', () => {
    const original = {
      version: 3 as const,
      body: '早上吃了汤包，中午吃了黄焖鸡。',
      links: [{ id: 'l1', recordId: 'rec-1', start: 0, end: 6 }],
      contextNotes: 'note',
    };
    const parsed = parseDiaryDocument(serializeDiaryDocument(original));
    expect(parsed).toEqual(original);
  });

  it('updateLinkText adjusts body and shifts trailing links', () => {
    const doc = {
      version: 3 as const,
      body: '早上吃了汤包，中午吃了黄焖鸡。',
      links: [
        { id: 'l1', recordId: 'rec-1', start: 0, end: 6 },
        { id: 'l2', recordId: 'rec-2', start: 7, end: 14 },
      ],
      contextNotes: '',
    };
    const updated = updateLinkText(doc, 'l1', '早上吃了小笼包');
    expect(updated?.body).toBe('早上吃了小笼包，中午吃了黄焖鸡。');
    expect(updated?.links[0]).toMatchObject({ start: 0, end: 7 });
    expect(updated?.links[1]).toMatchObject({ start: 8, end: 15 });
  });

  it('applyBodyEdit removes links inside edited range', () => {
    const doc = {
      version: 3 as const,
      body: 'abc linked def',
      links: [{ id: 'l1', recordId: 'rec-1', start: 4, end: 10 }],
      contextNotes: '',
    };
    const next = applyBodyEdit(doc, 0, doc.body.length, 'replaced');
    expect(next.body).toBe('replaced');
    expect(next.links).toEqual([]);
  });

  it('removeLinksForRecordIds keeps body text', () => {
    const doc = {
      version: 3 as const,
      body: '早上吃了汤包',
      links: [{ id: 'l1', recordId: 'rec-1', start: 0, end: 6 }],
      contextNotes: '',
    };
    const next = removeLinksForRecordIds(doc, new Set(['rec-1']));
    expect(next.body).toBe('早上吃了汤包');
    expect(next.links).toEqual([]);
  });

  it('pruneLinksForMissingRecords removes stale links', () => {
    const doc = {
      version: 3 as const,
      body: 'AB',
      links: [
        { id: 'l1', recordId: 'rec-1', start: 0, end: 1 },
        { id: 'l2', recordId: 'rec-2', start: 1, end: 2 },
      ],
      contextNotes: '',
    };
    const pruned = pruneLinksForMissingRecords(doc, [makeRecord('rec-1', 'A')]);
    expect(pruned.links).toHaveLength(1);
    expect(pruned.links[0].recordId).toBe('rec-1');
  });

  it('appendPlainText joins with Chinese comma', () => {
    expect(appendPlainText({ version: 3, body: '', links: [], contextNotes: '' }, '补充').body).toBe(
      '补充'
    );
    expect(
      appendPlainText({ version: 3, body: '已有', links: [], contextNotes: '' }, '补充').body
    ).toBe('已有，补充');
  });

  it('normalizeLinkSurroundingSpaces pads one space before and after each link', () => {
    const links = [{ id: 'l1', recordId: 'rec-1', start: 0, end: 4 }];
    const normalized = normalizeLinkSurroundingSpaces('法国法人', links);
    expect(normalized.body).toBe(' 法国法人 ');
    expect(normalized.links[0]).toMatchObject({ start: 1, end: 5 });
  });
});
