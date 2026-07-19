import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listTopLevelExplorerSummaries } from '@/lib/db/item-record-explorer';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const summaries = await listTopLevelExplorerSummaries(userId);
    return apiSuccess(summaries, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
