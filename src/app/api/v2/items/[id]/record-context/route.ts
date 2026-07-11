import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemMeta } from '@/lib/db/items';
import { getItemRecordContext } from '@/lib/db/records';
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

    const item = await getItemMeta(userId, id);
    if (!item) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '事项不存在', ctx.traceId, 404);
    }

    const result = await getItemRecordContext(userId, id);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
