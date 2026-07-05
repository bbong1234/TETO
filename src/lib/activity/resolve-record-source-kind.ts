import type { Record as TetoRecord } from '@/types/teto';

export type RecordSourceKind = 'quicknote' | 'blocktime';

/** 块时间：有 session 或 activity_events；否则为随手记 */
export function resolveRecordSourceKind(record: TetoRecord): RecordSourceKind {
  if (record.session_state) return 'blocktime';
  if (record.activity_events && record.activity_events.length > 0) return 'blocktime';
  return 'quicknote';
}
