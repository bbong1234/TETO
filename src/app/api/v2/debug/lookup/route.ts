import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { debugLookup } from '@/lib/db/debug-lookup';

/** GET /api/v2/debug/lookup?q= — 按 ID / trace_id 探测 record、input、trace_summaries */
export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (!q) {
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, '缺少 q 参数', ctx.traceId, 400);
    }
    const result = await debugLookup(userId, q);
    return apiSuccess(result, ctx.traceId);
  } catch (e) {
    return handleApiError(e);
  }
}
