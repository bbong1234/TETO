/**
 * 当前事项（Current Activity）领域服务
 * - 开始 / 停止 / 切换
 * - 保证同一用户同一时间只有一条 active 记录
 */

import type { DomainResult, InvariantIssue } from './domain-errors';
import type { CreateRecordPayload, Record as TetoRecord } from '@/types/teto';
import { listActiveActivities } from '@/lib/db/activities';
import { createRecordSafely, updateRecordSafely } from './record-service';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>;

export interface StartActivityParams {
  userId: string;
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  tool_label?: string | null;
  tag_ids?: string[];
  supabase: SupabaseClient;
  traceId?: string;
}

export interface SwitchActivityParams extends StartActivityParams {}

interface StopActivityResult {
  stopped: TetoRecord[];
}

function calcDurationMinutes(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
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

/**
 * 结束所有进行中的当前事项
 */
export async function stopAllActiveActivities(
  userId: string,
  supabase: SupabaseClient,
  endTime?: string
): Promise<DomainResult<StopActivityResult>> {
  const now = endTime ?? new Date().toISOString();
  const actives = await listActiveActivities(userId);
  const stopped: TetoRecord[] = [];
  const warnings: InvariantIssue[] = [];

  for (const activity of actives) {
    if (!activity.occurred_at) {
      warnings.push(makeIssue('ACTIVITY_MISSING_START_TIME', `记录 ${activity.id} 缺少开始时间，已标记为 completed`));
    }
    const duration = activity.occurred_at
      ? calcDurationMinutes(activity.occurred_at, now)
      : null;

    const result = await updateRecordSafely({
      userId,
      id: activity.id,
      payload: {
        occurred_at_end: now,
        duration_minutes: duration ?? undefined,
        lifecycle_status: 'completed',
      },
      supabase,
    });

    if (!result.ok) {
      return { ok: false, data: undefined, errors: result.errors, warnings };
    }
    stopped.push(result.data!);
  }

  return { ok: true, data: { stopped }, errors: [], warnings };
}

/**
 * 开始新的当前事项（会先结束已有 active 记录）
 */
export async function startActivity(
  params: StartActivityParams
): Promise<DomainResult<{ record: TetoRecord; stopped: TetoRecord[] }>> {
  const { userId, item_id, sub_item_id, tool_label, tag_ids, supabase, traceId } = params;
  const recordContent = resolveRecordContent(params);

  if (!recordContent && !item_id) {
    return {
      ok: false,
      data: undefined,
      errors: [makeIssue('ACTIVITY_CONTENT_REQUIRED', '请选择事项或填写描述')],
      warnings: [],
    };
  }

  const stopResult = await stopAllActiveActivities(userId, supabase);
  if (!stopResult.ok) {
    return { ok: false, data: undefined, errors: stopResult.errors, warnings: stopResult.warnings };
  }

  const now = new Date().toISOString();
  const payload: CreateRecordPayload = {
    date: todayDateStr(),
    content: recordContent || '进行中',
    type: '发生',
    lifecycle_status: 'active',
    occurred_at: now,
    occurred_at_end: null,
    input_source: 'manual',
    review_status: 'confirmed',
    item_id: item_id ?? undefined,
    sub_item_id: sub_item_id ?? undefined,
    tool_label: tool_label?.trim() || undefined,
    tag_ids,
  };

  const createResult = await createRecordSafely({ userId, payload, supabase, traceId });
  if (!createResult.ok) {
    return { ok: false, data: undefined, errors: createResult.errors, warnings: createResult.warnings };
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
    !!params.content?.trim();

  if (!hasNew) {
    const stopResult = await stopAllActiveActivities(params.userId, params.supabase);
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
