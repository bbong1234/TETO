import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { confirmGoalSafely } from '@/lib/domain/goal-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import type { UpdateGoalPayload } from '@/types/teto';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';

/**
 * POST /api/v2/goals/[id]/confirm
 * 确认草稿目标 → 进行中
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateGoalPayload = await request.json();

    const supabase = await createClient();
    const result = await confirmGoalSafely({ userId, id, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
