/**
 * observability/trace.ts — TETO 1.6 Trace-Span 构建器
 *
 * 为 Agent Pipeline 的 10 个 Stage 提供 span 生命周期管理。
 *
 * 用法：
 *   const ctx = startSpan(traceId, PipelineStage.OBSERVE, "用户输入: 今天跑步5公里");
 *   // ... do work ...
 *   const result = endSpan(ctx, 'ok', "解析完成，输出 3 条记录");
 *
 * 设计原则：
 *   - 内存优先：P0 阶段 span 存在内存中，通过 logger 输出
 *   - 持久化：后续通过 trace_summaries + decision_logs 表写入 DB
 *   - 不可变：SpanContext 创建后不可修改（endSpan 生成新的 SpanResult）
 */

import { PipelineStage } from '@/lib/ai/agent-pipeline';
import { genSpanId } from '@/lib/observability/id-registry';
import { createComponentLogger, type LogEntry } from '@/lib/observability/logger';
import type { createClient } from '@/lib/supabase/server';

const traceLogger = createComponentLogger('trace-span');

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

/** Span 状态 */
export type SpanStatus = 'ok' | 'failed' | 'partial';

/** 开始一个 span 时返回的上下文 */
export interface SpanContext {
  spanId: string;
  traceId: string;
  stage: PipelineStage;
  stageName: string;
  startTime: number;
  inputSummary: string;
}

/** 结束一个 span 时返回的结果 */
export interface SpanResult {
  spanId: string;
  traceId: string;
  stage: PipelineStage;
  stageName: string;
  inputSummary: string;
  outputSummary: string;
  status: SpanStatus;
  durationMs: number;
  startTime: number;
  endTime: number;
  errorCode?: string;
  errorMessage?: string;
}

/** Trace 摘要（汇总所有 span） */
export interface TraceSummary {
  traceId: string;
  status: SpanStatus;
  totalDurationMs: number;
  spanCount: number;
  errorCode?: string;
  spans: SpanResult[];
}

// ═══════════════════════════════════════════════════════════
// Stage 名称映射
// ═══════════════════════════════════════════════════════════

const STAGE_NAMES: Record<PipelineStage, string> = {
  [PipelineStage.OBSERVE]: 'OBSERVE',
  [PipelineStage.INTERPRET]: 'INTERPRET',
  [PipelineStage.DECOMPOSE]: 'DECOMPOSE',
  [PipelineStage.PLAN]: 'PLAN',
  [PipelineStage.VALIDATE]: 'VALIDATE',
  [PipelineStage.EXECUTE]: 'EXECUTE',
  [PipelineStage.VERIFY]: 'VERIFY',
  [PipelineStage.COMMIT]: 'COMMIT',
  [PipelineStage.EXPLAIN]: 'EXPLAIN',
  [PipelineStage.LOG]: 'LOG',
};

// ═══════════════════════════════════════════════════════════
// Span 内存存储（单次请求生命周期）
// ═══════════════════════════════════════════════════════════

const activeSpans = new Map<string, SpanContext>();
const completedSpans = new Map<string, SpanResult[]>();

// ═══════════════════════════════════════════════════════════
// 核心 API
// ═══════════════════════════════════════════════════════════

/**
 * 开始一个新的 span
 *
 * @param traceId  — 跟踪 ID（从 withTrace 获取）
 * @param stage    — Pipeline 阶段
 * @param inputSummary — 输入摘要（≤200 字符）
 */
export function startSpan(
  traceId: string,
  stage: PipelineStage,
  inputSummary: string
): SpanContext {
  const spanId = genSpanId(stage);
  const ctx: SpanContext = {
    spanId,
    traceId,
    stage,
    stageName: STAGE_NAMES[stage],
    startTime: Date.now(),
    inputSummary: inputSummary.slice(0, 200),
  };

  activeSpans.set(spanId, ctx);

  traceLogger.info(`Span started`, {
    spanId,
    traceId,
    stage: STAGE_NAMES[stage],
    inputSummary: ctx.inputSummary,
  } as unknown as Partial<LogEntry>);

  return ctx;
}

/**
 * 结束一个 span
 *
 * @param context       — startSpan 返回的上下文
 * @param status        — 执行状态
 * @param outputSummary — 输出摘要（≤500 字符）
 * @param errorCode     — 错误码（status='failed' 时必填）
 * @param errorMessage  — 错误消息
 */
