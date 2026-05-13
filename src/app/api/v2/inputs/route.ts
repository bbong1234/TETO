import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { persistTraceSummary } from '@/lib/observability/trace';
import { createRecordSafely } from '@/lib/domain/record-service';
import { ingestFull } from '@/lib/ingest/pipeline';
import { buildPrimaryQuestion } from '@/lib/ingest/clarification-planner';
import {
  createInput,
  createInputUnits,
  listInputUnits,
  updateInput,
  updateInputUnit,
} from '@/lib/db/inputs';
import type { CreateRecordPayload } from '@/types/teto';
import type { CreateInputPayload, PendingQuestion, InputUnit } from '@/types/inputs';
import { resolveIngestV2ForServer } from '@/lib/ingest/ingest-v2';
import { createComponentLogger } from '@/lib/observability/logger';
import { resolveRecordContentSummary, resolveTemporalFields } from '@/lib/utils/record-unit-mapper';

const log = createComponentLogger('api-inputs');

function normalizeType(value: unknown): CreateRecordPayload['type'] {
  if (value === '发生' || value === '计划' || value === '想法' || value === '总结') return value;
  return '发生';
}

function toRecordInputSource(source: CreateInputPayload['source']): CreateRecordPayload['input_source'] {
  if (source === 'quick' || source === 'edit' || source === 'import') return source;
  return 'manual';
}

