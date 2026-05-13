import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { handleApiError } from '@/lib/api/error-handler';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { createRecordSafely } from '@/lib/domain/record-service';
import { persistTraceSummary } from '@/lib/observability/trace';
import { getInputById, listInputUnits, updateInput, updateInputUnit } from '@/lib/db/inputs';
import type { SkipInputPayload } from '@/types/inputs';
import type { CreateRecordPayload } from '@/types/teto';
import { resolveRecordContentSummary, resolveTemporalFields } from '@/lib/utils/record-unit-mapper';

function normalizeType(value: unknown): CreateRecordPayload['type'] {
  if (value === '发生' || value === '计划' || value === '想法' || value === '总结') return value;
  return '发生';
}

function toRecordInputSource(
  source: 'quick' | 'edit' | 'import' | 'api'
): CreateRecordPayload['input_source'] {
  if (source === 'quick' || source === 'edit' || source === 'import') return source;
  return 'manual';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();
    const { id } = await params;
    const body = (await request.json()) as SkipInputPayload;

    if (!body?.unit_id || !body?.field) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'unit_id 和 field 为必填字段', ctx.traceId, 400);
    }

    const input = await getInputById(userId, id);
    if (!input) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, 'input 不存在', ctx.traceId, 404);
    }

    const units = await listInputUnits(userId, id);
    const target = units.find((u) => u.id === body.unit_id);
    if (!target) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, 'unit 不存在', ctx.traceId, 404);
    }

    const decision = (target.classifier_decision ?? {}) as Record<string, unknown>;
    const proposedFields = { ...((decision.proposed_fields ?? {}) as Record<string, unknown>) };
    const seedFields = { ...((decision.seed_fields ?? {}) as Record<string, unknown>) };
    delete proposedFields[body.field];

    const answered = [
      ...(target.answered_questions ?? []),
      { field: body.field, answer: null, at: new Date().toISOString(), via: 'skip' as const },
    ];

    const date = (input.metadata?.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const normalizedType = normalizeType(proposedFields.type);
    const temporal = resolveTemporalFields(date, normalizedType, proposedFields);
    const payload: CreateRecordPayload = {
      content: resolveRecordContentSummary(proposedFields, target.parsed_semantic, [
        decision.content_summary as string | undefined,
        target.unit_text,
        input.raw_input,
      ]),
      date: temporal.recordDate,
      type: normalizedType,
      parsed_semantic: (target.parsed_semantic as CreateRecordPayload['parsed_semantic']) ?? null,
      input_id: target.unit_index === 0 ? input.id : `${input.id}-${target.unit_index}`,
      parent_input_id: target.unit_index === 0 ? null : input.id,
      input_unit_id: target.id,
      input_source: toRecordInputSource(input.source),
      review_status: 'unchecked',
      confidence_level: 'low',
      record_quality_tag: 'partial',
      ...(proposedFields as Partial<CreateRecordPayload>),
      ...(seedFields as Partial<CreateRecordPayload>),
      ...(temporal.anchorDate && !proposedFields.time_anchor_date
        ? { time_anchor_date: temporal.anchorDate }
        : {}),
      ...(temporal.occurredAt && !proposedFields.occurred_at
        ? { occurred_at: temporal.occurredAt }
        : {}),
      ...(temporal.occurredAtEnd && !proposedFields.occurred_at_end
        ? { occurred_at_end: temporal.occurredAtEnd }
        : {}),
    };

    const result = await createRecordSafely({ userId, payload, supabase, traceId: ctx.traceId });
    if (!result.ok || !result.data) {
      return apiError(
        ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
        result.errors.map((e) => e.message).join('; ') || '创建记录失败',
        ctx.traceId,
        400
      );
    }

    const updatedUnit = await updateInputUnit(userId, target.id, {
      answered_questions: answered,
      status: 'partial',
      promoted_record_id: result.data.id,
      pending_question: null,
      clarify_round: (target.clarify_round ?? 0) + 1,
      classifier_decision: { ...decision, proposed_fields: proposedFields },
    });

    const latestUnits = await listInputUnits(userId, id);
    const promotedCount = latestUnits.filter((u) => u.promoted_record_id).length;
    const hasPending = latestUnits.some((u) => u.status === 'pending_clarify');
    await updateInput(userId, input.id, {
      promoted_record_count: promotedCount,
      status: hasPending ? 'clarifying' : 'partial',
    });

    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_skip',
      status: 'partial',
      inputSummary: input.raw_input.slice(0, 200),
      outputSummary: `partial_record_id=${result.data.id}`,
    });

    const nextUnit = latestUnits.find((u) => u.status === 'pending_clarify' && u.pending_question) ?? null;
    const next = nextUnit
      ? { unit_id: nextUnit.id, question: nextUnit.pending_question! }
      : null;

    return apiSuccess(
      {
        input_status: hasPending ? 'clarifying' : 'partial',
        unit: updatedUnit,
        next,
        promoted_record_id: result.data.id,
      },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}