export function endSpan(
  context: SpanContext,
  status: SpanStatus,
  outputSummary: string,
  errorCode?: string,
  errorMessage?: string
): SpanResult {
  const endTime = Date.now();
  const durationMs = endTime - context.startTime;

  const result: SpanResult = {
    spanId: context.spanId,
    traceId: context.traceId,
    stage: context.stage,
    stageName: context.stageName,
    inputSummary: context.inputSummary,
    outputSummary: outputSummary.slice(0, 500),
    status,
    durationMs,
    startTime: context.startTime,
    endTime,
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };

  // 清理 active span
  activeSpans.delete(context.spanId);

  // 记录到 completed spans
  const spans = completedSpans.get(context.traceId) ?? [];
  spans.push(result);
  completedSpans.set(context.traceId, spans);

  // 日志
  const logLevel = status === 'failed' ? 'error' : status === 'partial' ? 'warn' : 'info';
  traceLogger[logLevel](`Span ended: ${context.stageName}`, {
    spanId: result.spanId,
    traceId: result.traceId,
    stage: result.stageName,
    status: result.status,
    durationMs: result.durationMs,
    errorCode: result.errorCode,
  } as unknown as Partial<LogEntry>);

  return result;
}

/**
 * 获取某个 trace 的所有已完成 span
 */
export function getTraceSpans(traceId: string): SpanResult[] {
  return completedSpans.get(traceId) ?? [];
}

/**
 * 生成 trace 摘要
 */
export function getTraceSummary(traceId: string): TraceSummary | null {
  const spans = completedSpans.get(traceId);
  if (!spans || spans.length === 0) return null;

  const failedSpan = spans.find((s) => s.status === 'failed');
  const status: SpanStatus = failedSpan ? 'failed' : spans.some((s) => s.status === 'partial') ? 'partial' : 'ok';

  const totalDurationMs = spans.reduce((sum, s) => sum + s.durationMs, 0);

  return {
    traceId,
    status,
    totalDurationMs,
    spanCount: spans.length,
    errorCode: failedSpan?.errorCode,
    spans,
  };
}

/**
 * 清除指定 trace 的内存数据（请求结束调用）
 */
export function clearTrace(traceId: string): void {
  completedSpans.delete(traceId);
  // 同时清理所有属于该 trace 的 active spans
  for (const [spanId, ctx] of activeSpans.entries()) {
    if (ctx.traceId === traceId) {
      activeSpans.delete(spanId);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// DB 持久化
// ═══════════════════════════════════════════════════════════

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface PersistTraceParams {
  supabase: SupabaseClient;
  userId: string;
  traceId: string;
  operation: string;
  status?: 'ok' | 'failed' | 'partial';
  errorCode?: string;
  errorMessage?: string;
  inputSummary?: string;
  outputSummary?: string;
}

/**
 * 持久化 trace 摘要到 trace_summaries 表
 *
 * 在请求结束时调用，将内存中的 trace 数据写入 DB。
 * 不会 throw——写入失败时静默记录 error log。
 */
export async function persistTraceSummary(params: PersistTraceParams): Promise<void> {
  const {
    supabase,
    userId,
    traceId,
    operation,
    status = 'ok',
    errorCode,
    errorMessage,
    inputSummary,
    outputSummary,
  } = params;

  try {
    const summary = getTraceSummary(traceId);
    const totalDurationMs = summary?.totalDurationMs ?? 0;
    const spanCount = summary?.spanCount ?? 0;

    const insertPayload: Record<string, unknown> = {
      trace_id: traceId,
      user_id: userId,
      operation,
      status: errorCode ? 'failed' : status,
      total_duration_ms: totalDurationMs,
      span_count: spanCount,
      error_code: errorCode ?? summary?.errorCode ?? null,
      error_message: errorMessage ?? null,
      input_summary: inputSummary ?? null,
      output_summary: outputSummary ?? null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('trace_summaries')
      .insert(insertPayload);

    if (error) {
      traceLogger.error('[Trace持久化失败]', {
        details: { pgError: error.message, pgCode: error.code, traceId, operation },
      });
    }
  } catch (err) {
    traceLogger.error('[Trace持久化异常]', {
      details: { error: err instanceof Error ? err.message : String(err), traceId },
    });
  }

  // 持久化后清除内存数据
  clearTrace(traceId);
}
