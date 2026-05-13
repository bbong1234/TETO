import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { insertRuntimeError, listRuntimeErrors } from '@/lib/db/runtime-errors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(v?: string | null): string | null {
  if (!v?.trim()) return null;
  return UUID_RE.test(v.trim()) ? v.trim() : null;
}

/** 客户端上报 body */
interface ClientErrorBody {
  error_code: string;
  message: string;
  stack?: string;
  severity?: 'warn' | 'error' | 'fatal';
  trace_id?: string;
  record_id?: string;
  input_id?: string;
  url?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body = (await request.json()) as ClientErrorBody;

    if (!body?.error_code?.trim() || !body?.message?.trim()) {
      return apiError(
        ERROR_CODES.PARSE_INSUFFICIENT_INFO,
        'error_code 与 message 为必填',
        ctx.traceId,
        400
      );
    }

    const row = await insertRuntimeError({
      user_id: userId,
      error_code: body.error_code.trim().slice(0, 128),
      message: body.message.trim().slice(0, 8000),
      stack: body.stack?.slice(0, 32000) ?? null,
      source: 'client',
      severity: body.severity === 'warn' || body.severity === 'fatal' ? body.severity : 'error',
      trace_id: body.trace_id?.trim() || ctx.traceId,
      record_id: asUuidOrNull(body.record_id),
      input_id: asUuidOrNull(body.input_id),
      url: body.url?.slice(0, 2000) ?? null,
      user_agent: body.user_agent?.slice(0, 500) ?? null,
      metadata: body.metadata ?? {},
    });

    return apiSuccess({ id: row.id }, ctx.traceId, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;

    const rows = await listRuntimeErrors(userId, limit);
    return apiSuccess({ items: rows }, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
