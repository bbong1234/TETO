/**
 * TETO 1.6 API Handler Wrapper
 *
 * 职责：
 *   - 为每个请求自动生成 trace_id
 *   - 将现有响应包装为 ApiSuccess/ApiError envelope
 *   - 逐步替代各 route 中的裸 NextResponse.json()
 *
 * 用法：
 *   // 在 route.ts 中
 *   import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
 *
 *   export async function POST(req: NextRequest) {
 *     const ctx = withTrace(req);
 *     try { ... return apiSuccess(data, ctx.traceId); }
 *     catch(e) { return apiError('ERR-xxx', e.message, ctx.traceId); }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { genTraceId } from '@/lib/observability/id-registry';
import { success, error } from '@/lib/api/types';
import type { ApiWarning, ApiErrorDetail, ApiMeta } from '@/lib/api/types';
import { ERROR_CODES } from '@/lib/observability/id-registry';

// ═══════════════════════════════════════════════════════════
// Request Context
// ═══════════════════════════════════════════════════════════

export interface RequestContext {
  traceId: string;
  req: NextRequest;
}

/** 从请求中提取或生成 trace_id */
export function withTrace(req: NextRequest): RequestContext {
  // 优先从 header 或 query param 获取已有 trace_id（支持客户端传递）
  const existing = req.headers.get('x-trace-id') ?? req.nextUrl.searchParams.get('trace_id');
  const traceId = existing ?? genTraceId();
  return { traceId, req };
}

// ═══════════════════════════════════════════════════════════
// 响应辅助
// ═══════════════════════════════════════════════════════════

export function apiSuccess<T>(data: T, traceId: string, status = 200, warnings?: ApiWarning[], extraMeta?: Partial<ApiMeta>): NextResponse {
  const body = success(data, traceId, warnings, extraMeta);
  return NextResponse.json(body, {
    status,
    headers: { 'x-trace-id': traceId },
  });
}

export function apiError(
  errorCode: string,
  message: string,
  traceId: string,
  status = 400,
  details?: ApiErrorDetail[]
): NextResponse {
  const body = error(errorCode, message, traceId, details);
  return NextResponse.json(body, {
    status,
    headers: { 'x-trace-id': traceId },
  });
}

/** 将旧的 Domain 错误格式转换为新的 ApiError 格式 */
export function apiDomainError(
  errors: { code: string; message: string; severity: string }[],
  traceId: string
): NextResponse {
  const blocking = errors.filter((e) => e.severity === 'blocking');
  const warnings = errors
    .filter((e) => e.severity !== 'blocking')
    .map((e) => ({ code: e.code, message: e.message }));

  if (blocking.length > 0) {
    return apiError(
      blocking[0].code || ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
      blocking.map((e) => e.message).join('; '),
      traceId,
      400,
      blocking.map((e) => ({ code: e.code, message: e.message }))
    );
  }

  // 全部是 warning 时仍返回 200 但带 warnings
  return apiSuccess(null, traceId, 200, warnings);
}
