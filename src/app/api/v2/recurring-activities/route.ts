import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import {
  listRecurringActivities,
  createRecurringActivity,
} from '@/lib/db/recurring-activities';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { CreateRecurringActivityPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const result = await listRecurringActivities(userId);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: CreateRecurringActivityPayload = await request.json();
    if (!body.name?.trim()) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'name 为必填', ctx.traceId, 400);
    }
    const result = await createRecurringActivity(userId, body);
    return apiSuccess(result, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
