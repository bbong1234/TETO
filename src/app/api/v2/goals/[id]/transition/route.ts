import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getGoalById } from '@/lib/db/goals';
import { updateGoalSafely } from '@/lib/domain/goal-service';
import { createRecordSafely } from '@/lib/domain/record-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { GoalStatus } from '@/types/teto';

const TRANSITION_STATUSES: GoalStatus[] = ['已完成', '放弃', '暂停'];

interface TransitionPayload {
  status: GoalStatus;
  note?: string;
}

function outcomeForStatus(status: GoalStatus): {
  outcome_type: string;
  outcome_direction: 'positive' | 'neutral' | 'negative';
} {
  if (status === '已完成') {
    return { outcome_type: 'done', outcome_direction: 'positive' };
  }
  if (status === '放弃') {
    return { outcome_type: 'no_change', outcome_direction: 'negative' };
  }
  return { outcome_type: 'interrupted', outcome_direction: 'neutral' };
}

/**
 * POST /api/v2/goals/[id]/transition
 * 目标状态切换（暂停 / 完成 / 放弃），可选创建关联总结记录
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: TransitionPayload = await request.json();

    if (!body.status || !TRANSITION_STATUSES.includes(body.status)) {
      return apiError(
        ERROR_CODES.GOAL_NO_DATA,
        `status 必须为以下之一: ${TRANSITION_STATUSES.join(', ')}`,
        ctx.traceId,
        400
      );
    }

    const supabase = await createClient();
    const existingGoal = await getGoalById(userId, id);
    if (!existingGoal) {
      return apiError(ERROR_CODES.GOAL_NO_DATA, '目标不存在或不属于当前用户', ctx.traceId, 404);
    }

    if (existingGoal.status === '草稿') {
      return apiError(ERROR_CODES.GOAL_NO_DATA, '草稿目标请先确认后再切换状态', ctx.traceId, 400);
    }

    const result = await updateGoalSafely({
      userId,
      id,
      payload: { status: body.status },
      supabase,
    });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);

    let linkedRecord = null;
    const note = body.note?.trim();
    if (note) {
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const outcome = outcomeForStatus(body.status);

      const recordResult = await createRecordSafely({
        userId,
        payload: {
          content: note,
          date,
          type: '总结',
          item_id: existingGoal.item_id ?? undefined,
          sub_item_id: existingGoal.sub_item_id ?? undefined,
          phase_id: existingGoal.phase_id ?? undefined,
          goal_id: id,
          outcome_type: outcome.outcome_type,
          outcome_direction: outcome.outcome_direction,
          input_source: 'manual',
          review_status: 'confirmed',
        },
        supabase,
      });

      if (!recordResult.ok) {
        return apiDomainError(recordResult.errors, ctx.traceId);
      }
      linkedRecord = recordResult.data;
    }

    return apiSuccess(
      { goal: result.data, linked_record: linkedRecord },
      ctx.traceId,
      200,
      result.warnings
    );
  } catch (error) {
    return handleApiError(error);
  }
}
