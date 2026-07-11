import type { CreateRecordPayload, Item, Record, Tag } from '@/types/teto';
import { sortRecords } from '@/lib/activity/sort-records';
import { calcNetDurationMinutes } from '@/lib/activity/session-utils';

export interface ActivitySwitchPayload {
  record: Record | null;
  stopped: Record[];
  /** 块内切换撤销：从列表移除的新记录 id */
  undoDeleteId?: string;
}

export type SessionActionKind = 'pause' | 'resume' | 'enter-nested' | 'exit-nested';

export interface SessionActionPayload {
  record: Record | null;
  child?: Record | null;
  /** 触发本次回调的会话动作，供 UI（如块时间轴）区分处理 */
  action?: SessionActionKind;
  /** 服务端确认同步：跳过块时间轴段落变更 */
  syncOnly?: boolean;
}

/** 客户端乐观停止：补齐结束时间与 completed 状态 */
export function buildStoppedSnapshot(activity: Record, endTime = new Date().toISOString()): Record {
  const recordForDuration = {
    ...activity,
    occurred_at_end: endTime,
    paused_at: null,
  };
  const duration =
    activity.occurred_at != null
      ? calcNetDurationMinutes(recordForDuration, endTime)
      : null;
  return {
    ...activity,
    occurred_at_end: endTime,
    duration_minutes: duration,
    lifecycle_status: 'completed',
    session_state: 'running',
    paused_at: null,
  };
}

export function isOptimisticRecordId(id: string): boolean {
  return id.startsWith('optimistic-');
}

/** 块时间停止拆段时的乐观占位 id */
export function isOptimisticBlockSegmentId(id: string): boolean {
  return id.startsWith('optimistic-block-seg-');
}

/** 进行中的「发生」计时记录（未结束） */
export function isActiveTimingRecord(record: Record | null | undefined): boolean {
  return Boolean(
    record &&
      record.type === '发生' &&
      record.lifecycle_status === 'active' &&
      !record.occurred_at_end
  );
}

/**
 * PATCH / 同步时保留计时锚点，避免 item_id 等字段更新后 occurred_at 丢失导致计时停住。
 * 支持 optimistic id → 服务端 id 的同一会话迁移。
 */
export function preserveActiveTimingSnapshot(
  incoming: Record,
  baseline: Record | null | undefined
): Record {
  if (!baseline?.occurred_at || baseline.occurred_at_end) return incoming;
  const sameSession =
    incoming.id === baseline.id ||
    isOptimisticRecordId(baseline.id) ||
    (isActiveTimingRecord(baseline) && isActiveTimingRecord(incoming));
  if (!sameSession) return incoming;

  const keepBaselineAnchor =
    isActiveTimingRecord(baseline) && !baseline.occurred_at_end && !incoming.occurred_at_end;
  const occurredAt = keepBaselineAnchor
    ? baseline.occurred_at
    : incoming.occurred_at ?? baseline.occurred_at;
  const occurredAtEnd = incoming.occurred_at_end ?? null;

  return {
    ...incoming,
    occurred_at: occurredAt,
    occurred_at_end: occurredAtEnd,
    lifecycle_status: occurredAtEnd ? incoming.lifecycle_status : 'active',
    session_state: incoming.session_state ?? baseline.session_state ?? 'running',
    paused_at: incoming.paused_at !== undefined ? incoming.paused_at : baseline.paused_at ?? null,
    paused_total_seconds: incoming.paused_total_seconds ?? baseline.paused_total_seconds ?? 0,
    duration_minutes: occurredAtEnd ? incoming.duration_minutes : null,
  };
}

function isActiveOccurrence(record: Record): boolean {
  return record.type === '发生' && record.lifecycle_status === 'active' && !record.occurred_at_end;
}

function stripOptimisticActiveRecords(records: Record[]): Record[] {
  return records.filter((r) => !(isOptimisticRecordId(r.id) && isActiveOccurrence(r)));
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

  const settlingBlockStop =
    !data.record &&
    data.stopped.length > 0 &&
    data.stopped.some((s) => !isOptimisticBlockSegmentId(s.id));

  if (settlingBlockStop) {
    const optimisticSegs = next.filter((r) => isOptimisticBlockSegmentId(r.id));
    const serverStopped = data.stopped.filter((s) => !isOptimisticBlockSegmentId(s.id));
    if (optimisticSegs.length > 0 && serverStopped.length > 0) {
      const usedServerIds = new Set<string>();
      next = next.map((r) => {
        if (!isOptimisticBlockSegmentId(r.id)) return r;
        const match = serverStopped.find(
          (s) =>
            !usedServerIds.has(s.id) &&
            (s.occurred_at ?? '') === (r.occurred_at ?? '')
        );
        if (!match) return r;
        usedServerIds.add(match.id);
        return enrichRecord(
          { ...match, lifecycle_status: 'completed' as const },
          items,
          fallbackDate
        );
      });
    }
    next = next.filter((r) => !isOptimisticBlockSegmentId(r.id));
  }

  for (const stopped of data.stopped) {
    const completed = enrichRecord(
      { ...stopped, lifecycle_status: 'completed' as const },
      items,
      fallbackDate
    );
    const idx = next.findIndex((r) => r.id === stopped.id);
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...completed };
    } else {
      next.push(completed);
    }
  }
  if (data.record) {
    const enriched = enrichRecord(data.record, items, fallbackDate);
    const replacingOptimistic = isOptimisticRecordId(enriched.id);
    next = stripOptimisticActiveRecords(next);
    if (!replacingOptimistic) {
      next = stripActiveOccurrences(next);
    }
    next = next.filter((r) => r.id !== enriched.id);
    next.unshift(enriched);
  } else {
    next = stripOptimisticActiveRecords(next);
    next = stripActiveOccurrences(next);
  }
  return sortRecords(next);
}

