import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { parseGoal } from '@/lib/ai/parse-goal';
import { getItemById } from '@/lib/db/items';
import { getGoalsByItemId } from '@/lib/db/goals';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * POST /api/v2/goals/parse
 * 自然语言解析为目标草稿
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body = await request.json();

    const goalText = body.goal_text;
    if (!goalText || typeof goalText !== 'string') {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'goal_text 为必填字段', ctx.traceId, 400);
    }

    // 收集事项上下文信息
    let context: Parameters<typeof parseGoal>[1] = undefined;

    if (body.item_id) {
      const item = await getItemById(userId, body.item_id);
      const existingGoals = await getGoalsByItemId(userId, body.item_id);

      if (item) {
        context = {
          item_title: item.title,
          item_description: item.description ?? undefined,
          sub_items: (item as any).sub_items?.map((s: any) => ({ title: s.title })),
          existing_metrics: (item as any).sub_items?.flatMap((s: any) =>
            s.metric_name ? [{ metric_name: s.metric_name, unit: s.metric_unit || '' }] : []
          ),
          existing_goals: existingGoals.map(g => ({
            goal_text: g.goal_text || g.title,
            rule_type: g.rule_type,
          })),
        };
      }
    }

    const result = await parseGoal(goalText, context);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
