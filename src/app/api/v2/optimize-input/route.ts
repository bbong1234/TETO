import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { optimizeInput } from '@/lib/ai/optimize-input';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { RULES } from '@/lib/rules';

/**
 * POST /api/v2/optimize-input
 * 调用 DeepSeek LLM 将模糊输入预处理为清晰的行格式
 *
 * Body: { input: string; date?: string }
 * Returns: { data: OptimizeInputResult }
 */
export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    // 验证登录
    await getCurrentUserId();

    const body = await request.json();
    const { input, date } = body as {
      input?: string;
      date?: string;
    };

    if (!input || !input.trim()) {
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, 'input 为必填字段', ctx.traceId, 400);
    }

    if (input.length > RULES.fallback.max_input_length) {
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, `input 过长，最多${RULES.fallback.max_input_length}字符`, ctx.traceId, 400);
    }

    let result;
    try {
      result = await optimizeInput(input.trim(), date);
    } catch (err) {
      return handleApiError(err, [
        [msg => msg.includes('DeepSeek API'), 502],
      ]);
    }

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}
