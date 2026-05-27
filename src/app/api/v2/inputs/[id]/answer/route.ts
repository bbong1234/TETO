import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { handleApiError } from '@/lib/api/error-handler';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { createRecordSafely } from '@/lib/domain/record-service';
import { persistTraceSummary } from '@/lib/observability/trace';
import { getInputById, getInputUnitById, listInputUnits, updateInput, updateInputUnit } from '@/lib/db/inputs';
import type { AnswerInputPayload, PendingQuestion } from '@/types/inputs';
import type { CreateRecordPayload } from '@/types/teto';
import type { ClarificationIssue } from '@/types/semantic';
import { buildPrimaryQuestionAfterCompound, unitHasNonCompoundIssues } from '@/lib/ingest/clarification-planner';
import { sanitizeProposedForRecord } from '@/lib/ingest/admission';
import {
  applyInteractionToProposed,
  ensureNextQuestion,
  evaluateAdmission,
  isCompoundGated,
  mergeProposedFields,
  nextQuestionForUnit,
  resolveIssuesAfterInteraction,
} from '@/lib/ingest/clarify-flow';
import { resolveRecordContentSummary, resolveTemporalFields } from '@/lib/utils/record-unit-mapper';
import type { Input, InputUnit } from '@/types/inputs';

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

function readClarificationIssues(input: Input): ClarificationIssue[] {
  const raw = (input.metadata as Record<string, unknown> | undefined)?.clarification_issues;
  return Array.isArray(raw) ? (raw as ClarificationIssue[]) : [];
}

async function promoteInputUnitRecord(params: {
  userId: string;
  input: Input;
  unit: InputUnit;
  supabase: Awaited<ReturnType<typeof createClient>>;
  traceId: string;
  date: string;
  batchId: string | null;
  mergedProposed?: Record<string, unknown>;
}): Promise<{ ok: true; recordId: string } | { ok: false; message: string }> {
  const { userId, input, unit, supabase, traceId, date, batchId, mergedProposed } = params;
  const decision = (unit.classifier_decision ?? {}) as Record<string, unknown>;
  const proposed = sanitizeProposedForRecord(
    mergedProposed ?? {
      ...((decision.proposed_fields ?? {}) as Record<string, unknown>),
    }
  );
  const seed = { ...((decision.seed_fields ?? {}) as Record<string, unknown>) };
  const ruType = normalizeType(proposed.type);
  const temporal = resolveTemporalFields(date, ruType, proposed);
  const payload: CreateRecordPayload = {
    content: resolveRecordContentSummary(proposed, unit.parsed_semantic, [
      decision.content_summary as string | undefined,
      unit.unit_text,
      input.raw_input,
    ]),
    date: temporal.recordDate,
    type: ruType,
    parsed_semantic: (unit.parsed_semantic as CreateRecordPayload['parsed_semantic']) ?? null,
    input_id: unit.unit_index === 0 ? input.id : `${input.id}-${unit.unit_index}`,
    parent_input_id: unit.unit_index === 0 ? null : input.id,
    input_unit_id: unit.id,
    batch_id: batchId,
    input_source: toRecordInputSource(input.source),
    review_status: 'confirmed',
    confidence_level: 'medium',
    record_quality_tag: 'clarified',
    ...(proposed as Partial<CreateRecordPayload>),
    ...(seed as Partial<CreateRecordPayload>),
    ...(temporal.anchorDate && !proposed.time_anchor_date ? { time_anchor_date: temporal.anchorDate } : {}),
    ...(temporal.occurredAt && !proposed.occurred_at ? { occurred_at: temporal.occurredAt } : {}),
    ...(temporal.occurredAtEnd && !proposed.occurred_at_end
      ? { occurred_at_end: temporal.occurredAtEnd }
      : {}),
  };
  const result = await createRecordSafely({ userId, payload, supabase, traceId });
  if (!result.ok || !result.data) {
    return {
      ok: false,
      message: result.errors.map((e) => e.message).join('; ') || '创建记录失败',
    };
  }
  return { ok: true, recordId: result.data.id };
}

