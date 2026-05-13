import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { cancelRecordSafely } from '@/lib/domain/record-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';

/**
 * POST /api/v2/records/[id]/cancel
 * 取消一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 验证当前状态为 active（或空）
 * 3. 标记 lifecycle_status = 'cancelled'
 * 4. 不生成新记录，不创建关联
 * 5. 返回更新后的记录
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();

    const result = await cancelRecordSafely({ userId, id, supabase });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    return apiSuccess(result.data, ctx.traceId, 200, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
