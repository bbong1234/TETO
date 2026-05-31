import type { CreateRecordPayload, Item, Record } from '@/types/teto';
import { sortRecords } from '@/lib/activity/sort-records';

export interface ActivitySwitchPayload {
  record: Record | null;
  stopped: Record[];
}

export function isOptimisticRecordId(id: string): boolean {
  return id.startsWith('optimistic-');
}

function isActiveOccurrence(record: Record): boolean {
  return record.type === '发生' && record.lifecycle_status === 'active' && !record.occurred_at_end;
}

function stripOptimisticRecords(records: Record[]): Record[] {
  return records.filter((r) => !isOptimisticRecordId(r.id));
}

function stripActiveOccurrences(records: Record[]): Record[] {
  return records.filter((r) => !isActiveOccurrence(r));
}

export function enrichRecord(
  record: Record,
  items: Item[],
  fallbackDate: string
): Record {
  const enriched = { ...record };
  if (enriched.item_id && !enriched.item) {
    const item = items.find((i) => i.id === enriched.item_id);
    if (item) enriched.item = { id: item.id, title: item.title };
  }
  if (!enriched.date) enriched.date = fallbackDate;
  return enriched;
}

/** 将 switch/stop 结果合并进列表，避免全量 bootstrap */
export function mergeSwitchIntoRecords(
  prev: Record[],
  data: ActivitySwitchPayload,
  items: Item[],
  fallbackDate: string
): Record[] {
  let next = [...prev];
  for (const stopped of data.stopped) {
    if (isOptimisticRecordId(stopped.id)) continue;
    const idx = next.findIndex((r) => r.id === stopped.id);
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...stopped, lifecycle_status: 'completed' };
    } else {
      next.push(stopped);
    }
  }
  if (data.record) {
    const enriched = enrichRecord(data.record, items, fallbackDate);
    const replacingOptimistic = isOptimisticRecordId(enriched.id);
    next = stripOptimisticRecords(next);
    if (!replacingOptimistic) {
      next = stripActiveOccurrences(next);
    }
    next = next.filter((r) => r.id !== enriched.id);
    next.unshift(enriched);
  } else if (data.stopped.length > 0) {
    next = stripOptimisticRecords(next);
  }
  return sortRecords(next);
}

/** 单条记录更新后合并进列表 */
export function mergeRecordUpdated(
  prev: Record[],
  updated: Record,
  items: Item[],
  fallbackDate: string
): Record[] {
  const enriched = enrichRecord(updated, items, fallbackDate);
  const idx = prev.findIndex((r) => r.id === enriched.id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = enriched;
    return sortRecords(next);
  }
  return sortRecords([enriched, ...prev]);
}

/** 删除记录后从列表移除 */
export function mergeRecordDeleted(prev: Record[], id: string): Record[] {
  return prev.filter((r) => r.id !== id);
}

export function buildOptimisticActiveRecord(params: {
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  items: Item[];
  date: string;
}): Record {
  const now = new Date().toISOString();
  const item = params.item_id ? params.items.find((i) => i.id === params.item_id) : null;
  return {
    id: `optimistic-${now}`,
    user_id: 'pending',
    record_day_id: `pending:${params.date}`,
    content: params.content?.trim() ?? '',
    type: '发生',
    occurred_at: now,
    occurred_at_end: null,
    lifecycle_status: 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: params.item_id ?? null,
    phase_id: params.phase_id ?? null,
    sub_item_id: params.sub_item_id ?? null,
    sort_order: 0,
    is_starred: false,
    cost: null,
    metric_value: null,
    metric_unit: null,
    metric_name: null,
    duration_minutes: null,
    raw_input: null,
    parsed_semantic: null,
    time_anchor_date: params.date,
    linked_record_id: null,
    location: null,
    people: [],
    batch_id: null,
    input_id: null,
    parent_input_id: null,
    review_status: 'confirmed',
    confidence_level: null,
    input_source: 'manual',
    tool_label: params.tool_label?.trim() || null,
    created_at: now,
    updated_at: now,
    date: params.date,
    tags: [],
    item: item ? { id: item.id, title: item.title } : null,
    linked_records: [],
  };
}

export function buildOptimisticManualRecord(payload: CreateRecordPayload, items: Item[]): Record {
  const recordType = payload.type ?? '发生';
  const now = new Date().toISOString();
  const item = payload.item_id ? items.find((i) => i.id === payload.item_id) : null;
  return {
    id: `optimistic-${now}`,
    user_id: 'pending',
    record_day_id: `pending:${payload.date}`,
    content: payload.content,
    type: recordType,
    occurred_at: recordType === '发生' ? now : null,
    occurred_at_end: null,
    lifecycle_status: payload.lifecycle_status ?? 'active',
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: payload.item_id ?? null,
    phase_id: payload.phase_id ?? null,
    sub_item_id: payload.sub_item_id ?? null,
    sort_order: 0,
    is_starred: false,
    cost: null,
    metric_value: null,
    metric_unit: null,
    metric_name: null,
    duration_minutes: null,
    raw_input: null,
    parsed_semantic: null,
    time_anchor_date: payload.time_anchor_date ?? payload.date,
    linked_record_id: null,
    location: null,
    people: [],
    batch_id: null,
    input_id: null,
    parent_input_id: null,
    review_status: 'confirmed',
    confidence_level: null,
    input_source: 'manual',
    tool_label: payload.tool_label?.trim() || null,
    created_at: now,
    updated_at: now,
    date: payload.date,
    tags: [],
    item: item ? { id: item.id, title: item.title } : null,
    linked_records: [],
  };
}

/** 用服务端结果替换 optimistic 占位记录 */
export function replaceOptimisticRecord(
  prev: Record[],
  serverRecord: Record,
  items: Item[],
  fallbackDate: string
): Record[] {
  const enriched = enrichRecord(serverRecord, items, fallbackDate);
  const withoutPlaceholder = prev.filter(
    (r) => !r.id.startsWith('optimistic-') && r.id !== enriched.id
  );
  return sortRecords([enriched, ...withoutPlaceholder]);
}
