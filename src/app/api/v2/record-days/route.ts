import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getOrCreateRecordDay, getRecordDayByDate, updateRecordDaySummary } from '@/lib/db/record-days';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export async function GET(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (date) {
      const result = await getRecordDayByDate(userId, date);
      return apiSuccess(result, ctx.traceId);
    }

    // 列出所有记录日
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('record_days')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`获取记录日列表失败: ${error.message}`);
    }

    return apiSuccess(data ?? [], ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const body = await request.json();

    if (!body.date) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date 为必填字段', ctx.traceId, 400);
    }

    let recordDay = await getOrCreateRecordDay(userId, body.date);

    if (body.summary) {
      recordDay = await updateRecordDaySummary(userId, recordDay.id, body.summary);
    }

    return apiSuccess(recordDay, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
