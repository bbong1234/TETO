import { describe, expect, it } from 'vitest';
import type { Record as TetoRecord } from '@/types/teto';
import {
  buildBodySegments,
  importRecordsIntoDiary,
  matchLinksInBody,
  phraseForRecord,
} from '@/lib/activity/diary-link-matcher';

function makeRecord(id: string, raw: string, occurredAt: string): TetoRecord {
  return {
    id,
    user_id: 'u1',
    record_day_id: 'day1',
    content: raw,
    type: '发生',
    occurred_at: occurredAt,
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
    created_at: occurredAt,
    updated_at: occurredAt,
    date: '2026-07-18',
    tags: [],
    item: null,
    linked_records: [],
  };
}

describe('diary-link-matcher', () => {
  it('phraseForRecord strips clock prefix', () => {
    const record = makeRecord('rec-1', '9:00 吃了汤包', '2026-07-18T09:00:00Z');
    expect(phraseForRecord(record)).toBe('吃了汤包');
  });

  it('importRecordsIntoDiary builds draft from empty body', () => {
    const records = [
      makeRecord('rec-1', '9:00 吃了汤包', '2026-07-18T09:00:00Z'),
      makeRecord('rec-2', '12:00 吃了黄焖鸡', '2026-07-18T12:00:00Z'),
    ];
    const { document, added } = importRecordsIntoDiary(
      { version: 3, body: '', links: [], contextNotes: '' },
      records
    );
    expect(added).toBe(2);
    expect(document.body).toBe(' 吃了汤包 ， 吃了黄焖鸡 。');
    expect(document.links).toHaveLength(2);
    expect(document.body.slice(document.links[0].start, document.links[0].end)).toBe('吃了汤包');
    expect(document.body.slice(document.links[1].start, document.links[1].end)).toBe('吃了黄焖鸡');
    expect(document.body[document.links[0].start - 1]).toBe(' ');
    expect(document.body[document.links[0].end]).toBe(' ');
  });

  it('matchLinksInBody links existing phrases in body', () => {
    const body = '早上吃了汤包，中午吃了黄焖鸡，晚上没吃。';
    const records = [
      makeRecord('rec-1', '9:00 早上吃了汤包', '2026-07-18T09:00:00Z'),
      makeRecord('rec-2', '12:00 中午吃了黄焖鸡', '2026-07-18T12:00:00Z'),
    ];
    const links = matchLinksInBody(body, records, []);
    expect(links).toHaveLength(2);
    expect(body.slice(links[0].start, links[0].end)).toContain('汤包');
    expect(body.slice(links[1].start, links[1].end)).toContain('黄焖鸡');
    expect(links[0].recordId).toBe('rec-1');
    expect(links[1].recordId).toBe('rec-2');
  });

  it('importRecordsIntoDiary appends unmatched records only', () => {
    const body = '早上吃了汤包，中午吃了黄焖鸡，晚上没吃。';
    const records = [
      makeRecord('rec-1', '9:00 早上吃了汤包', '2026-07-18T09:00:00Z'),
      makeRecord('rec-2', '12:00 中午吃了黄焖鸡', '2026-07-18T12:00:00Z'),
      makeRecord('rec-3', '18:00 跑步', '2026-07-18T18:00:00Z'),
    ];
    const { document, added } = importRecordsIntoDiary(
      { version: 3, body, links: [], contextNotes: '' },
      records
    );
    expect(added).toBe(3);
    expect(document.links).toHaveLength(3);
    expect(document.body).toContain('跑步');
    expect(document.body).toContain('早上吃了汤包');
    expect(document.body).toContain('中午吃了黄焖鸡');
    for (const link of document.links) {
      expect(document.body[link.start - 1]).toBe(' ');
      expect(document.body[link.end]).toBe(' ');
    }
  });

  it('buildBodySegments splits plain and link spans', () => {
    const body = '早上吃了汤包，晚上没吃。';
    const links = [{ id: 'l1', recordId: 'rec-1', start: 0, end: 6 }];
    const segments = buildBodySegments(body, links);
    expect(segments).toEqual([
      { type: 'link', text: '早上吃了汤包', link: links[0] },
      { type: 'plain', text: '，晚上没吃。' },
    ]);
  });
});
