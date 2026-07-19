import { describe, expect, it } from 'vitest';
import { parseQuickCreateHints } from '../quick-create-parser';

describe('parseQuickCreateHints', () => {
  it('extracts spending and body state from a quick note', () => {
    expect(parseQuickCreateHints('早上9点吃早饭花了30块，有点累')).toMatchObject({
      cost: 30,
      moneyDirection: 'expense',
      bodyState: '累',
      timePrecision: 'exact',
    });
  });

  it('extracts a fuzzy time and body state without inventing other fields', () => {
    expect(parseQuickCreateHints('我有些累')).toEqual({ bodyState: '累' });
    expect(parseQuickCreateHints('早上学习英语')).toMatchObject({
      timePrecision: 'fuzzy',
    });
  });

  it('marks explicit income language as income', () => {
    expect(parseQuickCreateHints('收到报销200元')).toMatchObject({
      cost: 200,
      moneyDirection: 'income',
    });
  });
});
