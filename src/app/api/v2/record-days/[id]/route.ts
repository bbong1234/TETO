import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateRecordDaySummary } from '@/lib/db/record-days';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

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
      .from('record_days')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`获取记录日失败: ${error.message}`);
    }

    if (!data) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '记录日不存在或不属于当前用户', ctx.traceId, 404);
    }

    return apiSuccess(data, ctx.traceId);
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
    const body = await request.json();

    if (body.summary === undefined) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'summary 为必填字段', ctx.traceId, 400);
    }

    const recordDay = await updateRecordDaySummary(userId, id, body.summary);
    return apiSuccess(recordDay, ctx.traceId);
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
    const { error } = await supabase
      .from('record_days')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`删除记录日失败: ${error.message}`);
    }

    return apiSuccess({ id }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
