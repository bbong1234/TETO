import { describe, expect, it } from 'vitest';
import { formatRecordDisplayNo } from '@/lib/activity/format-record-display-no';
import type { Record } from '@/types/teto';

describe('formatRecordDisplayNo', () => {
  it('uses display_no when present', () => {
    const record = {
      display_no: '202601020003',
      sort_order: 1,
      time_anchor_date: '2026-01-02',
    } as Record;
    expect(formatRecordDisplayNo(record)).toBe('202601020003');
  });

  it('falls back to date + sort_order', () => {
    const record = {
      display_no: null,
      sort_order: 7,
      time_anchor_date: '2026-01-02',
    } as Record;
    expect(formatRecordDisplayNo(record)).toBe('202601020007');
  });
});
