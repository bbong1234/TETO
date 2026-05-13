import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getGoalById } from '@/lib/db/goals';
import { updateGoalSafely, deleteGoalSafely } from '@/lib/domain/goal-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import type { UpdateGoalPayload } from '@/types/teto';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const goal = await getGoalById(userId, id);
    if (!goal) {
      return apiError(ERROR_CODES.GOAL_NO_DATA, '目标不存在或不属于当前用户', ctx.traceId, 404);
    }

    return apiSuccess(goal, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateGoalPayload = await request.json();

    const supabase = await createClient();
    const result = await updateGoalSafely({ userId, id, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const result = await deleteGoalSafely({ userId, id, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess({ id }, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
