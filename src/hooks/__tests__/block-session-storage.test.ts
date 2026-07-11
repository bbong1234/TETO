import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadStoredBlockSegments,
  saveStoredBlockSegments,
  clearStoredBlockSegments,
  loadLockedBlockCategory,
  saveLockedBlockCategory,
  clearLockedBlockCategory,
  type BlockTimelineSegment,
} from '../use-block-session-segments';

function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const g = globalThis as { window?: unknown; sessionStorage?: Storage };

beforeEach(() => {
  g.sessionStorage = createStorageStub();
  g.window = { sessionStorage: g.sessionStorage };
});

afterEach(() => {
  delete g.window;
  delete g.sessionStorage;
});

const segments: BlockTimelineSegment[] = [
  { label: '编程-公司系统开发', startMs: 1000, endMs: 2000 },
  { label: '⏸ 暂停', startMs: 2000, endMs: 3000 },
  { label: '编程-公司系统开发-方案报批', startMs: 3000, endMs: null },
];

describe('块时间段 sessionStorage 持久化', () => {
  it('保存后按 activityId 恢复', () => {
    saveStoredBlockSegments('act-1', segments);
    const stored = loadStoredBlockSegments();
    expect(stored).not.toBeNull();
    expect(stored!.activityId).toBe('act-1');
    expect(stored!.segments).toEqual(segments);
  });

  it('无存储时返回 null', () => {
    expect(loadStoredBlockSegments()).toBeNull();
  });

  it('损坏 JSON 返回 null', () => {
    g.sessionStorage!.setItem('teto_block_segments', '{not json');
    expect(loadStoredBlockSegments()).toBeNull();
  });

  it('段结构不合法时返回 null', () => {
    g.sessionStorage!.setItem(
      'teto_block_segments',
      JSON.stringify({ activityId: 'act-1', segments: [{ label: 1, startMs: 'x' }] })
    );
    expect(loadStoredBlockSegments()).toBeNull();
  });

  it('clear 后不再恢复', () => {
    saveStoredBlockSegments('act-1', segments);
    clearStoredBlockSegments();
    expect(loadStoredBlockSegments()).toBeNull();
  });
});

describe('块时间大类锁定 sessionStorage 持久化', () => {
  it('保存后可恢复', () => {
    saveLockedBlockCategory('cat-1');
    expect(loadLockedBlockCategory()).toBe('cat-1');
  });

  it('无存储时返回 null', () => {
    expect(loadLockedBlockCategory()).toBeNull();
  });

  it('clear 后返回 null', () => {
    saveLockedBlockCategory('cat-1');
    clearLockedBlockCategory();
    expect(loadLockedBlockCategory()).toBeNull();
  });
});
