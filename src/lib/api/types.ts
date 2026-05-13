/**
 * TETO 1.6 API 契约类型 — 统一响应 Envelope
 *
 * 约束：
 *   - 所有 API 必须返回 ApiSuccess<T> 或 ApiError
 *   - meta 中必含 trace_id + api_version
 *   - 前端通过 api/client.ts 统一消费，不直接 fetch
 */

// ═══════════════════════════════════════════════════════════
// Meta
// ═══════════════════════════════════════════════════════════

export interface ApiMeta {
  /** 请求追踪 ID */
  traceId: string;

  /** API 版本（日期格式） */
  apiVersion: string;

  /** 服务端时间戳 */
  serverTimestamp: string;

  /** 规则版本（可选，涉及规则判断时返回） */
  ruleVersion?: string;

  /** 计算版本（可选，涉及统计计算时返回） */
  computationVersion?: string;

  /** span_id（可选，调试时返回） */
  spanId?: string;
}

// ═══════════════════════════════════════════════════════════
// 成功响应
// ═══════════════════════════════════════════════════════════

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
  meta: ApiMeta;
  /** 非阻塞警告（如低置信度标记） */
  warnings?: ApiWarning[];
}

// ═══════════════════════════════════════════════════════════
// 错误响应
// ═══════════════════════════════════════════════════════════

export interface ApiError {
  ok: false;
  error: {
    /** 标准错误码，如 ERR-RECORD-001 */
    errorCode: string;
    /** 人类可读的错误消息 */
    message: string;
    /** 详细错误列表（如字段校验失败） */
    details?: ApiErrorDetail[];
  };
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════
// 警告
// ═══════════════════════════════════════════════════════════

export interface ApiWarning {
  code: string;
  message: string;
  field?: string;
}

// ═══════════════════════════════════════════════════════════
// 工厂函数
// ═══════════════════════════════════════════════════════════

let _apiVersion = new Date().toISOString().slice(0, 10); // 启动时的日期作为默认版本

export function setApiVersion(version: string): void {
  _apiVersion = version;
}

export function getApiVersion(): string {
  return _apiVersion;
}

export function buildMeta(traceId: string, extra?: Partial<ApiMeta>): ApiMeta {
  return {
    traceId,
    apiVersion: _apiVersion,
    serverTimestamp: new Date().toISOString(),
    ...extra,
  };
}

export function success<T>(data: T, traceId: string, warnings?: ApiWarning[], extraMeta?: Partial<ApiMeta>): ApiSuccess<T> {
  return {
    ok: true,
    data,
    meta: buildMeta(traceId, extraMeta),
    ...(warnings?.length ? { warnings } : {}),
  };
}

export function error(errorCode: string, message: string, traceId: string, details?: ApiErrorDetail[]): ApiError {
  return {
    ok: false,
    error: {
      errorCode,
      message,
      ...(details?.length ? { details } : {}),
    },
    meta: buildMeta(traceId),
  };
}
