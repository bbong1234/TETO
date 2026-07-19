import { describe, it, expect } from 'vitest';
import { getWalletPeriodRanges, isDateInRange } from '../period-ranges';

describe('getWalletPeriodRanges', () => {
  it('returns today as a single day', () => {
    const ranges = getWalletPeriodRanges('2026-07-12');
    const today = ranges.find((r) => r.period === 'today');
    expect(today).toEqual({
      period: 'today',
      label: '今日',
      date_from: '2026-07-12',
      date_to: '2026-07-12',
    });
  });

  it('uses Monday as week start (Sunday reference)', () => {
    const ranges = getWalletPeriodRanges('2026-07-12');
    const week = ranges.find((r) => r.period === 'week');
    expect(week).toEqual({
      period: 'week',
      label: '本周',
      date_from: '2026-07-06',
      date_to: '2026-07-12',
    });
  });

  it('uses Monday as week start (Wednesday reference)', () => {
    const ranges = getWalletPeriodRanges('2026-07-08');
    const week = ranges.find((r) => r.period === 'week');
    expect(week?.date_from).toBe('2026-07-06');
    expect(week?.date_to).toBe('2026-07-12');
  });

  it('covers full calendar month', () => {
    const ranges = getWalletPeriodRanges('2026-07-15');
    const month = ranges.find((r) => r.period === 'month');
    expect(month).toEqual({
      period: 'month',
      label: '本月',
      date_from: '2026-07-01',
      date_to: '2026-07-31',
    });
  });

  it('covers full calendar year', () => {
    const ranges = getWalletPeriodRanges('2026-07-15');
    const year = ranges.find((r) => r.period === 'year');
    expect(year).toEqual({
      period: 'year',
      label: '本年',
      date_from: '2026-01-01',
      date_to: '2026-12-31',
    });
  });

  it('returns all four periods', () => {
    const ranges = getWalletPeriodRanges('2026-07-15');
    expect(ranges.map((r) => r.period)).toEqual(['today', 'week', 'month', 'year']);
  });
});

describe('isDateInRange', () => {
  it('includes boundary dates', () => {
    expect(isDateInRange('2026-07-06', '2026-07-06', '2026-07-12')).toBe(true);
    expect(isDateInRange('2026-07-12', '2026-07-06', '2026-07-12')).toBe(true);
  });

  it('excludes dates outside range', () => {
    expect(isDateInRange('2026-07-05', '2026-07-06', '2026-07-12')).toBe(false);
    expect(isDateInRange('2026-07-13', '2026-07-06', '2026-07-12')).toBe(false);
  });
});
