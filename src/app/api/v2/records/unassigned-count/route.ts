import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { countUnassignedRecords } from '@/lib/db/records';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const count = await countUnassignedRecords(userId);
    return apiSuccess({ count }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
