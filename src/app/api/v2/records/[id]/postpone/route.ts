import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { postponeRecordSafely } from '@/lib/domain/record-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * POST /api/v2/records/[id]/postpone
 * 推迟一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 新建一条"计划"记录（time_anchor_date = new_date）
 * 3. 创建 record_link: 新记录 → 原记录，link_type = 'postponed_from'
 * 4. 原记录 lifecycle_status 标记为 'postponed'
 * 5. 返回新创建的记录
 *
 * Body: { new_date: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body = await request.json();

    const { new_date } = body as { new_date?: string };
    if (!new_date) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'new_date 为必填字段', ctx.traceId, 400);
    }

    const supabase = await createClient();

    const result = await postponeRecordSafely({ userId, id, new_date, supabase });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    return apiSuccess(result.data, ctx.traceId, 201, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