/** 块内切换撤销：删除误切换的新记录，恢复上一轮进行中的记录 */
export function buildRestoredActiveSnapshot(activity: Record): Record {
  return {
    ...activity,
    lifecycle_status: 'active',
    occurred_at_end: null,
    duration_minutes: null,
    session_state: activity.session_state ?? 'running',
  };
}

export function mergeSwitchUndoIntoRecords(
  prev: Record[],
  restored: Record,
  deletedNewId: string,
  items: Item[],
  fallbackDate: string
): Record[] {
  const enriched = enrichRecord(restored, items, fallbackDate);
  let next = prev.filter((r) => r.id !== deletedNewId);
  next = stripOptimisticActiveRecords(next);
  next = stripActiveOccurrences(next);
  const idx = next.findIndex((r) => r.id === enriched.id);
  if (idx >= 0) {
    next[idx] = enriched;
  } else {
    next.unshift(enriched);
  }
  return sortRecords(next);
}

/** 暂停/恢复/嵌套打断后合并记录列表 */
export function mergeSessionActionIntoRecords(
  prev: Record[],
  data: SessionActionPayload,
  items: Item[],
  fallbackDate: string
): Record[] {
  let next = prev;
  if (data.child) {
    next = mergeRecordUpdated(next, data.child, items, fallbackDate);
  }
  if (data.record) {
    next = mergeRecordUpdated(next, data.record, items, fallbackDate);
  }
  return next;
}

/** 单条记录更新后合并进列表 */
export function mergeRecordUpdated(
  prev: Record[],
  updated: Record,
  items: Item[],
  fallbackDate: string
): Record[] {
  const enriched = enrichRecord(updated, items, fallbackDate);
  let idx = prev.findIndex((r) => r.id === enriched.id);
  if (idx < 0 && isActiveTimingRecord(enriched)) {
    idx = prev.findIndex((r) => isActiveTimingRecord(r) && !r.occurred_at_end);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = {
        ...enriched,
        id: prev[idx].id,
        occurred_at: prev[idx].occurred_at ?? enriched.occurred_at,
      };
      return sortRecords(next);
    }
  }
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = enriched;
    return sortRecords(next);
  }
  return sortRecords([enriched, ...prev]);
}

/** 时间线展示：用进行中的 currentActivity 覆盖列表里对应记录的归属/动作字段 */
export function overlayCurrentActivityOnRecords(
  records: Record[],
  currentActivity: Record | null | undefined
): Record[] {
  if (!currentActivity || !isActiveTimingRecord(currentActivity)) return records;

  const byId = records.findIndex((r) => r.id === currentActivity.id);
  if (byId >= 0) {
    const base = records[byId];
    const merged: Record = {
      ...base,
      item_id: currentActivity.item_id,
      sub_item_id: currentActivity.sub_item_id,
      action_text: currentActivity.action_text,
      content: currentActivity.content,
      tags: currentActivity.tags ?? base.tags,
      item: currentActivity.item ?? base.item,
      tool_label: currentActivity.tool_label ?? base.tool_label,
    };
    const next = [...records];
    next[byId] = merged;
    return next;
  }

  const activeIdx = records.findIndex(
    (r) => isActiveTimingRecord(r) && !r.occurred_at_end
  );
  if (activeIdx >= 0) {
    const base = records[activeIdx];
    const next = [...records];
    next[activeIdx] = {
      ...base,
      item_id: currentActivity.item_id ?? base.item_id,
      sub_item_id: currentActivity.sub_item_id ?? base.sub_item_id,
      action_text: currentActivity.action_text ?? base.action_text,
      content: currentActivity.content ?? base.content,
      tags: currentActivity.tags ?? base.tags,
      item: currentActivity.item ?? base.item,
      tool_label: currentActivity.tool_label ?? base.tool_label,
    };
    return next;
  }

  return [currentActivity, ...records];
}

/** 删除记录后从列表移除 */
export function mergeRecordDeleted(prev: Record[], id: string): Record[] {
  return prev.filter((r) => r.id !== id);
}

/**
 * 删除/更新前解析客户端 record id：optimistic 占位符尝试映射到服务端 id。
 * 无法解析时返回原 id（调用方可对 optimistic 做本地移除或对 404 做 ghost 清理）。
 */
