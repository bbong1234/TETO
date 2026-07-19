import { describe, expect, it } from 'vitest';
import type { Record as TetoRecord } from '@/types/teto';
import {
  filterDuplicateCandidates,
  parseExtractRecordsResponse,
} from '../diary-extract-records';

describe('diary-extract-records', () => {
  it('parseExtractRecordsResponse parses JSON object with candidates', () => {
    const raw = JSON.stringify({
      candidates: [
        {
          id: 'c1',
          sourceExcerpt: '早上去了西湖',
          raw_input: '09:00 去了西湖',
          time_text: '09:00',
          time_precision: 'exact',
          location: '西湖',
          confidence: 0.9,
        },
      ],
    });

    const parsed = parseExtractRecordsResponse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'c1',
      raw_input: '去了西湖',
      time_text: '09:00',
      location: '西湖',
    });
  });

  it('parseExtractRecordsResponse normalizes duplicated time in raw_input', () => {
    const raw = JSON.stringify({
      candidates: [
        {
          id: 'c2',
          sourceExcerpt: '早上去了港源量玻璃',
          raw_input: '早上去了港源量玻璃',
          time_text: '早上',
          confidence: 0.9,
        },
      ],
    });

    const parsed = parseExtractRecordsResponse(raw);
    expect(parsed[0].raw_input).toBe('去了港源量玻璃');
    expect(parsed[0].time_text).toBe('早上');
    expect(parsed[0].time_precision).toBe('fuzzy');
  });

  it('parseExtractRecordsResponse returns empty on invalid JSON', () => {
    expect(parseExtractRecordsResponse('not json')).toEqual([]);
  });

  it('filterDuplicateCandidates marks similar existing records as skipped', () => {
    const dayRecords = [
      {
        id: 'r1',
        raw_input: '09:00 去了西湖',
        content: '',
      } as TetoRecord,
    ];

    const filtered = filterDuplicateCandidates(
      [
        {
          id: 'c1',
          sourceExcerpt: '早上去了西湖',
          raw_input: '09:00 去了西湖',
          confidence: 0.9,
        },
      ],
      dayRecords
    );

    expect(filtered[0].skipReason).toBe('与时间线已有记录相似');
  });

  it('filterDuplicateCandidates keeps novel candidates', () => {
    const filtered = filterDuplicateCandidates(
      [
        {
          id: 'c1',
          sourceExcerpt: '下午去了图书馆',
          raw_input: '15:00 去了图书馆',
          confidence: 0.85,
        },
      ],
      []
    );

    expect(filtered[0].skipReason).toBeUndefined();
  });
});
