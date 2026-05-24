import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getCurrentActivity } from '@/lib/db/activities';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const activity = await getCurrentActivity(userId);
    return apiSuccess(activity, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