function coerceAnswer(field: string, answer: unknown): unknown {
  if (
    field === 'duration_minutes' ||
    field === 'metric_value' ||
    field === 'cost' ||
    field.startsWith('metric:')
  ) {
    const n = Number(answer);
    return Number.isFinite(n) ? n : null;
  }
  return answer;
}

async function syncInputStatus(userId: string, inputId: string) {
  const latestUnits = await listInputUnits(userId, inputId);
  const promotedCount = latestUnits.filter((u) => u.status === 'promoted').length;
  const hasPending = latestUnits.some((u) => u.status === 'pending_clarify');
  await updateInput(userId, inputId, {
    promoted_record_count: promotedCount,
    status: hasPending ? 'clarifying' : 'completed',
  });
  return latestUnits;
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
    const body = (await request.json()) as AnswerInputPayload;

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
    const answerableStatuses = new Set(['pending_clarify', 'ready', 'partial']);
    if (!answerableStatuses.has(target.status)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '该 unit 当前状态不可回答', ctx.traceId, 400);
    }

    const mergedAnswer = coerceAnswer(body.field, body.answer);
    const answered = [
      ...(target.answered_questions ?? []),
      {
        field: body.field,
        answer: mergedAnswer as string | number | null,
        at: new Date().toISOString(),
        via: 'user' as const,
      },
    ];

    const decision = (target.classifier_decision ?? {}) as Record<string, unknown>;
    let mergedProposed = applyInteractionToProposed(
      mergeProposedFields(decision, {}),
      body.field,
      'answer',
      mergedAnswer
    );

    if (body.field === '_confirm' && (body.answer === 'cancel' || body.answer === 'rewrite')) {
      for (const u of units) {
        if (u.status === 'promoted') continue;
        if (u.id === target.id) {
          await updateInputUnit(userId, u.id, {
            answered_questions: answered,
            status: 'cancelled',
            pending_question: null,
            clarify_round: (u.clarify_round ?? 0) + 1,
          });
        } else {
          await updateInputUnit(userId, u.id, {
            status: 'cancelled',
            pending_question: null,
          });
        }
      }
      await updateInput(userId, input.id, { status: 'cancelled' });
      const cancelledUnit = (await getInputUnitById(userId, target.id)) ?? target;
      return apiSuccess(
        { input_status: 'cancelled', unit: cancelledUnit, next: null, promoted_record_id: null },
        ctx.traceId
      );
    }

    if (body.field === '_confirm' && body.answer === 'defer') {
      return apiSuccess(
        {
          input_status: input.status,
          unit: target,
          next: null,
          promoted_record_id: null,
          promoted_record_ids: [],
          deferred: true,
          deferred_input_id: input.id,
        },
        ctx.traceId
      );
    }

    const date = (input.metadata?.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const pendingQ = target.pending_question as PendingQuestion | null | undefined;
    const splitConfirmed = body.field === '_confirm' && body.answer === 'split';
    const keepSingle = body.field === '_confirm' && body.answer === 'keep_single';
    const forcedFieldConfirm =
      body.field === '_confirm' &&
      body.answer === 'confirm' &&
      pendingQ?.clarify_class !== 'compound_confirm';

    const primaryId =
      typeof (input.metadata as Record<string, unknown>)?.primary_unit_id === 'string'
        ? ((input.metadata as Record<string, unknown>).primary_unit_id as string)
        : target.id;
    const promoteUnit = keepSingle ? (units.find((u) => u.id === primaryId) ?? target) : target;

    let issueList = resolveIssuesAfterInteraction(
      readClarificationIssues(input),
      target.unit_index,
      body.field,
      'answer',
      mergedAnswer
    );

    const compoundGated = isCompoundGated(units, { field: body.field, answer: mergedAnswer });

    const existingSplitBatch =
      typeof (input.metadata as Record<string, unknown>)?.split_batch_id === 'string'
        ? ((input.metadata as Record<string, unknown>).split_batch_id as string)
        : null;
    const batchId = existingSplitBatch ?? (splitConfirmed ? crypto.randomUUID() : null);

    const splitDeferPrimary =
      splitConfirmed && unitHasNonCompoundIssues(issueList, promoteUnit.unit_index);

    if (splitDeferPrimary && batchId) {
      await updateInputUnit(userId, target.id, {
        answered_questions: answered,
        clarify_round: (target.clarify_round ?? 0) + 1,
        classifier_decision: { ...decision, proposed_fields: mergedProposed },
      });

      const allPromotedIds: string[] = [];
      const freshForBatch = await listInputUnits(userId, id);
      const readyUnits = freshForBatch.filter(
        (u) => u.status === 'ready' && !u.promoted_record_id && u.id !== promoteUnit.id
      );
      for (const ru of readyUnits) {
        const ruDecision = (ru.classifier_decision ?? {}) as Record<string, unknown>;
        const ruProposed = (ruDecision.proposed_fields ?? {}) as Record<string, unknown>;
        const admission = evaluateAdmission({
          unitIndex: ru.unit_index,
          issues: issueList,
          proposedFields: ruProposed,
          parsedSemantic: ru.parsed_semantic,
          compoundGated: true,
        });
        if (!admission.allowed) {
          const ruNext = ensureNextQuestion(issueList, ru.unit_index, true, admission);
          if (ruNext) {
            await updateInputUnit(userId, ru.id, {
              status: 'pending_clarify',
              pending_question: ruNext,
            });
          }
          continue;
        }

        const promoted = await promoteInputUnitRecord({
          userId,
          input,
          unit: ru,
          supabase,
          traceId: ctx.traceId,
          date,
          batchId,
          mergedProposed: ruProposed,
        });
        if (promoted.ok) {
          allPromotedIds.push(promoted.recordId);
          await updateInputUnit(userId, ru.id, {
            status: 'promoted',
            promoted_record_id: promoted.recordId,
            pending_question: null,
          });
        }
      }

      const followUpQ = buildPrimaryQuestionAfterCompound(issueList, promoteUnit.unit_index);
      const promoteDecision = (promoteUnit.classifier_decision ?? {}) as Record<string, unknown>;
      const promoteProposed =
        promoteUnit.id === target.id
          ? mergedProposed
          : mergeProposedFields(promoteDecision, {});

      const updatedUnit = await updateInputUnit(userId, promoteUnit.id, {
        status: followUpQ ? 'pending_clarify' : promoteUnit.status,
        pending_question: followUpQ,
        classifier_decision: { ...promoteDecision, proposed_fields: promoteProposed },
      });

      await updateInput(userId, input.id, {
        status: 'clarifying',
        metadata: {
          ...(input.metadata as Record<string, unknown>),
          clarification_issues: issueList,
          split_batch_id: batchId,
        },
      });

      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_answer',
        status: 'partial',
        inputSummary: input.raw_input.slice(0, 200),
        outputSummary: `split_deferred_primary; promoted=[${allPromotedIds.join(',')}]`,
      });

      const next = followUpQ ? { unit_id: promoteUnit.id, question: followUpQ } : null;
      return apiSuccess(
        {
          input_status: 'clarifying',
          unit: updatedUnit,
          next,
          promoted_record_id: allPromotedIds[0] ?? null,
          promoted_record_ids: allPromotedIds,
        },
        ctx.traceId
      );
    }

    if (promoteUnit.id === target.id) {
      mergedProposed = applyInteractionToProposed(
        mergeProposedFields((promoteUnit.classifier_decision ?? {}) as Record<string, unknown>, {}),
        body.field,
        'answer',
        mergedAnswer
      );
    } else {
      const promoteDecision = (promoteUnit.classifier_decision ?? {}) as Record<string, unknown>;
      mergedProposed = mergeProposedFields(promoteDecision, {});
    }

    await updateInput(userId, input.id, {
      metadata: {
        ...(input.metadata as Record<string, unknown>),
        clarification_issues: issueList,
        ...(batchId ? { split_batch_id: batchId } : {}),
      },
    });

    const admission = evaluateAdmission({
      unitIndex: promoteUnit.unit_index,
      issues: issueList,
      proposedFields: mergedProposed,
      parsedSemantic: promoteUnit.parsed_semantic,
      compoundGated,
      allowForcedConfirm: forcedFieldConfirm,
    });

    if (!admission.allowed) {
      const nextQ = ensureNextQuestion(
        issueList,
        promoteUnit.unit_index,
        compoundGated,
        admission
      );
      if (!nextQ) {
        return apiError(
          ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
          admission.reason ?? '信息尚未达到入库标准，请补充或取消本次录入',
          ctx.traceId,
          400
        );
      }
      const updatedUnit = await updateInputUnit(userId, target.id, {
        answered_questions: answered,
        status: 'pending_clarify',
        pending_question: nextQ,
        clarify_round: (target.clarify_round ?? 0) + 1,
        classifier_decision: { ...decision, proposed_fields: mergedProposed },
      });
      await updateInput(userId, input.id, { status: 'clarifying' });

      return apiSuccess(
        {
          input_status: 'clarifying',
          unit: updatedUnit,
          next: { unit_id: target.id, question: nextQ },
          promoted_record_id: null,
          promoted_record_ids: [],
        },
        ctx.traceId
      );
    }

    const proposalDecision = (promoteUnit.classifier_decision ?? {}) as Record<string, unknown>;
    const proposalSeeds = { ...((proposalDecision.seed_fields ?? {}) as Record<string, unknown>) };
    const recordFields = sanitizeProposedForRecord(mergedProposed);
    const targetType = normalizeType(recordFields.type);
    const targetTemporal = resolveTemporalFields(date, targetType, recordFields);
    const payload: CreateRecordPayload = {
      content: keepSingle
        ? input.raw_input
        : resolveRecordContentSummary(recordFields, promoteUnit.parsed_semantic, [
            proposalDecision.content_summary as string | undefined,
            promoteUnit.unit_text,
            input.raw_input,
          ]),
      date: targetTemporal.recordDate,
      type: targetType,
      parsed_semantic: (promoteUnit.parsed_semantic as CreateRecordPayload['parsed_semantic']) ?? null,
      input_id: promoteUnit.unit_index === 0 ? input.id : `${input.id}-${promoteUnit.unit_index}`,
      parent_input_id: promoteUnit.unit_index === 0 ? null : input.id,
      input_unit_id: promoteUnit.id,
      batch_id: batchId,
      input_source: toRecordInputSource(input.source),
      review_status: 'confirmed',
      confidence_level: 'medium',
      record_quality_tag: 'clarified',
      ...(recordFields as Partial<CreateRecordPayload>),
      ...(proposalSeeds as Partial<CreateRecordPayload>),
      ...(targetTemporal.anchorDate && !recordFields.time_anchor_date
        ? { time_anchor_date: targetTemporal.anchorDate }
        : {}),
      ...(targetTemporal.occurredAt && !recordFields.occurred_at
        ? { occurred_at: targetTemporal.occurredAt }
        : {}),
      ...(targetTemporal.occurredAtEnd && !recordFields.occurred_at_end
        ? { occurred_at_end: targetTemporal.occurredAtEnd }
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

    let updatedUnit: typeof target;
    if (keepSingle && promoteUnit.id !== target.id) {
      await updateInputUnit(userId, target.id, {
        answered_questions: answered,
        status: 'cancelled',
        pending_question: null,
        clarify_round: (target.clarify_round ?? 0) + 1,
      });
      await updateInputUnit(userId, promoteUnit.id, {
        status: 'promoted',
        promoted_record_id: result.data.id,
        pending_question: null,
        classifier_decision: { ...proposalDecision, proposed_fields: mergedProposed },
      });
      updatedUnit = (await getInputUnitById(userId, promoteUnit.id)) ?? promoteUnit;
    } else {
      updatedUnit = await updateInputUnit(userId, target.id, {
        answered_questions: answered,
        status: 'promoted',
        promoted_record_id: result.data.id,
        pending_question: null,
        clarify_round: (target.clarify_round ?? 0) + 1,
        classifier_decision: { ...decision, proposed_fields: mergedProposed },
      });
    }

    const allPromotedIds: string[] = [result.data.id];
    if (splitConfirmed && batchId) {
      const freshForBatch = await listInputUnits(userId, id);
      const readyUnits = freshForBatch.filter(
        (u) => u.status === 'ready' && !u.promoted_record_id && u.id !== promoteUnit.id
      );
      for (const ru of readyUnits) {
        const ruDecision = (ru.classifier_decision ?? {}) as Record<string, unknown>;
        const ruProposed = (ruDecision.proposed_fields ?? {}) as Record<string, unknown>;
        const ruAdmission = evaluateAdmission({
          unitIndex: ru.unit_index,
          issues: issueList,
          proposedFields: ruProposed,
          parsedSemantic: ru.parsed_semantic,
          compoundGated: true,
        });
        if (!ruAdmission.allowed) {
          const ruNext = ensureNextQuestion(issueList, ru.unit_index, true, ruAdmission);
          if (ruNext) {
            await updateInputUnit(userId, ru.id, {
              status: 'pending_clarify',
              pending_question: ruNext,
            });
          }
          continue;
        }
        const promoted = await promoteInputUnitRecord({
          userId,
          input,
          unit: ru,
          supabase,
          traceId: ctx.traceId,
          date,
          batchId,
          mergedProposed: ruProposed,
        });
        if (promoted.ok) {
          allPromotedIds.push(promoted.recordId);
          await updateInputUnit(userId, ru.id, {
            status: 'promoted',
            promoted_record_id: promoted.recordId,
            pending_question: null,
          });
        }
      }
    }

    if (keepSingle) {
      const freshForSingle = await listInputUnits(userId, id);
      const restUnits = freshForSingle.filter(
        (u) => u.id !== promoteUnit.id && u.status !== 'promoted'
      );
      for (const ru of restUnits) {
        await updateInputUnit(userId, ru.id, {
          status: 'cancelled',
          pending_question: null,
        });
      }
    }

    if (allPromotedIds.length > 1) {
      const mainRecordId = allPromotedIds[0];
      const linkRows = allPromotedIds.slice(1).map((rid) => ({
        user_id: userId,
        source_id: rid,
        target_id: mainRecordId,
        link_type: 'derived_from' as const,
      }));
      const { error: linkErr } = await supabase.from('record_links').insert(linkRows);
      if (linkErr) {
        console.warn('[inputs_answer] create split links failed:', linkErr.message);
      }
    }

    const latestUnits = await syncInputStatus(userId, input.id);

    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_answer',
      status: latestUnits.some((u) => u.status === 'pending_clarify') ? 'partial' : 'ok',
      inputSummary: input.raw_input.slice(0, 200),
      outputSummary: `promoted_record_ids=[${allPromotedIds.join(',')}]`,
    });

    const nextUnit =
      latestUnits.find((u) => u.status === 'pending_clarify' && u.pending_question) ?? null;
    const next = nextUnit
      ? { unit_id: nextUnit.id, question: nextUnit.pending_question! }
      : null;

    return apiSuccess(
      {
        input_status: latestUnits.some((u) => u.status === 'pending_clarify') ? 'clarifying' : 'completed',
        unit: updatedUnit,
        next,
        promoted_record_id: result.data.id,
        promoted_record_ids: allPromotedIds,
      },
      ctx.traceId
    );
  } catch (error) {
    return handleApiError(error);
  }
}
