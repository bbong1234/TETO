import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemFolderById, updateItemFolder, deleteItemFolder } from '@/lib/db/item-folders';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { UpdateItemFolderPayload } from '@/types/teto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const result = await getItemFolderById(userId, id);

    if (!result) {
      return apiError(ERROR_CODES.ITEM_NOT_FOUND, '文件夹不存在', ctx.traceId, 404);
    }

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateItemFolderPayload = await request.json();
    const result = await updateItemFolder(userId, id, body);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    await deleteItemFolder(userId, id);
    return apiSuccess({ id }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
