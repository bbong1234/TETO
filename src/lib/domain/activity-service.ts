/**
 * 当前事项（Current Activity）领域服务
 * - 开始 / 停止 / 切换 / 暂停 / 恢复 / 嵌套打断
 * - 保证同一用户同一时间只有一条 active 记录（嵌套时父会话 nested_paused）
 */

import type { DomainResult, InvariantIssue } from './domain-errors';
import type { CreateRecordPayload, Record as TetoRecord, SessionState } from '@/types/teto';
import { listActiveActivities } from '@/lib/db/activities';
import { createRecordSafely, updateRecordSafely } from './record-service';
import { createActivityEvent } from '@/lib/db/activity-events';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';
import { UNASSIGNED_ACTIVE_PLACEHOLDER } from '@/lib/activity/recent-context';
import {
  calcNetDurationMinutes,
  buildSessionSummaryFromEvents,
} from '@/lib/activity/session-utils';
import { listActivityEvents } from '@/lib/db/activity-events';

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>;

export interface StartActivityParams {
  userId: string;
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
  parent_session_id?: string | null;
  /** 创建后立即处于暂停态（计时未开始，需用户手动恢复） */
  start_paused?: boolean;
  supabase: SupabaseClient;
  traceId?: string;
}

export interface SwitchActivityParams extends StartActivityParams {}

export type SessionAction = 'pause' | 'resume' | 'enter-nested' | 'exit-nested';

export interface SessionActionParams {
  userId: string;
  action: SessionAction;
  /** enter-nested 时的新子活动内容 */
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
  supabase: SupabaseClient;
  traceId?: string;
}

interface StopActivityResult {
  stopped: TetoRecord[];
}

function todayDateStr(): string {
  return fmtLocalDate(new Date());
}

function makeIssue(code: string, message: string): InvariantIssue {
  return { code, severity: 'blocking', message, entity: 'record' };
}

function resolveRecordContent(params: { content?: string }): string {
  return params.content?.trim() ?? '';
}

function accumulatePauseSeconds(record: TetoRecord, nowIso: string): number {
  const base = record.paused_total_seconds ?? 0;
  if (!record.paused_at) return base;
  const extra = Math.max(
    0,
    Math.floor((Date.parse(nowIso) - Date.parse(record.paused_at)) / 1000)
  );
  return base + extra;
}

async function appendSessionEvent(
  userId: string,
  sessionId: string,
  eventType: 'pause' | 'resume' | 'sub_start' | 'sub_end',
  content = ''
) {
  await createActivityEvent(userId, {
    session_id: sessionId,
    event_type: eventType,
    content,
  });
}

async function finalizeSessionRecord(
  userId: string,
  activity: TetoRecord,
  supabase: SupabaseClient,
  endTime: string
): Promise<TetoRecord> {
  let pausedTotal = activity.paused_total_seconds ?? 0;
  if (activity.paused_at) {
    pausedTotal = accumulatePauseSeconds(activity, endTime);
  }

  const recordForDuration = {
    ...activity,
    paused_total_seconds: pausedTotal,
    paused_at: null,
    occurred_at_end: endTime,
  };
  const duration = activity.occurred_at
    ? calcNetDurationMinutes(recordForDuration, endTime)
    : null;

  // 从事件流生成摘要
  let contentPatch: string | undefined;
  try {
    const events = await listActivityEvents(userId, activity.id);
    const summary = buildSessionSummaryFromEvents(events);
    if (summary && summary !== activity.content) {
      contentPatch = summary;
    }
  } catch {
    /* ignore */
  }

  const result = await updateRecordSafely({
    userId,
    id: activity.id,
    payload: {
      occurred_at_end: endTime,
      duration_minutes: duration ?? undefined,
      lifecycle_status: 'completed',
      session_state: 'running',
      paused_at: null,
      paused_total_seconds: pausedTotal,
      ...(contentPatch ? { content: contentPatch } : {}),
    },
    supabase,
  });

  if (!result.ok) {
    throw new Error(result.errors?.[0]?.message ?? '结束会话失败');
  }
  return result.data!;
}

/**
 * 结束所有进行中的当前事项（不含 nested_paused 的父会话，除非 forceAll）
 */
export async function stopAllActiveActivities(
  userId: string,
  supabase: SupabaseClient,
  endTime?: string,
  options?: { includeNestedPaused?: boolean }
): Promise<DomainResult<StopActivityResult>> {
  const now = endTime ?? new Date().toISOString();
  const actives = await listActiveActivities(userId);
  const stopped: TetoRecord[] = [];
  const warnings: InvariantIssue[] = [];

  for (const activity of actives) {
    if (
      activity.session_state === 'nested_paused' &&
      !options?.includeNestedPaused
    ) {
      continue;
    }

    if (!activity.occurred_at) {
      warnings.push(makeIssue('ACTIVITY_MISSING_START_TIME', `记录 ${activity.id} 缺少开始时间，已标记为 completed`));
    }

    try {
      const finalized = await finalizeSessionRecord(userId, activity, supabase, now);
      stopped.push(finalized);
    } catch (e) {
      return {
        ok: false,
        data: undefined,
        errors: [makeIssue('ACTIVITY_STOP_FAILED', e instanceof Error ? e.message : '停止失败')],
        warnings,
      };
    }
  }

  return { ok: true, data: { stopped }, errors: [], warnings };
}

