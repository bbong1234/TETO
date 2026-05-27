import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemById, listItems } from '@/lib/db/items';
import { computeItemActivityStats, computeCategoryActivityStats } from '@/lib/db/item-activity-stats';
import { getChildItems, isCategoryItem } from '@/lib/activity/item-tree';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const item = await getItemById(userId, id);
    if (!item) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '事项不存在', ctx.traceId, 404);
    }

    const allItems = await listItems(userId, {});
    const isCategory = isCategoryItem(item, allItems, item.id);
    const childIds = isCategory ? getChildItems(allItems, id).map((c) => c.id) : [];

    const stats =
      isCategory && childIds.length > 0
        ? await computeCategoryActivityStats(userId, id, childIds)
        : await computeItemActivityStats(userId, id);

    return apiSuccess({ ...stats, is_category: isCategory, child_count: childIds.length }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
