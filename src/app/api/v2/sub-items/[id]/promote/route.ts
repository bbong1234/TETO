import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { promoteSubItemSafely } from '@/lib/domain/sub-item-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';

/**
 * POST /api/v2/sub-items/{id}/promote
 * 子项升格为独立事项
 *
 * Body:
 *   migrate_records: boolean (default: true) — 是否迁移历史记录
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
    const result = await promoteSubItemSafely({ userId, id, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess({
      new_item_id: result.data!.newItemId,
      sub_item: result.data!.subItem,
    }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
