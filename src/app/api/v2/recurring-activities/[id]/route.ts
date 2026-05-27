import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import {
  updateRecurringActivity,
  deleteRecurringActivity,
} from '@/lib/db/recurring-activities';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { UpdateRecurringActivityPayload } from '@/types/teto';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateRecurringActivityPayload = await request.json();

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('recurring_activities')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '常用事项不存在', ctx.traceId, 404);
    }

    const result = await updateRecurringActivity(userId, id, body);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('recurring_activities')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '常用事项不存在', ctx.traceId, 404);
    }

    await deleteRecurringActivity(userId, id);
    return apiSuccess({ id }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
