import { NextResponse } from 'next/server';

type ErrorMatcher = string | ((msg: string) => boolean);

/**
 * 集中处理 API 路由的 catch 块。
 *
 * 基础逻辑：
 * - "请先登录" / "获取用户信息失败" → 401
 * - 其他 → 500
 *
 * @param extraMappings 额外的 [matcher, status] 映射，按顺序匹配，首个命中即返回
 *
 * @example
 * ```ts
 * catch (error) {
 *   return handleApiError(error, [
 *     ['GOAL_COMPLETED_LOCKED:', 403],
 *     [msg => msg.includes('草稿'), 400],
 *   ]);
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  extraMappings?: [ErrorMatcher, number][]
): NextResponse {
  const message = error instanceof Error ? error.message : '服务器错误';

  if (message === '请先登录' || message === '获取用户信息失败') {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (extraMappings) {
    for (const [matcher, status] of extraMappings) {
      const match = typeof matcher === 'function'
        ? matcher(message)
        : message.startsWith(matcher) || message.includes(matcher);
      if (match) {
        const cleanMsg = typeof matcher === 'string'
          ? message.replace(matcher, '')
          : message;
        return NextResponse.json({ error: cleanMsg }, { status });
      }
    }
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
