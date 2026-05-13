import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { batchCreateRecordsSafely } from '@/lib/domain/record-service';
import type { CreateRecordPayload } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body = await request.json();
    const records: CreateRecordPayload[] = body.records;

    const supabase = await createClient();

    const result = await batchCreateRecordsSafely({ userId, records, supabase });

    // 全局错误（空数组、超限等）
    if (result.errors.length > 0 && result.total === 0) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, result.errors.map(e => e.message).join('; '), ctx.traceId, 400);
    }

    return apiSuccess({
      total: result.total,
      success: result.success,
      failed: result.failed,
      errors: result.results
        .filter(r => !r.ok)
        .map(r => r.errors.map(e => e.message).join('; '))
        .slice(0, 20),
    }, ctx.traceId, result.success > 0 ? 201 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}
