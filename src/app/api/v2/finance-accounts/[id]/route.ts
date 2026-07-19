import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateFinanceAccount } from '@/lib/db/finance-accounts';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';
import type { UpdateFinanceAccountPayload } from '@/types/teto';

/** PATCH /api/v2/finance-accounts/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateFinanceAccountPayload = await request.json();
    const account = await updateFinanceAccount(userId, id, body);
    return apiSuccess(account, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
