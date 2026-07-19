import { describe, expect, it } from 'vitest';
import {
  createDraftRecord,
  isDraftRecordId,
  parseDiarySummary,
  serializeDiarySummary,
} from '@/lib/activity/record-day-summary';

describe('record-day-summary', () => {
  it('parses legacy and json diary summaries', () => {
    expect(parseDiarySummary('今天不错')).toEqual({ diary: '今天不错', contextNotes: '' });
    expect(parseDiarySummary(JSON.stringify({ diary: '正文', contextNotes: '补充' }))).toEqual({
      diary: '正文',
      contextNotes: '补充',
    });
    expect(serializeDiarySummary({ diary: '正文', contextNotes: '补充' })).toBe(
      JSON.stringify({ diary: '正文', contextNotes: '补充' })
    );
    expect(serializeDiarySummary({ diary: '正文', contextNotes: '' })).toBe('正文');
  });

  it('identifies draft record ids', () => {
    expect(isDraftRecordId('draft:123')).toBe(true);
    expect(isDraftRecordId('record-1')).toBe(false);
  });

  it('creates draft records for a given date', () => {
    const draft = createDraftRecord('2026-07-12');
    expect(isDraftRecordId(draft.id)).toBe(true);
    expect(draft.date).toBe('2026-07-12');
    expect(draft.time_anchor_date).toBe('2026-07-12');
    expect(draft.type).toBe('发生');
  });
});
