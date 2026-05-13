import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateTagSafely, deleteTagSafely } from '@/lib/domain/tag-service';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { UpdateTagPayload } from '@/types/teto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`获取标签失败: ${error.message}`);
    }

    if (!data) {
      return apiError(ERROR_CODES.TAG_NOT_FOUND, '标签不存在或不属于当前用户', ctx.traceId, 404);
    }

    return apiSuccess(data, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateTagPayload = await request.json();

    const supabase = await createClient();
    const result = await updateTagSafely({ userId, id, payload: body, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess(result.data, ctx.traceId, 200, result.warnings);
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

    const supabase = await createClient();
    const result = await deleteTagSafely({ userId, id, supabase });
    if (!result.ok) return apiDomainError(result.errors, ctx.traceId);
    return apiSuccess({ id }, ctx.traceId, 200, result.warnings);
  } catch (error) {
    return handleApiError(error);
  }
}
