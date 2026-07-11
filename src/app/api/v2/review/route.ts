import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { computeReviewSummary, computeAllReviewSummaries } from '@/lib/db/review';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import type { ReviewPeriod } from '@/types/teto';

const VALID_PERIODS: ReviewPeriod[] = ['day', 'week', 'month'];

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const period = request.nextUrl.searchParams.get('period');

    if (!period) {
      const summaries = await computeAllReviewSummaries(userId);
      return apiSuccess(summaries, ctx.traceId);
    }

    if (!VALID_PERIODS.includes(period as ReviewPeriod)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'period 无效', ctx.traceId);
    }

    const summary = await computeReviewSummary(userId, period as ReviewPeriod);
    return apiSuccess(summary, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
