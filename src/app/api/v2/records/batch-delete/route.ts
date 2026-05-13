import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { batchDeleteRecordsSafely } from '@/lib/domain/record-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * POST /api/v2/records/batch-delete
 * 批量删除记录（仅删除属于当前用户的记录）
 * body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { ids } = await request.json();

    const supabase = await createClient();

    const result = await batchDeleteRecordsSafely({ userId, ids, supabase });

    // 全局错误（空数组、超限等）
    if (result.errors.length > 0 && result.total === 0) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, result.errors.map(e => e.message).join('; '), ctx.traceId, 400);
    }

    return apiSuccess({ deleted: result.success }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
