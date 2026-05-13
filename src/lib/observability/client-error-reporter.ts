'use client';

import { ERROR_CODES } from '@/lib/observability/id-registry';

let installed = false;

function safePost(body: Record<string, unknown>) {
  try {
    void fetch('/api/v2/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore */
  }
}

/**
 * 在仪表盘 layout 挂载一次：监听 window.error / unhandledrejection，写入 errors 表。
 */
export function initClientErrorReporter(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  window.addEventListener('error', (ev) => {
    safePost({
      error_code: ERROR_CODES.CLIENT_UNCAUGHT_ERROR,
      message: ev.message || 'window.error',
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
      severity: 'error',
      url: window.location.href,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      metadata: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    safePost({
      error_code: ERROR_CODES.CLIENT_UNHANDLED_REJECTION,
      message: r instanceof Error ? r.message : String(r),
      stack: r instanceof Error ? r.stack : undefined,
      severity: 'error',
      url: window.location.href,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  });
}

/** 业务侧主动上报（如 fetch 失败） */
export function reportClientError(payload: {
  error_code: string;
  message: string;
  stack?: string;
  severity?: 'warn' | 'error' | 'fatal';
  trace_id?: string;
  record_id?: string;
  input_id?: string;
  metadata?: Record<string, unknown>;
}): void {
  if (typeof window === 'undefined') return;
  safePost({
    ...payload,
    url: window.location.href,
    user_agent: navigator.userAgent,
  });
}