/**
 * 开始新的当前事项（会先结束已有 running 记录，保留 nested_paused 父会话）
 */
export async function startActivity(
  params: StartActivityParams
): Promise<DomainResult<{ record: TetoRecord; stopped: TetoRecord[] }>> {
  const { userId, item_id, sub_item_id, phase_id, tool_label, tag_ids, parent_session_id, supabase, traceId } = params;
  let recordContent = resolveRecordContent(params);

  if (!recordContent && !item_id) {
    recordContent = UNASSIGNED_ACTIVE_PLACEHOLDER;
  }

  // 嵌套打断时保留 nested_paused 父会话；独立切换/开始时一并结束遗留的父会话
  const stopResult = await stopAllActiveActivities(userId, supabase, undefined, {
    includeNestedPaused: !parent_session_id,
  });
  if (!stopResult.ok) {
    return { ok: false, data: undefined, errors: stopResult.errors, warnings: stopResult.warnings };
  }

  const now = new Date().toISOString();
  const startPaused = params.start_paused === true;
  const payload: CreateRecordPayload = {
    date: todayDateStr(),
    content: recordContent,
    type: '发生',
    lifecycle_status: 'active',
    occurred_at: now,
    occurred_at_end: null,
    input_source: 'manual',
    review_status: item_id ? 'confirmed' : 'unchecked',
    item_id: item_id ?? undefined,
    sub_item_id: sub_item_id ?? undefined,
    phase_id: phase_id ?? undefined,
    tool_label: tool_label?.trim() || undefined,
    tag_ids,
    session_state: startPaused ? 'paused' : 'running',
    paused_total_seconds: 0,
    paused_at: startPaused ? now : null,
    parent_session_id: parent_session_id ?? undefined,
  };

  const createResult = await createRecordSafely({ userId, payload, supabase, traceId });
  if (!createResult.ok) {
    return { ok: false, data: undefined, errors: createResult.errors, warnings: createResult.warnings };
  }

  if (parent_session_id) {
    await appendSessionEvent(userId, parent_session_id, 'sub_start', recordContent);
  }

  if (startPaused && createResult.data) {
    await appendSessionEvent(userId, createResult.data.id, 'pause');
  }

  return {
    ok: true,
    data: { record: createResult.data!, stopped: stopResult.data!.stopped },
    errors: [],
    warnings: [...(stopResult.warnings ?? []), ...(createResult.warnings ?? [])],
  };
}

/**
 * 切换当前事项：结束旧记录，可选创建新记录
 */
export async function switchActivity(
  params: SwitchActivityParams
): Promise<DomainResult<{ record: TetoRecord | null; stopped: TetoRecord[] }>> {
  const hasNew =
    !!params.item_id ||
    !!params.content?.trim() ||
    params.content === UNASSIGNED_ACTIVE_PLACEHOLDER;

  if (!hasNew) {
    const stopResult = await stopAllActiveActivities(params.userId, params.supabase, undefined, {
      includeNestedPaused: true,
    });
    if (!stopResult.ok) {
      return { ok: false, data: undefined, errors: stopResult.errors, warnings: stopResult.warnings };
    }
    return {
      ok: true,
      data: { record: null, stopped: stopResult.data!.stopped },
      errors: [],
      warnings: stopResult.warnings,
    };
  }

  const startResult = await startActivity(params);
  if (!startResult.ok) {
    return { ok: false, data: undefined, errors: startResult.errors, warnings: startResult.warnings };
  }
  return {
    ok: true,
    data: { record: startResult.data!.record, stopped: startResult.data!.stopped },
    errors: [],
    warnings: startResult.warnings,
  };
}

/**
 * 获取当前真正在计时的会话（running 状态，非 nested_paused 父会话）
 */
export async function getRunningActivity(userId: string): Promise<TetoRecord | null> {
  const actives = await listActiveActivities(userId);
  const running = actives.find((a) => a.session_state === 'running' || !a.session_state);
  return running ?? actives[0] ?? null;
}

/**
 * 暂停 / 恢复 / 嵌套打断
 */
