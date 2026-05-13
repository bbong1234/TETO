/**
 * TETO 1.6 前端统一 API 调用封装
 *
 * 替代所有组件中裸 fetch() 的直接调用。
 * 自动解析 ApiSuccess/ApiError，提取 trace_id，处理错误。
 */

import type { ApiSuccess, ApiError, ApiMeta } from '@/lib/api/types';
import { ERROR_CODES } from '@/lib/observability/id-registry';

// ═══════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════

const BASE_URL = '';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON body */
  body?: unknown;
  /** API 版本（不传则用服务端默认最新版本） */
  apiVersion?: string;
}

// ═══════════════════════════════════════════════════════════
// 请求执行
// ═══════════════════════════════════════════════════════════

async function request<T>(
  method: string,
  path: string,
  options?: RequestOptions
): Promise<ApiSuccess<T>> {
  const { body, apiVersion, ...init } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (apiVersion) {
    headers['Stripe-Version'] = apiVersion;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

  if (!json.ok) {
    const err = json as ApiError;
    const apiErr = new ApiRequestError(
      err.error.errorCode,
      err.error.message,
      err.meta.traceId,
      err.error.details
    );
    throw apiErr;
  }

  return json as ApiSuccess<T>;
}

// ═══════════════════════════════════════════════════════════
// 公共方法
// ═══════════════════════════════════════════════════════════

export const api = {
  get<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('GET', path, options);
  },

  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('POST', path, { ...options, body });
  },

  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('PUT', path, { ...options, body });
  },

  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('PATCH', path, { ...options, body });
  },

  delete<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>('DELETE', path, options);
  },
};

// ═══════════════════════════════════════════════════════════
// 错误类型
// ═══════════════════════════════════════════════════════════

export class ApiRequestError extends Error {
  public readonly errorCode: string;
  public readonly traceId: string;
  public readonly details?: { field?: string; code: string; message: string }[];

  constructor(
    errorCode: string,
    message: string,
    traceId: string,
    details?: { field?: string; code: string; message: string }[]
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.errorCode = errorCode;
    this.traceId = traceId;
    this.details = details;
  }
}

// ═══════════════════════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════════════════════

/** 从 API 响应中提取 meta 信息 */
export function extractMeta<T>(response: ApiSuccess<T>): ApiMeta {
  return response.meta;
}

/** 从 API 响应中提取 trace_id */
export function extractTraceId<T>(response: ApiSuccess<T>): string {
  return response.meta.traceId;
}
