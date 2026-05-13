import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import { updateRecordSafely, deleteRecordSafely } from '@/lib/domain/record-service';
import { applyAiEnhancementSafely } from '@/lib/domain/record-ai-service';
import type { UpdateRecordPayload } from '@/types/teto';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { persistTraceSummary } from '@/lib/observability/trace';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const record = await getRecordById(userId, id);
    if (!record) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '记录不存在或不属于当前用户', ctx.traceId, 404);
    }

    return apiSuccess(record, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateRecordPayload = await request.json();

    const supabase = await createClient();

    // 如果客户端传入 parsed_semantic，说明是客户端 AI 增强，需走 AI 字段归属策略
    const isClientAi = !!(body as Record<string, unknown>).parsed_semantic;
    const result = isClientAi
      ? await applyAiEnhancementSafely({ userId, recordId: id, aiUpdate: body as Record<string, any>, supabase })
      : await updateRecordSafely({ userId, id, payload: body, supabase });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    // 持久化 trace 摘要
    persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'record_update',
      status: 'ok',
    });

    return apiSuccess(result.data, ctx.traceId, 200, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = withTrace(request);
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();

    const result = await deleteRecordSafely({ userId, id, supabase, traceId: ctx.traceId });

    if (!result.ok) {
      return apiDomainError(result.errors, ctx.traceId);
    }

    // 持久化 trace 摘要
    persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'record_delete',
      status: 'ok',
    });

    return apiSuccess({ id }, ctx.traceId, 200, result.warnings.length > 0 ? result.warnings : undefined);
  } catch (error) {
    return handleApiError(error);
  }
}
