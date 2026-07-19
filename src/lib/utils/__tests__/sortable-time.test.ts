import { describe, expect, it } from 'vitest';
import { compareTimesDesc, toSortableTimeString } from '@/lib/utils/sortable-time';

describe('sortable-time', () => {
  it('normalizes Date and non-string values', () => {
    const d = new Date('2026-07-10T12:00:00.000Z');
    expect(toSortableTimeString(d)).toBe(d.toISOString());
    expect(() => compareTimesDesc(d, '2026-07-01')).not.toThrow();
  });

  it('sorts descending', () => {
    expect(compareTimesDesc('2026-07-01', '2026-07-10')).toBeGreaterThan(0);
    expect(compareTimesDesc('2026-07-10', '2026-07-01')).toBeLessThan(0);
  });
});
