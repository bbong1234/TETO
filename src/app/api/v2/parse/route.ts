import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { parseSemantic } from '@/lib/ai/parse-semantic';
import { parseWithFallback, shouldFallback } from '@/lib/ai/parse-rules-fallback';
import { runPipeline } from '@/lib/ai/pipeline-runner';
import { PipelineStage, type PipelineContext } from '@/lib/ai/agent-pipeline';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { handleApiError } from '@/lib/api/error-handler';
import { RULES } from '@/lib/rules';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { startSpan, endSpan, clearTrace } from '@/lib/observability/trace';

/**
 * POST /api/v2/parse
 * 调用 DeepSeek LLM 解析自然语言输入为语义结构
 *
 * TETO 1.6: 完整 trace-span 接入（OBSERVE → LOG）
 * TETO 1.6: 支持通过 TETO_PIPELINE_V1 功能开关使用 pipeline-runner 编排
 */
export async function POST(request: NextRequest) {
  const ctx = withTrace(request);

  // Stage 0: OBSERVE
  const observeSpan = startSpan(ctx.traceId, PipelineStage.OBSERVE, '接收自然语言解析请求');

  try {
    // 验证登录
    const userId = await getCurrentUserId();

    const body = await request.json();
    const { input, date, recent_records, items, sub_items } = body as {
      input?: string;
      date?: string;
      recent_records?: Array<{ id: string; content: string; date: string; type: string }>;
      items?: Array<{ id: string; title: string }>;
      sub_items?: Array<{ id: string; title: string; item_id: string }>;
    };

    endSpan(observeSpan, 'ok', `输入: "${(input ?? '').slice(0, 50)}"`);

    // Stage 1: VALIDATE
    const validateSpan = startSpan(ctx.traceId, PipelineStage.VALIDATE, `校验输入: ${(input ?? '').slice(0, 30)}`);

    if (!input || !input.trim()) {
      endSpan(validateSpan, 'failed', 'input 为空', 'PARSE_INSUFFICIENT_INFO', 'input 为必填字段');
      clearTrace(ctx.traceId);
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, 'input 为必填字段', ctx.traceId);
    }

    if (input.length > RULES.fallback.max_input_length) {
      endSpan(validateSpan, 'failed', `input 过长: ${input.length} > ${RULES.fallback.max_input_length}`, 'PARSE_INSUFFICIENT_INFO', 'input 过长');
      clearTrace(ctx.traceId);
      return apiError(ERROR_CODES.PARSE_INSUFFICIENT_INFO, `input 过长，最多${RULES.fallback.max_input_length}字符`, ctx.traceId);
    }

    endSpan(validateSpan, 'ok', '校验通过');

    // ── 检查是否启用 Pipeline V1 功能开关 ──
    const usePipeline = await isFeatureEnabled('TETO_PIPELINE_V1', userId);

    if (usePipeline) {
      return handleWithPipeline(ctx.traceId, userId, input.trim(), date, recent_records, items, sub_items);
    }

    return handleDirect(ctx.traceId, input.trim(), date, recent_records, items, sub_items);
  } catch (error) {
    endSpan(observeSpan, 'failed', '解析流程未处理异常', undefined, error instanceof Error ? error.message : String(error));
    clearTrace(ctx.traceId);
    return handleApiError(error);
  }
}

// ═══════════════════════════════════════════════════════════
// 路径 A：Pipeline 编排模式（TETO_PIPELINE_V1 开启时）
// ═══════════════════════════════════════════════════════════

async function handleWithPipeline(
  traceId: string,
  userId: string,
  input: string,
  date?: string,
  recentRecords?: Array<{ id: string; content: string; date: string; type: string }>,
  items?: Array<{ id: string; title: string }>,
  subItems?: Array<{ id: string; title: string; item_id: string }>,
): Promise<NextResponse> {
  const pipelineCtx: PipelineContext = {
    traceId,
    userId,
    rawInput: input,
    startedAt: new Date(),
  };

  const pipelineResult = await runPipeline(pipelineCtx, input, {
    recentRecords,
    items,
    subItems,
  });

  // 如果 pipeline 失败，尝试降级
  if (pipelineResult.overallStatus === 'failed' || !pipelineResult.data) {
    const fallbackResult = parseWithFallback(input, date || new Date().toISOString().split('T')[0], items || []);
    startSpan(traceId, PipelineStage.LOG, 'pipeline 降级 trace-span 完成');
    return apiSuccess(fallbackResult, traceId);
  }

  startSpan(traceId, PipelineStage.LOG, 'pipeline trace-span 完成');

  return apiSuccess(pipelineResult.data, traceId);
}

// ═══════════════════════════════════════════════════════════
// 路径 B：直接调用模式（原有行为，TETO_PIPELINE_V1 关闭时）
// ═══════════════════════════════════════════════════════════

async function handleDirect(
  traceId: string,
  input: string,
  date?: string,
  recentRecords?: Array<{ id: string; content: string; date: string; type: string }>,
  items?: Array<{ id: string; title: string }>,
  subItems?: Array<{ id: string; title: string; item_id: string }>,
): Promise<NextResponse> {
  // Stage 2-4: INTERPRET + DECOMPOSE + PLAN (AI 解析)
  const interpretSpan = startSpan(traceId, PipelineStage.INTERPRET, `AI 解析: "${input.slice(0, 40)}"`);

  let result;
  try {
    result = await parseSemantic(input, date, recentRecords, items, subItems);
    endSpan(interpretSpan, 'ok', `AI 解析成功，返回 ${Array.isArray(result) ? result.length : 1} 条记录`);
  } catch (err: any) {
    const fallbackReason = shouldFallback(err);
    if (fallbackReason) {
      endSpan(interpretSpan, 'partial', `AI 降级: ${fallbackReason}`, undefined, err.message);
      const fallbackResult = parseWithFallback(input, date || new Date().toISOString().split('T')[0], items || [], fallbackReason);

      const verifySpan = startSpan(traceId, PipelineStage.VERIFY, '校验降级结果');
      endSpan(verifySpan, 'ok', `降级解析成功，返回 ${Array.isArray(fallbackResult) ? fallbackResult.length : 1} 条记录`);

      startSpan(traceId, PipelineStage.LOG, 'trace-span 完成');

      return apiSuccess(fallbackResult, traceId);
    }

    endSpan(interpretSpan, 'failed', `AI 解析失败`, 'PARSE_INSUFFICIENT_INFO', err.message);
    clearTrace(traceId);
    return handleApiError(err, [
      [msg => msg.includes('DeepSeek API'), 502],
    ]);
  }

  const verifySpan = startSpan(traceId, PipelineStage.VERIFY, '校验 AI 解析结果');
  endSpan(verifySpan, 'ok', `结果有效: ${JSON.stringify(result).slice(0, 100)}`);

  startSpan(traceId, PipelineStage.LOG, 'trace-span 完成');

  return apiSuccess(result, traceId);
}
