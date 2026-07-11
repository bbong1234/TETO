import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadDeletedRecordTombstones,
  persistDeletedRecordTombstones,
  addDeletedRecordTombstone,
  removeDeletedRecordTombstone,
} from '@/lib/activity/deleted-records-tombstone';

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

describe('deleted-records-tombstone', () => {
  it('persists and loads tombstones across session', () => {
    const ids = new Set<string>();
    addDeletedRecordTombstone(ids, 'a');
    addDeletedRecordTombstone(ids, 'b');
    expect(loadDeletedRecordTombstones()).toEqual(new Set(['a', 'b']));
  });

  it('removes tombstone when delete failed', () => {
    const ids = loadDeletedRecordTombstones();
    addDeletedRecordTombstone(ids, 'x');
    removeDeletedRecordTombstone(ids, 'x');
    expect(loadDeletedRecordTombstones().size).toBe(0);
  });

  it('clears storage when empty', () => {
    persistDeletedRecordTombstones(new Set(['z']));
    persistDeletedRecordTombstones(new Set());
    expect(g.sessionStorage!.getItem('teto:deleted-record-ids')).toBeNull();
  });
});