export async function performSessionAction(
  params: SessionActionParams
): Promise<DomainResult<{ record: TetoRecord | null; child?: TetoRecord | null }>> {
  const { userId, action, supabase, traceId } = params;
  const actives = await listActiveActivities(userId);
  const now = new Date().toISOString();

  if (action === 'pause') {
    const current = actives.find((a) => a.session_state === 'running' || !a.session_state);
    if (!current) {
      return { ok: false, data: undefined, errors: [makeIssue('NO_ACTIVE_SESSION', '没有进行中的活动')], warnings: [] };
    }
    if (current.session_state === 'paused') {
      return { ok: true, data: { record: current }, errors: [], warnings: [] };
    }

    const result = await updateRecordSafely({
      userId,
      id: current.id,
      payload: { session_state: 'paused' as SessionState, paused_at: now },
      supabase,
    });
    if (!result.ok) return { ok: false, data: undefined, errors: result.errors, warnings: result.warnings };
    await appendSessionEvent(userId, current.id, 'pause');
    return { ok: true, data: { record: result.data! }, errors: [], warnings: result.warnings };
  }

  if (action === 'resume') {
    const current = actives.find((a) => a.session_state === 'paused');
    if (!current) {
      return { ok: false, data: undefined, errors: [makeIssue('NO_PAUSED_SESSION', '没有已暂停的活动')], warnings: [] };
    }

    const pausedTotal = accumulatePauseSeconds(current, now);
    const result = await updateRecordSafely({
      userId,
      id: current.id,
      payload: {
        session_state: 'running' as SessionState,
        paused_at: null,
        paused_total_seconds: pausedTotal,
      },
      supabase,
    });
    if (!result.ok) return { ok: false, data: undefined, errors: result.errors, warnings: result.warnings };
    await appendSessionEvent(userId, current.id, 'resume');
    return { ok: true, data: { record: result.data! }, errors: [], warnings: result.warnings };
  }

  if (action === 'enter-nested') {
    const parent = actives.find((a) => a.session_state === 'running' || !a.session_state);
    if (!parent) {
      return { ok: false, data: undefined, errors: [makeIssue('NO_ACTIVE_SESSION', '没有进行中的活动')], warnings: [] };
    }
    if (parent.parent_session_id) {
      return { ok: false, data: undefined, errors: [makeIssue('NESTED_LIMIT', '暂不支持多层嵌套')], warnings: [] };
    }

    const pausedTotal = parent.paused_at
      ? accumulatePauseSeconds(parent, now)
      : (parent.paused_total_seconds ?? 0);

    const parentUpdate = await updateRecordSafely({
      userId,
      id: parent.id,
      payload: {
        session_state: 'nested_paused' as SessionState,
        paused_at: now,
        paused_total_seconds: pausedTotal,
      },
      supabase,
    });
    if (!parentUpdate.ok) {
      return { ok: false, data: undefined, errors: parentUpdate.errors, warnings: parentUpdate.warnings };
    }
    await appendSessionEvent(userId, parent.id, 'pause', '嵌套打断');

    const childResult = await startActivity({
      userId,
      content: params.content,
      item_id: params.item_id,
      sub_item_id: params.sub_item_id,
      phase_id: params.phase_id,
      tool_label: params.tool_label,
      tag_ids: params.tag_ids,
      parent_session_id: parent.id,
      supabase,
      traceId,
    });

    if (!childResult.ok) {
      // 回滚父会话
      await updateRecordSafely({
        userId,
        id: parent.id,
        payload: { session_state: 'running' as SessionState, paused_at: null },
        supabase,
      });
      return { ok: false, data: undefined, errors: childResult.errors, warnings: childResult.warnings };
    }

    return {
      ok: true,
      data: { record: parentUpdate.data!, child: childResult.data!.record },
      errors: [],
      warnings: childResult.warnings,
    };
  }

  if (action === 'exit-nested') {
    const child = actives.find((a) => a.parent_session_id && a.session_state !== 'nested_paused');
    if (!child || !child.parent_session_id) {
      return { ok: false, data: undefined, errors: [makeIssue('NO_NESTED_CHILD', '没有嵌套子活动')], warnings: [] };
    }

    const parentId = child.parent_session_id;
    const finalizedChild = await finalizeSessionRecord(userId, child, supabase, now);
    await appendSessionEvent(userId, parentId, 'sub_end', child.content);

    const parent = actives.find((a) => a.id === parentId);
    if (!parent) {
      return { ok: true, data: { record: finalizedChild, child: null }, errors: [], warnings: [] };
    }

    const pausedTotal = parent.paused_at
      ? accumulatePauseSeconds(parent, now)
      : (parent.paused_total_seconds ?? 0);

    const parentResume = await updateRecordSafely({
      userId,
      id: parentId,
      payload: {
        session_state: 'running' as SessionState,
        paused_at: null,
        paused_total_seconds: pausedTotal,
      },
      supabase,
    });
    if (!parentResume.ok) {
      return { ok: false, data: undefined, errors: parentResume.errors, warnings: parentResume.warnings };
    }
    await appendSessionEvent(userId, parentId, 'resume', '嵌套结束');

    return {
      ok: true,
      data: { record: parentResume.data!, child: finalizedChild },
      errors: [],
      warnings: parentResume.warnings,
    };
  }

  return { ok: false, data: undefined, errors: [makeIssue('INVALID_ACTION', '无效操作')], warnings: [] };
}
