import { describe, expect, it } from 'vitest';
import { inferTimeFromText, inferTimeRangeFromText, resolveTemporalFields } from '../record-unit-mapper';

describe('inferTimeFromText', () => {
  it('parses 9点 and 早上9点', () => {
    expect(inferTimeFromText('早上9点吃早饭')).toEqual({ hour: 9, minute: 0 });
    expect(inferTimeFromText('9:30')).toEqual({ hour: 9, minute: 30 });
  });

  it('parses 9am', () => {
    expect(inferTimeFromText('9am breakfast')).toEqual({ hour: 9, minute: 0 });
  });

  it('does not treat money as clock time', () => {
    expect(inferTimeFromText('吃早饭花了9块')).toBeNull();
  });

  it('parses explicit time ranges', () => {
    expect(inferTimeRangeFromText('早上7-10点学习英语')).toEqual({
      start: { hour: 7, minute: 0 },
      end: { hour: 10, minute: 0 },
    });
  });
});

describe('resolveTemporalFields', () => {
  it('defaults anchor to today when clock time without date keyword', () => {
    const r = resolveTemporalFields('2026-07-05', '发生', {
      time_text: '早上9点吃早饭花了30块',
    });
    expect(r.anchorDate).toBe('2026-07-05');
    expect(r.occurredAt).toBe('2026-07-05T09:00:00+08:00');
  });

  it('uses relative date when time text includes yesterday', () => {
    const r = resolveTemporalFields('2026-07-05', '发生', {
      time_text: '昨天早上9点吃早饭',
    });
    expect(r.anchorDate).toBe('2026-07-04');
    expect(r.occurredAt).toBe('2026-07-04T09:00:00+08:00');
  });

  it('uses an explicit time range for start and end', () => {
    const r = resolveTemporalFields('2026-07-05', '发生', {
      time_text: '早上7-10点学习英语',
    });
    expect(r.occurredAt).toBe('2026-07-05T07:00:00+08:00');
    expect(r.occurredAtEnd).toBe('2026-07-05T10:00:00+08:00');
  });
});
