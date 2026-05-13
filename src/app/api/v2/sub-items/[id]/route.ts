import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getSubItemById } from '@/lib/db/sub-items';
import { updateSubItemSafely, deleteSubItemSafely } from '@/lib/domain/sub-item-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import type { UpdateSubItemPayload } from '@/types/teto';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * GET /api/v2/sub-items/{id}
 * 获取单个子项详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const subItem = await getSubItemById(userId, id);
    if (!subItem) {
      return apiError(ERROR_CODES.SUB_ITEM_NOT_FOUND, '子项不存在或不属于当前用户', ctx.traceId, 404);
    }

    return apiSuccess(subItem, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v2/sub-items/{id}
 * 更新子项
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateSubItemPayload = await request.json();

    const supabase = await createClient();
    const result = await updateSubItemSafely({ userId, id, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v2/sub-items/{id}
 * 删除子项
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const result = await deleteSubItemSafely({ userId, id, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess({ id }, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
