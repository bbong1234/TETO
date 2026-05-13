import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getGoals } from '@/lib/db/goals';
import { createGoalSafely } from '@/lib/domain/goal-service';
import { createClient } from '@/lib/supabase/server';
import type { GoalsQuery, CreateGoalPayload } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { startSpan, endSpan } from '@/lib/observability/trace';
import { PipelineStage } from '@/lib/ai/agent-pipeline';

export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: GoalsQuery = {};
    const status = searchParams.get('status');
    const item_id = searchParams.get('item_id');
    const phase_id = searchParams.get('phase_id');
    const sub_item_id = searchParams.get('sub_item_id');
    const rule_type = searchParams.get('rule_type');
    const source = searchParams.get('source');
    if (status) query.status = status as GoalsQuery['status'];
    if (item_id) query.item_id = item_id;
    if (phase_id) query.phase_id = phase_id;
    if (sub_item_id) query.sub_item_id = sub_item_id;
    if (rule_type) query.rule_type = rule_type as GoalsQuery['rule_type'];
    if (source) query.source = source as GoalsQuery['source'];

    const result = await getGoals(userId, query);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  const spanCtx = startSpan(ctx.traceId, PipelineStage.EXECUTE, '创建目标');
  try {
    const userId = await getCurrentUserId();
    const body: CreateGoalPayload = await request.json();

    const supabase = await createClient();
    const result = await createGoalSafely({ userId, payload: body, supabase });
    if (!result.ok) {
      endSpan(spanCtx, 'failed', '域校验失败', result.errors[0]?.code, result.errors[0]?.message);
      return apiDomainError(result.errors, ctx.traceId);
    }
    endSpan(spanCtx, 'ok', `目标 ${result.data?.id} 创建成功`);
    return apiSuccess(result.data, ctx.traceId, 201, result.warnings);
  } catch (error) {
    endSpan(spanCtx, 'failed', '创建目标异常', undefined, error instanceof Error ? error.message : String(error));
    return handleApiError(error);
  }
}
