import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { computeGoalEngineForItem } from '@/lib/db/goal-engine';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * GET /api/v2/items/{id}/goal-engine
 * 返回该事项下所有目标的引擎计算结果（统一接口）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id: itemId } = await params;

    // 校验事项归属
    const supabase = await createClient();
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, user_id')
      .eq('id', itemId)
      .maybeSingle();

    if (itemError) {
      throw new Error(`查询事项失败: ${itemError.message}`);
    }

    if (!item || item.user_id !== userId) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '事项不存在或不属于当前用户', ctx.traceId, 404);
    }

    const results = await computeGoalEngineForItem(userId, itemId);

    return apiSuccess(results, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
