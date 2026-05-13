import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { handleApiError } from '@/lib/api/error-handler';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { getInputById, listInputUnits, updateInput, updateInputUnit } from '@/lib/db/inputs';
import { persistTraceSummary } from '@/lib/observability/trace';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = await getInputById(userId, id);
    if (!input) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, 'input 不存在', ctx.traceId, 404);
    }

    const units = await listInputUnits(userId, id);
    for (const unit of units) {
      if (unit.status === 'pending_clarify' || unit.status === 'ready') {
        await updateInputUnit(userId, unit.id, {
          status: 'cancelled',
          pending_question: null,
          clarify_round: (unit.clarify_round ?? 0) + 1,
        });
      }
    }

    const updated = await updateInput(userId, input.id, { status: 'cancelled' });
    const supabase = await createClient();
    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_cancel',
      status: 'ok',
      inputSummary: input.id,
      outputSummary: `units=${units.length}`,
    });
    return apiSuccess({ input: updated }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

