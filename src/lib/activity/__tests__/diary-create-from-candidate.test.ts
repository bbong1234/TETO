import { describe, expect, it } from 'vitest';
import { buildRecordPayloadFromCandidate } from '../diary-create-from-candidate';
import type { DiaryExtractCandidate } from '../diary-extract-records';

describe('diary-create-from-candidate', () => {
  it('builds occurred record from morning travel candidate', () => {
    const candidate: DiaryExtractCandidate = {
      id: 'c1',
      sourceExcerpt: '早上去了西湖',
      raw_input: '去了西湖',
      time_text: '09:00',
      time_precision: 'exact',
      location: '西湖',
      confidence: 0.9,
    };

    const payload = buildRecordPayloadFromCandidate({
      candidate,
      anchorDate: '2026-07-19',
      items: [],
      tags: [],
      userRules: [],
    });

    expect(payload.type).toBe('发生');
    expect(payload.raw_input).toBe('去了西湖');
    expect(payload.time_text).toBe('09:00');
    expect(payload.location).toBe('西湖');
    expect(payload.input_source).toBe('ai');
    expect(new Date(payload.occurred_at ?? '').getHours()).toBe(9);
  });

  it('builds fuzzy payload without time prefix in raw_input', () => {
    const candidate: DiaryExtractCandidate = {
      id: 'c2',
      sourceExcerpt: '早上去了港源量玻璃',
      raw_input: '早上去了港源量玻璃',
      time_text: '早上',
      time_precision: 'fuzzy',
      confidence: 0.9,
    };

    const payload = buildRecordPayloadFromCandidate({
      candidate,
      anchorDate: '2026-07-19',
      items: [],
      tags: [],
      userRules: [],
    });

    expect(payload.raw_input).toBe('去了港源量玻璃');
    expect(payload.time_text).toBe('早上');
    expect(payload.time_precision).toBe('fuzzy');
  });

  it('does not include action_text from attribution heuristics', () => {
    const payload = buildRecordPayloadFromCandidate({
      candidate: {
        id: 'c3',
        sourceExcerpt: '在公司吃了烧鸭饭',
        raw_input: '在公司吃了烧鸭饭',
        time_text: '11:00',
        time_precision: 'exact',
        confidence: 0.9,
      },
      anchorDate: '2026-07-18',
      items: [],
      tags: [{ id: 'tag-lunch', name: '吃午饭', type: 'function' } as never],
      userRules: [],
    });

    expect(payload.action_text).toBeUndefined();
    expect(payload.date).toBe('2026-07-18');
  });
});
