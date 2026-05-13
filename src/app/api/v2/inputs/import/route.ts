import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { handleApiError } from '@/lib/api/error-handler';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { createRecordSafely } from '@/lib/domain/record-service';
import { ingestFull, ingestLightweight } from '@/lib/ingest/pipeline';
import { createInput, updateInput } from '@/lib/db/inputs';
import type { ImportInputPayload, ImportInputResponse, ImportRowPayload } from '@/types/inputs';
import type { CreateRecordPayload } from '@/types/teto';
import { resolveIngestV2ForServer } from '@/lib/ingest/ingest-v2';
import { persistTraceSummary } from '@/lib/observability/trace';

const IMPORT_LIMIT = 500;

function buildLightweightPayload(row: ImportRowPayload, dateFallback: string): CreateRecordPayload | null {
  const s = row.structured;
  if (!s?.content?.trim()) return null;
  const type =
    s.type === '发生' || s.type === '计划' || s.type === '想法' || s.type === '总结' ? s.type : '发生';
  return ingestLightweight({
    content: s.content.trim(),
    date: s.date || dateFallback,
    type,
    occurred_at: s.occurred_at,
    metric_value: s.metric_value ?? null,
    metric_unit: s.metric_unit ?? null,
    metric_name: s.metric_name ?? null,
    cost: s.cost ?? null,
    note: s.note,
    input_source: 'import',
    review_status: 'confirmed',
    confidence_level: 'high',
    record_quality_tag: 'ai_high',
  });
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    if (!(await resolveIngestV2ForServer(userId))) {
      const supabase = await createClient();
      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_import',
        status: 'failed',
        errorCode: ERROR_CODES.INPUT_INGEST_DISABLED,
        errorMessage: 'ingest v2 disabled',
      });
      return apiError(
        ERROR_CODES.INPUT_INGEST_DISABLED,
        '录入流水线（ingest v2）未启用，无法使用批量导入入口。',
        ctx.traceId,
        403
      );
    }
    const supabase = await createClient();
    const body = (await request.json()) as ImportInputPayload;
    const rows = body?.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_import',
        status: 'failed',
        errorCode: ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
        errorMessage: 'rows 不能为空',
      });
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'rows 不能为空', ctx.traceId, 400);
    }
    if (rows.length > IMPORT_LIMIT) {
      await persistTraceSummary({
        supabase,
        userId,
        traceId: ctx.traceId,
        operation: 'inputs_import',
        status: 'failed',
        errorCode: ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
        errorMessage: `超过 ${IMPORT_LIMIT} 行`,
      });
      return apiError(
        ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
        `单次导入最多 ${IMPORT_LIMIT} 行`,
        ctx.traceId,
        400
      );
    }

    const batchId = crypto.randomUUID();
    const failedRows: { index: number; error: string }[] = [];
    let succeeded = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dateFallback = new Date().toISOString().slice(0, 10);
      try {
        if (row.structured?.content) {
          const input = await createInput(userId, {
            raw_input: row.structured.content,
            source: 'import',
            status: 'pending',
            trace_id: ctx.traceId,
            batch_id: batchId,
            metadata: { row_index: i, mode: 'lightweight' },
          });
          const payload = buildLightweightPayload(row, dateFallback);
          if (!payload) throw new Error('structured.content 为空');

          const result = await createRecordSafely({ userId, payload, supabase, traceId: ctx.traceId });
          if (!result.ok || !result.data) {
            throw new Error(result.errors.map((e) => e.message).join('; ') || '创建记录失败');
          }

          await updateInput(userId, input.id, {
            status: 'completed',
            promoted_record_count: 1,
            total_units: 1,
          });
          succeeded++;
          continue;
        }

        if (row.raw?.trim()) {
          const input = await createInput(userId, {
            raw_input: row.raw.trim(),
            source: 'import',
            status: 'pending',
            trace_id: ctx.traceId,
            batch_id: batchId,
            metadata: { row_index: i, mode: 'full' },
          });

          const { classification, proposals } = await ingestFull({
            userId,
            rawInput: row.raw.trim(),
            date: dateFallback,
            traceId: ctx.traceId,
          });

          // 批量导入不走澄清卡：有歧义则保存 partial，后续走纠错流程
          const p = proposals[0];
          const payload: CreateRecordPayload = {
            ...(p?.payload ?? {
              content: row.raw.trim(),
              date: dateFallback,
              type: '发生',
            }),
            input_source: 'import',
            input_id: input.id,
            parent_input_id: null,
            review_status: classification.needsConfirmation ? 'unchecked' : 'confirmed',
            confidence_level: classification.needsConfirmation ? 'low' : 'high',
            record_quality_tag: classification.needsConfirmation ? 'partial' : 'ai_high',
          };

          const result = await createRecordSafely({ userId, payload, supabase, traceId: ctx.traceId });
          if (!result.ok || !result.data) {
            throw new Error(result.errors.map((e) => e.message).join('; ') || '创建记录失败');
          }
          await updateInput(userId, input.id, {
            status: classification.needsConfirmation ? 'partial' : 'completed',
            promoted_record_count: 1,
            total_units: Math.max(classification.unitsCount, 1),
          });
          succeeded++;
          continue;
        }

        throw new Error('该行既没有 structured.content，也没有 raw');
      } catch (e) {
        failedRows.push({
          index: i,
          error: e instanceof Error ? e.message : 'unknown import error',
        });
      }
    }

    const response: ImportInputResponse = {
      batch_id: batchId,
      total: rows.length,
      succeeded,
      failed: failedRows.length,
      failed_rows: failedRows,
    };

    await persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'inputs_import',
      status: failedRows.length > 0 ? 'partial' : 'ok',
      outputSummary: `succeeded=${succeeded},failed=${failedRows.length},total=${rows.length}`,
    });

    return apiSuccess(response, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

