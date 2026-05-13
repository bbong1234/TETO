import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { linkRecordsSafely } from '@/lib/domain/record-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * POST /api/v2/records/link
 * 将两条记录建立关联（设置 linked_record_id）
 *
 * Body: { record_id: string; linked_record_id: string | null }
 *   - linked_record_id = null 表示取消关联
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { record_id, linked_record_id } = body as {
      record_id?: string;
      linked_record_id?: string | null;
    };

    if (!record_id) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'record_id 为必填字段', ctx.traceId, 400);
    }

    const supabase = await createClient();

    const result = await linkRecordsSafely({
      userId,
      record_id,
      linked_record_id: linked_record_id ?? null,
      supabase,
    });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    return apiSuccess(result.data, ctx.traceId, 200, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
