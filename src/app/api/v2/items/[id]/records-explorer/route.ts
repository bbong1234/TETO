import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemRecordExplorer } from '@/lib/db/item-record-explorer';
import type { ItemRecordExplorerQuery } from '@/types/teto';
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
    const { searchParams } = new URL(request.url);

    const query: ItemRecordExplorerQuery = {};
    const projectId = searchParams.get('project_id');
    const subItemId = searchParams.get('sub_item_id');
    const functionTagId = searchParams.get('function_tag_id');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    if (projectId) query.project_id = projectId;
    if (subItemId) query.sub_item_id = subItemId;
    if (functionTagId) query.function_tag_id = functionTagId;
    if (limit) query.limit = Number(limit);
    if (offset) query.offset = Number(offset);

    const result = await getItemRecordExplorer(userId, id, query);
    if (!result) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '第一标签不存在', ctx.traceId, 404);
    }

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
