import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemFolders, createItemFolder } from '@/lib/db/item-folders';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { CreateItemFolderPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const result = await getItemFolders(userId);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body: CreateItemFolderPayload = await request.json();

    if (!body.name) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, 'name 为必填字段', ctx.traceId, 400);
    }

    const folder = await createItemFolder(userId, body);
    return apiSuccess(folder, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
