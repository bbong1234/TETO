import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { handleApiError } from '@/lib/api/error-handler';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { getInputById } from '@/lib/db/inputs';
import { ingestFull } from '@/lib/ingest/pipeline';
import { buildPrimaryQuestion } from '@/lib/ingest/clarification-planner';
import { createClient } from '@/lib/supabase/server';
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

    const date = (input.metadata?.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const { classification, proposals } = await ingestFull({
      userId,
      rawInput: input.raw_input,
      date,
      traceId: ctx.traceId,
    });

    const pending = classification.clarification
      ? classification.unitProposals
          .map((unit, idx) => ({
            unitIndex: unit.unitIndex,
            question: buildPrimaryQuestion(classification.clarification!.issues, idx),
          }))
          .find((p) => p.question)?.question ?? null
      : null;

    const supabase = await createClient();
    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_reparse',
      status: 'ok',
      inputSummary: input.raw_input.slice(0, 200),
      outputSummary: `needs_confirmation=${classification.needsConfirmation},units=${classification.unitsCount}`,
    });

    return apiSuccess(
      {
        input_id: input.id,
        needs_confirmation: classification.needsConfirmation,
        units_count: classification.unitsCount,
        pending_question: pending,
        proposals: proposals.map((p) => ({
          unit_index: p.unitIndex,
          payload: p.payload,
        })),
      },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}