export async function resolveClientRecordId(record: Record): Promise<string> {
  if (!isOptimisticRecordId(record.id)) return record.id;

  const { resolveActivityRecordIdClient } = await import(
    '@/lib/activity/activity-switch-pending'
  );

  if (record.type === '发生' && record.lifecycle_status === 'active' && !record.occurred_at_end) {
    const activeId = await resolveActivityRecordIdClient(record);
    if (activeId) return activeId;
  }

  if (record.occurred_at) {
    try {
      const res = await fetch('/api/v2/activities/current');
      const data = await res.json();
      const current = data.data as Record | null;
      if (
        current?.id &&
        !isOptimisticRecordId(current.id) &&
        current.occurred_at === record.occurred_at &&
        (current.content === record.content || current.item_id === record.item_id)
      ) {
        return current.id;
      }
    } catch {
      /* ignore */
    }
  }

  return record.id;
}

export function buildOptimisticActiveRecord(params: {
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
  action_text?: string | null;
  tags?: Tag[];
  items: Item[];
  date: string;
  start_paused?: boolean;
}): Record {
  const now = new Date().toISOString();
  const startPaused = params.start_paused === true;
  const item = params.item_id ? params.items.find((i) => i.id === params.item_id) : null;
  const selectedTags = params.tag_ids
    ? (params.tags ?? []).filter((tag) => params.tag_ids?.includes(tag.id))
    : [];
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
    action_text: params.action_text?.trim() || null,
    created_at: now,
    updated_at: now,
    date: params.date,
    tags: selectedTags,
    item: item ? { id: item.id, title: item.title } : null,
    linked_records: [],
    session_state: startPaused ? 'paused' : 'running',
    paused_total_seconds: 0,
    paused_at: startPaused ? now : null,
  };
}

export function buildOptimisticManualRecord(payload: CreateRecordPayload, items: Item[], tags: Tag[] = []): Record {
  const recordType = payload.type ?? '发生';
  const now = new Date().toISOString();
  const item = payload.item_id ? items.find((i) => i.id === payload.item_id) : null;
  const selectedTags = payload.tag_ids
    ? tags.filter((tag) => payload.tag_ids?.includes(tag.id))
    : [];
  return {
    id: `optimistic-${now}`,
    user_id: 'pending',
    record_day_id: `pending:${payload.date}`,
    content: payload.content,
    type: recordType,
    occurred_at: payload.occurred_at ?? null,
    occurred_at_end: payload.occurred_at_end ?? null,
    lifecycle_status: payload.lifecycle_status ?? 'active',
    status: payload.status ?? null,
    mood: payload.mood ?? null,
    energy: payload.energy ?? null,
    result: payload.result ?? null,
    note: payload.note ?? null,
    item_id: payload.item_id ?? null,
    phase_id: payload.phase_id ?? null,
    sub_item_id: payload.sub_item_id ?? null,
    sort_order: 0,
    is_starred: false,
    cost: payload.cost ?? null,
    metric_value: payload.metric_value ?? null,
    metric_unit: payload.metric_unit ?? null,
    metric_name: payload.metric_name ?? null,
    duration_minutes: payload.duration_minutes ?? null,
    raw_input: payload.raw_input ?? null,
    parsed_semantic: payload.parsed_semantic ?? null,
    time_anchor_date: payload.time_anchor_date ?? payload.date,
    linked_record_id: null,
    location: payload.location ?? null,
    people: payload.people ?? [],
    batch_id: null,
    input_id: null,
    parent_input_id: null,
    review_status: payload.review_status ?? 'confirmed',
    confidence_level: null,
    input_source: payload.input_source ?? 'manual',
    money_direction: payload.money_direction ?? null,
    money_currency: payload.money_currency ?? null,
    action_text: payload.action_text ?? null,
    event_text: payload.event_text ?? null,
    object_text: payload.object_text ?? null,
    cause_text: payload.cause_text ?? null,
    outcome_type: payload.outcome_type ?? null,
    outcome_direction: payload.outcome_direction ?? null,
    time_text: payload.time_text ?? null,
    time_precision: payload.time_precision ?? null,
    place_type: payload.place_type ?? null,
    relation_roles: payload.relation_roles ?? null,
    body_state: payload.body_state ?? null,
    tool_label: payload.tool_label?.trim() || null,
    created_at: now,
    updated_at: now,
    date: payload.date,
    tags: selectedTags,
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
  const serverSource = serverRecord.raw_input?.trim() || serverRecord.content.trim();
  let placeholderIndex = prev.findIndex((record) => {
    if (!record.id.startsWith('optimistic-')) return false;
    const optimisticSource = record.raw_input?.trim() || record.content.trim();
    return (
      optimisticSource === serverSource &&
      record.type === serverRecord.type &&
      record.item_id === serverRecord.item_id
    );
  });
  if (placeholderIndex < 0) {
    placeholderIndex = prev.findIndex((record) =>
      record.id.startsWith('optimistic-')
    );
  }
  const withoutPlaceholder = prev.filter(
    (record, index) => index !== placeholderIndex && record.id !== enriched.id
  );
  return sortRecords([enriched, ...withoutPlaceholder]);
}
