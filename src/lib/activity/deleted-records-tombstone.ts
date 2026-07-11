const STORAGE_KEY = 'teto:deleted-record-ids';

export function loadDeletedRecordTombstones(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

export function persistDeletedRecordTombstones(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    if (ids.size === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

export function addDeletedRecordTombstone(
  ids: Set<string>,
  id: string
): Set<string> {
  ids.add(id);
  persistDeletedRecordTombstones(ids);
  return ids;
}

export function removeDeletedRecordTombstone(
  ids: Set<string>,
  id: string
): Set<string> {
  ids.delete(id);
  persistDeletedRecordTombstones(ids);
  return ids;
}
