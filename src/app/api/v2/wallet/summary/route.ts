import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getWalletSummary } from '@/lib/db/wallet';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';
import type { WalletPeriodKey } from '@/types/teto';

function parseDetailPeriod(raw: string | null): WalletPeriodKey {
  if (raw === 'week' || raw === 'month' || raw === 'year') return raw;
  return 'today';
}

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const detailPeriod = parseDetailPeriod(searchParams.get('detail_period'));
    const accountId = searchParams.get('account_id');

    const result = await getWalletSummary(
      userId,
      detailPeriod,
      accountId || null
    );
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
