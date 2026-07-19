import { describe, expect, it } from 'vitest';
import { resolveDiaryCandidateOccurredAt, sortCandidatesForCreation } from '../diary-candidate-time';
import type { DiaryExtractCandidate } from '../diary-extract-records';
import type { Record as TetoRecord } from '@/types/teto';

function makeRecord(id: string, raw: string, occurredAt: string): TetoRecord {
  return {
    id,
    raw_input: raw,
    content: '',
    occurred_at: occurredAt,
  } as TetoRecord;
}

describe('diary-candidate-time', () => {
  it('anchors fuzzy candidate after referenced event', () => {
    const dayRecords = [makeRecord('r1', '20:30 接妹妹', '2026-07-19T20:30:00+08:00')];
    const candidate: DiaryExtractCandidate = {
      id: 'c1',
      sourceExcerpt: '晚上在家刷抖音',
      raw_input: '在家刷抖音',
      time_text: '晚上',
      time_precision: 'fuzzy',
      afterExcerpt: '接妹妹',
      sequence: 2,
      confidence: 0.8,
    };

    const resolved = resolveDiaryCandidateOccurredAt({
      candidate,
      anchorDate: '2026-07-19',
      dayRecords,
    });

    expect(resolved.time_precision).toBe('fuzzy');
    expect(resolved.time_text).toBe('晚上');
    expect(new Date(resolved.occurred_at).getTime()).toBeGreaterThan(
      new Date('2026-07-19T20:30:00+08:00').getTime()
    );
  });

  it('sortCandidatesForCreation orders by sequence', () => {
    const sorted = sortCandidatesForCreation([
      { id: 'b', sourceExcerpt: 'b', raw_input: 'b', sequence: 2, confidence: 1 },
      { id: 'a', sourceExcerpt: 'a', raw_input: 'a', sequence: 1, confidence: 1 },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
