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
    if (target.status !== 'pending_clarify' && target.status !== 'ready') {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '该 unit 当前状态不可回答', ctx.traceId, 400);
    }

    const mergedAnswer = coerceAnswer(body.field, body.answer);
    const answered = [
      ...(target.answered_questions ?? []),
      { field: body.field, answer: mergedAnswer as string | number | null, at: new Date().toISOString(), via: 'user' as const },
    ];

    const decision = (target.classifier_decision ?? {}) as Record<string, unknown>;
    const proposedFields = { ...((decision.proposed_fields ?? {}) as Record<string, unknown>) };
    const seedFields = { ...((decision.seed_fields ?? {}) as Record<string, unknown>) };
    if (body.field !== '_confirm') {
      if (body.field.startsWith('metric:')) {
        proposedFields.metric_name = body.field.slice('metric:'.length);
        proposedFields.metric_value = mergedAnswer;
      } else {
        proposedFields[body.field] = mergedAnswer;
      }
    }

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
        {
          input_status: 'cancelled',
          unit: cancelledUnit,
          next: null,
          promoted_record_id: null,
        },
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
    const splitConfirmed =
      body.field === '_confirm' &&
      (body.answer === 'split' || (body.answer === 'confirm' && pendingQ?.clarify_class !== 'compound_confirm'));
    const keepSingle = body.field === '_confirm' && body.answer === 'keep_single';

    const primaryId =
      typeof (input.metadata as Record<string, unknown>)?.primary_unit_id === 'string'
        ? ((input.metadata as Record<string, unknown>).primary_unit_id as string)
        : target.id;
    const promoteUnit = keepSingle ? (units.find((u) => u.id === primaryId) ?? target) : target;

    const proposalSource = keepSingle ? promoteUnit : target;
    const proposalDecision = (proposalSource.classifier_decision ?? {}) as Record<string, unknown>;
    const proposalFields = { ...((proposalDecision.proposed_fields ?? {}) as Record<string, unknown>) };
    const proposalSeeds = { ...((proposalDecision.seed_fields ?? {}) as Record<string, unknown>) };

    const batchId = splitConfirmed ? crypto.randomUUID() : null;
    const targetType = normalizeType(proposalFields.type);
    const targetTemporal = resolveTemporalFields(date, targetType, proposalFields);
    const payload: CreateRecordPayload = {
      content: keepSingle
        ? input.raw_input
        : resolveRecordContentSummary(proposalFields, proposalSource.parsed_semantic, [
            proposalDecision.content_summary as string | undefined,
            proposalSource.unit_text,
            input.raw_input,
          ]),
      date: targetTemporal.recordDate,
      type: targetType,
      parsed_semantic: (proposalSource.parsed_semantic as CreateRecordPayload['parsed_semantic']) ?? null,
      input_id: promoteUnit.unit_index === 0 ? input.id : `${input.id}-${promoteUnit.unit_index}`,
      parent_input_id: promoteUnit.unit_index === 0 ? null : input.id,
      input_unit_id: promoteUnit.id,
      batch_id: batchId,
      input_source: toRecordInputSource(input.source),
      review_status: 'confirmed',
      confidence_level: 'medium',
      record_quality_tag: 'clarified',
      ...(proposalFields as Partial<CreateRecordPayload>),
      ...(proposalSeeds as Partial<CreateRecordPayload>),
      ...(targetTemporal.anchorDate && !proposalFields.time_anchor_date
        ? { time_anchor_date: targetTemporal.anchorDate }
        : {}),
      ...(targetTemporal.occurredAt && !proposalFields.occurred_at
        ? { occurred_at: targetTemporal.occurredAt }
        : {}),
      ...(targetTemporal.occurredAtEnd && !proposalFields.occurred_at_end
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
        classifier_decision: {
          ...proposalDecision,
          proposed_fields: proposalFields,
        },
      });
      updatedUnit = (await getInputUnitById(userId, promoteUnit.id)) ?? promoteUnit;
    } else {
      updatedUnit = await updateInputUnit(userId, target.id, {
        answered_questions: answered,
        status: 'promoted',
        promoted_record_id: result.data.id,
        pending_question: null,
        clarify_round: (target.clarify_round ?? 0) + 1,
        classifier_decision: { ...proposalDecision, proposed_fields: proposalFields },
      });
    }

    // 复合句确认：将同一 input 里所有 ready 状态（尚未提升）的 units 一并入库
    const allPromotedIds: string[] = [result.data.id];
    if (splitConfirmed) {
      const freshForBatch = await listInputUnits(userId, id);
      const readyUnits = freshForBatch.filter(
        (u) => u.status === 'ready' && !u.promoted_record_id && u.id !== promoteUnit.id
      );
      for (const ru of readyUnits) {
        const ruDecision = (ru.classifier_decision ?? {}) as Record<string, unknown>;
        const ruProposed = { ...((ruDecision.proposed_fields ?? {}) as Record<string, unknown>) };
        const ruSeed = { ...((ruDecision.seed_fields ?? {}) as Record<string, unknown>) };
        const ruType = normalizeType(ruProposed.type);
        const ruTemporal = resolveTemporalFields(date, ruType, ruProposed);
        const ruPayload: CreateRecordPayload = {
          content: resolveRecordContentSummary(ruProposed, ru.parsed_semantic, [
            ruDecision.content_summary as string | undefined,
            ru.unit_text,
            input.raw_input,
          ]),
          date: ruTemporal.recordDate,
          type: ruType,
          parsed_semantic: (ru.parsed_semantic as CreateRecordPayload['parsed_semantic']) ?? null,
          input_id: ru.unit_index === 0 ? input.id : `${input.id}-${ru.unit_index}`,
          parent_input_id: ru.unit_index === 0 ? null : input.id,
          input_unit_id: ru.id,
          batch_id: batchId,
          input_source: toRecordInputSource(input.source),
          review_status: 'confirmed',
          confidence_level: 'medium',
          record_quality_tag: 'clarified',
          ...(ruProposed as Partial<CreateRecordPayload>),
          ...(ruSeed as Partial<CreateRecordPayload>),
          ...(ruTemporal.anchorDate && !ruProposed.time_anchor_date
            ? { time_anchor_date: ruTemporal.anchorDate }
            : {}),
          ...(ruTemporal.occurredAt && !ruProposed.occurred_at
            ? { occurred_at: ruTemporal.occurredAt }
            : {}),
          ...(ruTemporal.occurredAtEnd && !ruProposed.occurred_at_end
            ? { occurred_at_end: ruTemporal.occurredAtEnd }
            : {}),
        };
        const ruResult = await createRecordSafely({ userId, payload: ruPayload, supabase, traceId: ctx.traceId });
        if (ruResult.ok && ruResult.data) {
          allPromotedIds.push(ruResult.data.id);
          await updateInputUnit(userId, ru.id, {
            status: 'promoted',
            promoted_record_id: ruResult.data.id,
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

    // 复合句拆分后的记录建立 derived_from 关联（从子记录指向首条）
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
        // 关联失败不阻断主链路，避免用户确认后看不到记录
        console.warn('[inputs_answer] create split links failed:', linkErr.message);
      }
    }

    const latestUnits = await listInputUnits(userId, id);
    const promotedCount = latestUnits.filter((u) => u.status === 'promoted').length;
    const hasPending = latestUnits.some((u) => u.status === 'pending_clarify');
    await updateInput(userId, input.id, {
      promoted_record_count: promotedCount,
      status: hasPending ? 'clarifying' : 'completed',
    });

    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_answer',
      status: hasPending ? 'partial' : 'ok',
      inputSummary: input.raw_input.slice(0, 200),
      outputSummary: `promoted_record_ids=[${allPromotedIds.join(',')}]`,
    });

    const nextUnit = latestUnits.find((u) => u.status === 'pending_clarify' && u.pending_question) ?? null;
    const next = nextUnit
      ? { unit_id: nextUnit.id, question: nextUnit.pending_question! }
      : null;

    return apiSuccess(
      {
        input_status: hasPending ? 'clarifying' : 'completed',
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

