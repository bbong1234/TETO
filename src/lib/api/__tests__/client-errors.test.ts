import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, normalizeErrorMessage } from '../client-errors';

describe('getApiErrorMessage', () => {
  it('extracts message from structured API error', () => {
    const body = {
      ok: false,
      error: {
        errorCode: 'ERR-ITEM-001',
        message: '事项已处于搁置状态',
        details: [],
      },
    };
    expect(getApiErrorMessage(body, '失败')).toBe('事项已处于搁置状态');
  });

  it('supports legacy string error', () => {
    expect(getApiErrorMessage({ error: '旧格式错误' }, '失败')).toBe('旧格式错误');
  });

  it('normalizeErrorMessage handles object passed directly', () => {
    expect(
      normalizeErrorMessage({
        errorCode: 'ERR-X',
        message: '不能直接渲染对象',
      })
    ).toBe('不能直接渲染对象');
  });
});
