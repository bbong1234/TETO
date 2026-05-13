import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { completeRecordSafely } from '@/lib/domain/record-service';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';

/**
 * POST /api/v2/records/[id]/complete
 * 完成一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 新建一条"发生"记录
 * 3. 创建 record_link: 新记录 → 原记录，link_type = 'completes'
 * 4. 原记录 lifecycle_status 标记为 'completed'
 * 5. 返回新创建的记录
 *
 * Body: { occurred_at?: string, date?: string, completion_content?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    let body: { occurred_at?: string; date?: string; completion_content?: string } = {};
    try {
      body = await request.json();
    } catch { /* 无 body 时使用默认值 */ }

    const supabase = await createClient();

    const result = await completeRecordSafely({ userId, id, body, supabase });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    return apiSuccess(result.data, ctx.traceId, 201, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
