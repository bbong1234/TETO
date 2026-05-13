import { NextRequest } from 'next/server';import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getInsights } from '@/lib/db/insights';
import { handleApiError } from '@/lib/api/error-handler';
import type { InsightsQuery } from '@/types/teto';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { startSpan, endSpan } from '@/lib/observability/trace';
import { PipelineStage } from '@/lib/ai/agent-pipeline';
import { parseInsightMetricsParam } from '@/lib/computation/runtime/metrics';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  const spanCtx = startSpan(ctx.traceId, PipelineStage.COMMIT, '获取洞察分析');
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');

    if (!date_from || !date_to) {
      endSpan(spanCtx, 'failed', 'date_from 和 date_to 为必填参数', ERROR_CODES.INSIGHT_QUERY_INVALID);
      return apiError(ERROR_CODES.INSIGHT_QUERY_INVALID, 'date_from 和 date_to 为必填参数', ctx.traceId, 400);
    }

    const metrics = parseInsightMetricsParam(searchParams.get('metrics'));

    const query: InsightsQuery = {
      date_from,
      date_to,
      ...(metrics ? { metrics } : {}),
    };
    const result = await getInsights(userId, query);
    endSpan(spanCtx, 'ok', `洞察分析完成`);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    endSpan(spanCtx, 'failed', '获取洞察异常', undefined, error instanceof Error ? error.message : String(error));
    return handleApiError(error);
  }
}
