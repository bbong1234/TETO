import { describe, expect, it } from 'vitest';
import {
  normalizeExtractCandidate,
  stripRedundantTimePrefix,
  stripTimePrefixFromText,
} from '../diary-time-normalize';

describe('diary-time-normalize', () => {
  it('strips leading fuzzy and clock prefixes from raw text', () => {
    expect(stripTimePrefixFromText('早上去了港源量玻璃')).toBe('去了港源量玻璃');
    expect(stripTimePrefixFromText('11点多在公司吃了烧鸭饭')).toBe('在公司吃了烧鸭饭');
    expect(stripTimePrefixFromText('20:30 晚上8点半去接妹妹')).toBe('8点半去接妹妹');
    expect(stripTimePrefixFromText('[09:30] 去了西湖')).toBe('去了西湖');
  });

  it('normalizeExtractCandidate separates time_text from raw_input', () => {
    const normalized = normalizeExtractCandidate({
      id: 'c1',
      sourceExcerpt: '早上去了港源量玻璃',
      raw_input: '早上去了港源量玻璃',
      time_text: '早上',
      confidence: 0.9,
    });

    expect(normalized.raw_input).toBe('去了港源量玻璃');
    expect(normalized.time_text).toBe('早上');
    expect(normalized.time_precision).toBe('fuzzy');
  });

  it('marks approx time for 11点多', () => {
    const normalized = normalizeExtractCandidate({
      id: 'c2',
      sourceExcerpt: '11点多吃了饭',
      raw_input: '11点多在公司吃了烧鸭饭',
      confidence: 0.8,
    });

    expect(normalized.raw_input).toBe('在公司吃了烧鸭饭');
    expect(normalized.time_text).toBe('11点多');
    expect(normalized.time_precision).toBe('approx');
  });

  it('stripRedundantTimePrefix removes duplicated time prefix in legacy summary', () => {
    expect(stripRedundantTimePrefix('早上去了港源量玻璃', '早上')).toBe('去了港源量玻璃');
    expect(stripRedundantTimePrefix('11点多在公司吃了烧鸭饭', '11点多')).toBe('在公司吃了烧鸭饭');
  });
});
