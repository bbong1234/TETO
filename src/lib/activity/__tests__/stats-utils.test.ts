import { describe, expect, it } from 'vitest';
import { formatElapsedClock, formatTimelineDuration } from '@/lib/activity/stats-utils';

describe('formatTimelineDuration', () => {
  it('formats seconds only', () => {
    expect(formatTimelineDuration(5)).toBe('5秒');
    expect(formatTimelineDuration(59)).toBe('59秒');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimelineDuration(60)).toBe('1分0秒');
    expect(formatTimelineDuration(90)).toBe('1分30秒');
    expect(formatTimelineDuration(3599)).toBe('59分59秒');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatTimelineDuration(3600)).toBe('1小时0分钟0秒');
    expect(formatTimelineDuration(3661)).toBe('1小时1分钟1秒');
  });
});

describe('formatElapsedClock', () => {
  it('formats zero', () => {
    expect(formatElapsedClock(0)).toBe('00:00');
  });

  it('formats minutes and seconds under one hour', () => {
    expect(formatElapsedClock(332)).toBe('05:32');
    expect(formatElapsedClock(59)).toBe('00:59');
  });

  it('formats hours with H:MM:SS', () => {
    expect(formatElapsedClock(3661)).toBe('1:01:01');
    expect(formatElapsedClock(3600)).toBe('1:00:00');
  });

  it('clamps negative values to zero', () => {
    expect(formatElapsedClock(-10)).toBe('00:00');
  });
});
