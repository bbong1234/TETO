import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import {
  createFinanceAccount,
  listFinanceAccounts,
  attachBalancesToAccounts,
  fetchFinanceRecordsForYear,
  computeTotalAssets,
} from '@/lib/db/finance-accounts';
import { getWalletPeriodRanges } from '@/lib/computation/runtime/period-ranges';
import { fmtLocalDate } from '@/lib/computation/runtime/helpers';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import type { CreateFinanceAccountPayload, FinanceAccountType } from '@/types/teto';
import { FINANCE_ACCOUNT_TYPES } from '@/types/teto';

/** GET /api/v2/finance-accounts */
export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('include_archived') === 'true';
    const withBalance = searchParams.get('with_balance') === 'true';

    const accounts = await listFinanceAccounts(userId, { includeArchived });
    if (!withBalance) {
      return apiSuccess(accounts, ctx.traceId);
    }

    const todayStr = fmtLocalDate(new Date());
    const yearRange = getWalletPeriodRanges(todayStr).find((r) => r.period === 'year');
    if (!yearRange) return apiSuccess(accounts, ctx.traceId);

    const rows = await fetchFinanceRecordsForYear(userId, yearRange.date_from, yearRange.date_to);
    const withBalances = attachBalancesToAccounts(accounts, rows);
    return apiSuccess(
      { accounts: withBalances, total_assets: computeTotalAssets(withBalances) },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/v2/finance-accounts */
export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: CreateFinanceAccountPayload = await request.json();
    if (!body.name?.trim()) {
      return apiError('VALIDATION_ERROR', '账户名称不能为空', ctx.traceId, 400);
    }
    if (!FINANCE_ACCOUNT_TYPES.includes(body.account_type as FinanceAccountType)) {
      return apiError('VALIDATION_ERROR', '账户类型无效', ctx.traceId, 400);
    }
    const account = await createFinanceAccount(userId, body);
    return apiSuccess(account, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