function inferUnitText(rawInput: string, proposalContent: string): string {
  return proposalContent?.trim() ? proposalContent.trim() : rawInput.trim();
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();

    if (!(await resolveIngestV2ForServer(userId))) {
      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_create',
        status: 'failed',
        errorCode: ERROR_CODES.INPUT_INGEST_DISABLED,
        errorMessage: 'ingest v2 disabled',
      });
      return apiError(
        ERROR_CODES.INPUT_INGEST_DISABLED,
        '录入流水线（ingest v2）未启用，请改用记录创建接口或配置环境变量 INGEST_V2 / NEXT_PUBLIC_INGEST_V2，或在 feature_flags 中开启 ingest_v2。',
        ctx.traceId,
        403
      );
    }
    const body = (await request.json()) as CreateInputPayload;

    if (!body?.raw_input?.trim()) {
      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_create',
        status: 'failed',
        errorCode: ERROR_CODES.PARSE_INSUFFICIENT_INFO,
        errorMessage: 'raw_input 为必填字段',
      });
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, 'raw_input 为必填字段', ctx.traceId, 400);
    }

    const rawInput = body.raw_input.trim();
    const date = body.date || new Date().toISOString().slice(0, 10);
    const source: NonNullable<CreateInputPayload['source']> = body.source ?? 'quick';
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    const seedFields = ((metadata.seed_fields ?? {}) as Partial<CreateRecordPayload>) || {};

    const { classification, proposals } = await ingestFull({
      userId,
      rawInput,
      date,
      traceId: ctx.traceId,
    });

    const input = await createInput(userId, {
      raw_input: rawInput,
      source,
      status: classification.needsConfirmation ? 'clarifying' : 'pending',
      trace_id: ctx.traceId,
      total_units: classification.unitsCount,
      promoted_record_count: 0,
      metadata: {
        date,
        is_compound: classification.isCompound,
        ...metadata,
      },
    });

    if (classification.decisions.length > 0) {
      const decisionRows = classification.decisions.map((d) => ({
        decision_id: d.decisionId,
        trace_id: ctx.traceId,
        decision_type: d.type,
        input_summary: d.explain,
        output_summary: JSON.stringify(
          proposals.find((p) => p.unitIndex === d.unitIndex)?.payload ?? {}
        ),
        metadata: { ...(d.detail ?? {}), input_id: input.id },
      }));
      const { error: decErr } = await supabase.from('decision_logs').insert(decisionRows);
      if (decErr) {
        log.warn('决策日志写入失败（非致命）', { details: { error: decErr.message } });
      }
    }

    const unitRows = classification.unitProposals.map((proposal, idx) => {
      const question: PendingQuestion | null = classification.clarification
        ? buildPrimaryQuestion(classification.clarification.issues, idx)
        : null;
      const unitStatus: 'pending_clarify' | 'ready' = question ? 'pending_clarify' : 'ready';
      return {
        input_id: input.id,
        unit_index: idx,
        unit_text: inferUnitText(rawInput, proposal.contentSummary),
        parsed_semantic: classification.rawParsed ?? {},
        classifier_decision: {
          confidence:
            typeof classification.rawParsed?.confidence === 'number'
              ? (classification.rawParsed.confidence as number)
              : null,
          route: question ? 'clarify' : 'direct',
          missing_fields: question ? [question.field] : [],
          content_summary: proposal.contentSummary,
          proposed_fields: proposal.fields,
          seed_fields: seedFields,
        },
        field_ownership: {},
        confidence_overall:
          typeof classification.rawParsed?.confidence === 'number'
            ? (classification.rawParsed.confidence as number)
            : null,
        pending_question: question,
        answered_questions: [],
        clarify_round: 0,
        clarify_max: 3,
        status: unitStatus,
        trace_id: ctx.traceId,
      };
    });

    const units = await createInputUnits(userId, unitRows);

    const sortedByIndex = [...units].sort((a, b) => a.unit_index - b.unit_index);
    const primaryUnitId =
      sortedByIndex.find((u) => u.unit_index === 0)?.id ??
      sortedByIndex[0]?.id ??
      '';
    const inputWithMeta = await updateInput(userId, input.id, {
      metadata: {
        ...(input.metadata as Record<string, unknown>),
        primary_unit_id: primaryUnitId,
      },
    });

    const promotedRecordIds: string[] = [];
    if (!classification.needsConfirmation) {
      const batchId =
        classification.isCompound || classification.unitProposals.length > 1
          ? crypto.randomUUID()
          : null;
      for (let i = 0; i < classification.unitProposals.length; i++) {
        const unit = units[i];
        const proposalPayload = proposals[i]?.payload;
        const {
          content: _content,
          date: _date,
          input_id: _inputId,
          parent_input_id: _parentInputId,
          input_unit_id: _inputUnitId,
          batch_id: _batchId,
          ...restPayload
        } = (proposalPayload ?? {}) as Partial<CreateRecordPayload>;
        const normalizedType = normalizeType(proposalPayload?.type);
        const temporal = resolveTemporalFields(
          date,
          normalizedType,
          ((proposalPayload ?? {}) as unknown as Record<string, unknown>)
        );
        const payload: CreateRecordPayload = {
          content:
            proposalPayload?.content ??
            resolveRecordContentSummary(
              (classification.unitProposals[i].fields ?? {}) as Record<string, unknown>,
              classification.rawParsed,
              [classification.unitProposals[i].contentSummary, rawInput]
            ),
          date: temporal.recordDate,
          type: normalizedType,
          parsed_semantic:
            (proposalPayload?.parsed_semantic as CreateRecordPayload['parsed_semantic']) ??
            (classification.rawParsed as CreateRecordPayload['parsed_semantic']),
          input_id: i === 0 ? input.id : `${input.id}-${i}`,
          parent_input_id: i === 0 ? null : input.id,
          input_unit_id: unit.id,
          input_source: toRecordInputSource(source),
          review_status: 'confirmed',
          confidence_level: 'high',
          record_quality_tag: 'ai_high',
          batch_id: batchId,
          ...restPayload,
          ...seedFields,
          ...(temporal.anchorDate && !proposalPayload?.time_anchor_date
            ? { time_anchor_date: temporal.anchorDate }
            : {}),
          ...(temporal.occurredAt && !proposalPayload?.occurred_at
            ? { occurred_at: temporal.occurredAt }
            : {}),
          ...(temporal.occurredAtEnd && !proposalPayload?.occurred_at_end
            ? { occurred_at_end: temporal.occurredAtEnd }
            : {}),
        };
        const result = await createRecordSafely({ userId, payload, supabase, traceId: ctx.traceId });
        if (!result.ok || !result.data) {
          const msg = result.errors.map((e) => e.message).join('; ') || '创建记录失败';
          await persistTraceSummary({
            supabase,
            userId,
            traceId: ctx.traceId,
            operation: 'inputs_create',
            status: 'failed',
            errorCode: ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
            errorMessage: msg,
            inputSummary: rawInput.slice(0, 200),
          });
          return apiError(
            ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
            msg,
            ctx.traceId,
            400
          );
        }

        promotedRecordIds.push(result.data.id);
        await updateInputUnit(userId, unit.id, {
          status: 'promoted',
          promoted_record_id: result.data.id,
          pending_question: null,
        });
      }

      await updateInput(userId, input.id, {
        status: 'completed',
        promoted_record_count: promotedRecordIds.length,
      });
    } else {
      await updateInput(userId, input.id, { status: 'clarifying' });
    }

    const freshUnits = await listInputUnits(userId, input.id);
    const firstPending = freshUnits.find((u) => u.status === 'pending_clarify' && u.pending_question) ?? null;

    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_create',
      status: classification.needsConfirmation ? 'partial' : 'ok',
      inputSummary: rawInput.slice(0, 200),
      outputSummary: classification.needsConfirmation
        ? `units=${classification.unitsCount}, need_clarify=true`
        : `promoted=${promotedRecordIds.length}`,
    });

    return apiSuccess(
      {
        input: inputWithMeta,
        units: freshUnits,
        pending: firstPending
          ? {
              unit_id: (firstPending as InputUnit).id,
              question: (firstPending as InputUnit).pending_question!,
            }
          : null,
        promoted_record_ids: promotedRecordIds,
        primary_unit_id: primaryUnitId || undefined,
      },
      ctx.traceId,
      classification.needsConfirmation ? 200 : 201
    );
  } catch (error) {
    return handleApiError(error);
  }
}

