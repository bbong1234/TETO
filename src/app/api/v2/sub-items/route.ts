import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getSubItemsByItemId, getSubItemsByItemIds, listAllSubItems } from '@/lib/db/sub-items';
import { createSubItemSafely } from '@/lib/domain/sub-item-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import type { CreateSubItemPayload } from '@/types/teto';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

/**
 * GET /api/v2/sub-items?item_id=xxx
 * 获取某事项下的所有子项
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');
    const itemIdsParam = searchParams.get('item_ids');

    if (itemIdsParam) {
      const ids = itemIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
      const subItems = await getSubItemsByItemIds(userId, ids);
      return apiSuccess(subItems, ctx.traceId);
    }

    if (itemId) {
      const subItems = await getSubItemsByItemId(userId, itemId);
      return apiSuccess(subItems, ctx.traceId);
    }

    const all = await listAllSubItems(userId);
    return apiSuccess(all, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v2/sub-items
 * 创建子项
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body: CreateSubItemPayload = await request.json();

    const supabase = await createClient();
    const result = await createSubItemSafely({ userId, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 201, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
