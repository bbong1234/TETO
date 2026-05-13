/**
 * Browser-side helpers: correlate API calls with server trace_id (x-trace-id).
 */

export function jsonHeadersWithTrace(traceId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-trace-id': traceId,
  };
}

/** Read message + trace from ApiSuccess / ApiError envelope or legacy shapes */
export function parseClientApiJson(json: unknown): {
  message?: string;
  traceId?: string;
  data?: unknown;
  ok?: boolean;
} {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const meta = o.meta as Record<string, unknown> | undefined;
  const traceId = typeof meta?.traceId === 'string' ? meta.traceId : undefined;
  if (o.ok === false && o.error && typeof o.error === 'object') {
    const err = o.error as Record<string, unknown>;
    return {
      ok: false,
      message: String(err.message ?? '请求失败'),
      traceId,
    };
  }
  return {
    ok: o.ok === true ? true : undefined,
    data: o.data,
    traceId,
  };
}

export function formatErrorWithTrace(message: string, traceId?: string): string {
  if (!traceId) return message;
  return `${message}（trace: ${traceId}）`;
}
