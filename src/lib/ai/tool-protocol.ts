/**
 * TETO 1.6 Tool Protocol — Smart Agent, Dumb Tools 接口定义
 *
 * 核心约束（原则6）：
 *   - Agent 聪明——理解意图、收集上下文、生成计划、选择工具、给解释
 *   - Tool 简单——每个 Tool 只做一件事，输入输出明确，失败返回 error_code
 *   - Domain 层强制执行硬校验（Tool 不能绕过）
 *   - Tool 内部不得调用 LLM（不推理，只执行）
 *   - dry_run=true 时 Tool 不得产生副作用
 *
 * 防线顺序：
 *   Agent → Tool.invoke() → Domain Service.validate() → Domain Service.execute()
 *     → Data Access Layer → PostgreSQL RLS
 */

import type { InvariantIssue } from '@/lib/domain/domain-errors';

// ═══════════════════════════════════════════════════════════
// Tool 调用请求（Agent → Tool）
// ═══════════════════════════════════════════════════════════

/** Agent 调用 Tool 时提供的参数 */
export interface ToolCallInput<T = Record<string, unknown>> {
  /** Tool 名称，如 'record.create' */
  toolName: string;

  /** 严格 JSON Schema 兼容的输入数据 */
  input: T;

  /** 关联的 trace_id（必填） */
  traceId: string;

  /** 幂等键：同一 key 的重复调用不产生副作用 */
  idempotencyKey?: string;

  /** 只校验不写入。true 时 Tool 必须只返回 validation_results，不产生副作用 */
  dryRun?: boolean;
}

// ═══════════════════════════════════════════════════════════
// Tool 调用响应（Tool → Agent）
// ═══════════════════════════════════════════════════════════

/** Tool 执行后返回的标准响应 */
export interface ToolCallOutput<T = Record<string, unknown>> {
  /** 调用是否成功 */
  ok: boolean;

  /** 输出数据 */
  output: T;

  /** 错误码（失败时） */
  errorCode?: string;

  /** 错误消息（失败时，用于日志和诊断） */
  errorMessage?: string;

  /** 校验结果列表（dryRun 或校验失败时） */
  validationResults: ToolValidationResult[];

  /** 执行耗时（毫秒） */
  durationMs: number;

  /** 当前 Tool 调用的 span_id */
  spanId: string;
}

// ═══════════════════════════════════════════════════════════
// 校验结果
// ═══════════════════════════════════════════════════════════

/** 单条校验结果 */
export interface ToolValidationResult {
  /** 字段名 */
  field: string;

  /** 严重级别 */
  severity: 'blocking' | 'warning';

  /** 关联的 rule_id */
  ruleId: string;

  /** 校验消息 */
  message: string;
}

// ═══════════════════════════════════════════════════════════
// Tool 定义接口（每个 Tool 实现此接口）
// ═══════════════════════════════════════════════════════════

/** 通用 Tool 接口 */
export interface ITool<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  /** Tool 唯一名称 */
  readonly toolName: string;

  /** 输入 JSON Schema（用于 LLM function calling 描述） */
  readonly inputSchema: Record<string, unknown>;

  /** 输出 JSON Schema */
  readonly outputSchema: Record<string, unknown>;

  /** 执行 Tool（必须经过 Domain 校验） */
  invoke(call: ToolCallInput<TInput>): Promise<ToolCallOutput<TOutput>>;

  /** 只校验不写入 */
  validate(call: ToolCallInput<TInput>): Promise<ToolCallOutput<never>>;
}

// ═══════════════════════════════════════════════════════════
// 辅助：将 Domain InvariantIssue 转为 ToolValidationResult
// ═══════════════════════════════════════════════════════════

/** 将 Domain 层的 InvariantIssue[] 转换为 Tool 层的校验结果 */
export function toValidationResults(issues: InvariantIssue[]): ToolValidationResult[] {
  return issues.map((issue) => ({
    field: issue.field ?? 'unknown',
    severity: issue.severity === 'blocking' ? 'blocking' : 'warning',
    ruleId: issue.code,
    message: issue.message,
  }));
}
