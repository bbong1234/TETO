import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { computeGoalEngine } from '@/lib/db/goal-engine';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { COMPUTATION_VERSION } from '@/lib/computation';

/**
 * GET /api/v2/goals/{id}/engine
 * 返回单个目标的引擎计算结果
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const result = await computeGoalEngine(userId, id);

    if (!result) {
      return apiError(
        ERROR_CODES.GOAL_NO_DATA,
        '目标不存在、非量化型或缺少必要配置',
        ctx.traceId,
        404
      );
    }

    return apiSuccess(result, ctx.traceId, 200, undefined, { computationVersion: COMPUTATION_VERSION });
  } catch (error) {
    return handleApiError(error);
  }
}
