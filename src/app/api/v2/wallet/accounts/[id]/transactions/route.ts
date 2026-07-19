import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getAccountTransactions } from '@/lib/db/wallet';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

/** GET /api/v2/wallet/accounts/[id]/transactions */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from') ?? undefined;
    const dateTo = searchParams.get('date_to') ?? undefined;

    const transactions = await getAccountTransactions(userId, id, dateFrom, dateTo);
    return apiSuccess(transactions, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
