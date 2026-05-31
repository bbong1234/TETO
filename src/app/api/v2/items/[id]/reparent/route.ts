import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { reparentItemSafely } from '@/lib/domain/item-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiDomainError } from '@/lib/api/handler-wrapper';
import type { ItemLevel } from '@/lib/activity/item-reparent';

interface ReparentBody {
  parent_item_id?: string | null;
  as_level?: ItemLevel;
}

/**
 * POST /api/v2/items/{id}/reparent
 * 移动事项到新的父节点（一类/二类/三类互转）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body = (await request.json()) as ReparentBody;

    const parentItemId =
      body.parent_item_id === undefined ? null : body.parent_item_id;

    const supabase = await createClient();
    const result = await reparentItemSafely({
      userId,
      id,
      parentItemId,
      asLevel: body.as_level,
      supabase,
    });

    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
