/**
 * 从 API JSON 响应中提取可读错误文案。
 * 兼容 error 为 string 或 { errorCode, message, details } 两种形态。
 */
export function getApiErrorMessage(body: unknown, fallback = '操作失败'): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (!body || typeof body !== 'object') return fallback;

  const record = body as { error?: unknown; message?: unknown };
  if (typeof record.message === 'string' && record.message.trim()) return record.message;

  const err = record.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }

  return fallback;
}

/** showError / onError 等回调的安全包装 */
export function normalizeErrorMessage(message: unknown, fallback = '操作失败'): string {
  if (typeof message === 'string' && message.trim()) return message;
  return getApiErrorMessage({ error: message }, fallback);
}

const RECORD_NOT_FOUND_CODES = new Set([
  'RECORD_NOT_FOUND',
  'LINK_TARGET_NOT_FOUND',
]);

/** 记录已删除或 id 失效时的 API 响应（乐观删除后常见，不应弹红条） */
export function isRecordNotFoundApiError(body: unknown, status?: number): boolean {
  if (status === 404) return true;
  if (!body || typeof body !== 'object') return false;
  const record = body as {
    error?: unknown;
    errors?: Array<{ code?: string; message?: string }>;
  };
  const err = record.error;
  if (err && typeof err === 'object' && 'errorCode' in err) {
    const code = (err as { errorCode?: string }).errorCode;
    if (code && RECORD_NOT_FOUND_CODES.has(code)) return true;
  }
  if (Array.isArray(record.errors)) {
    if (
      record.errors.some(
        (e) => e.code && RECORD_NOT_FOUND_CODES.has(e.code)
      )
    ) {
      return true;
    }
  }
  const message = getApiErrorMessage(body, '');
  return message.includes('不存在') && message.includes('不属于');
}

/** 记录 id 已失效（已删或切换后），PATCH 标签/归属时不应弹红条 */
export function isStaleRecordReferenceError(message: string): boolean {
  return (
    message.includes('record_tags_record_id_fkey') ||
    message.includes('violates foreign key constraint') ||
    message.includes('更新记录后获取失败')
  );
}
