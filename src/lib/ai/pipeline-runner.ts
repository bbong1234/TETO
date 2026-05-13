/**
 * TETO 1.6 Pipeline Runner — AI 流水线编排器
 *
 * 职责：
 *   将 parse/route.ts 现有的"调 LLM → 得结果"升级为完整的 10 阶段流水线。
 *   OBSERVE/INTERPRET/DECOMPOSE → 调用现有 parseSemantic
 *   VALIDATE → 调用 domain invariants（规则中心门禁）
 *   VERIFY → 结构/类型校验
 *
 * 架构归属：计算中心（编排器子模块）
 *   遵循 DDD 高内聚低耦合：流水线负责编排，具体规则从 RULES 读取，
 *   计算参数从 COMPUTATION 读取，不硬编码任何业务规则。
 *
 * 用法：
 *   import { runPipeline } from '@/lib/ai/pipeline-runner';
 *   const result = await runPipeline(context, input, options);
 *
 * 设计原则（原则5）：
 *   - Agent 不得跳过 Stage 4（VALIDATE）
 *   - Agent 不得跳过 Stage 6（VERIFY）
 *   - 禁止将 VALIDATE 和 EXECUTE 合并为一个 LLM Tool Call
 */

import {
  PipelineContext,
  PipelineStage,
  PipelineResult,
  PipelineStepResult,
  ValidationIssue,
} from './agent-pipeline';
import { parseSemantic, type ParseSemanticResult } from './parse-semantic';
import { validateRecordInvariants } from '@/lib/domain/record-invariants';
import { startSpan, endSpan } from '@/lib/observability/trace';
import { RULES } from '@/lib/rules';

// ═══════════════════════════════════════════════════════════
// 选项
// ═══════════════════════════════════════════════════════════

export interface RunPipelineOptions {
  /** 用户最近的记录（传给 LLM 做语义关联） */
  recentRecords?: Array<{ id: string; content: string; date: string; type: string }>;
  /** 用户事项列表（传给 LLM 做 item_hint） */
  items?: Array<{ id: string; title: string }>;
  /** 用户子项列表 */
  subItems?: Array<{ id: string; title: string; item_id: string }>;
}

// ═══════════════════════════════════════════════════════════
// 核心：runPipeline
// ═══════════════════════════════════════════════════════════

/**
 * 执行完整的 AI 解析流水线。
 *
 * @param context — 流水线上下文（traceId, userId, rawInput）
 * @param input   — 用户自然语言输入
 * @param options — 可选上下文（近期记录、事项列表等）
 * @returns PipelineResult — 包含所有阶段结果及解析数据
 */
export async function runPipeline(
  context: PipelineContext,
  input: string,
  options?: RunPipelineOptions,
): Promise<PipelineResult<ParseSemanticResult>> {
  const stages: PipelineStepResult[] = [];
  const pipelineStart = Date.now();
  const normalizedInput = input.trim();

  // ── 辅助：执行单个阶段并写入 stages ──
  const runStage = async (
    stage: PipelineStage,
    inputSummary: string,
    fn: () => Promise<{
      outputSummary: string;
      status: 'ok' | 'failed' | 'skipped';
      errorCode?: string;
      decisionIds?: string[];
      ruleIds?: string[];
    }>,
  ): Promise<void> => {
    const span = startSpan(context.traceId, stage, inputSummary);
    const t0 = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - t0;
      stages.push({
        stage,
        spanId: span.spanId,
        inputSummary,
        outputSummary: result.outputSummary,
        status: result.status,
        durationMs,
        errorCode: result.errorCode,
        decisionIds: result.decisionIds,
        ruleIds: result.ruleIds,
      });

      const spanStatus =
        result.status === 'failed' ? 'failed' : result.status === 'skipped' ? 'partial' : 'ok';
      endSpan(span, spanStatus, result.outputSummary, result.errorCode);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const durationMs = Date.now() - t0;
      stages.push({
        stage,
        spanId: span.spanId,
        inputSummary,
        outputSummary: `异常: ${err.message}`,
        status: 'failed',
        durationMs,
        errorCode: 'PIPELINE_RUNTIME_ERROR',
      });
      endSpan(span, 'failed', err.message, 'PIPELINE_RUNTIME_ERROR');
    }
  };

  // ═════════════════════════════════════════════════════════
  // Stage 0: OBSERVE — 接收并标准化输入
  // ═════════════════════════════════════════════════════════
  await runStage(PipelineStage.OBSERVE, `接收用户输入`, async () => ({
    outputSummary: `输入已标准化: "${normalizedInput.slice(0, 50)}"`,
    status: 'ok',
  }));

  // ═════════════════════════════════════════════════════════
  // Stage 1: INTERPRET — 调用 parseSemantic
  // ═════════════════════════════════════════════════════════
  let parsedResult: ParseSemanticResult | null = null;
  let interpretFailed = false;

  await runStage(
    PipelineStage.INTERPRET,
    `AI 解析: "${normalizedInput.slice(0, 40)}"`,
    async () => {
      try {
        parsedResult = await parseSemantic(
          normalizedInput,
          undefined,
          options?.recentRecords,
          options?.items,
          options?.subItems,
        );
        const unitCount = parsedResult.parsed.units.length;
        const isCompound = parsedResult.parsed.is_compound;
        return {
          outputSummary: `解析${isCompound ? '（复合）' : ''}成功，${unitCount} 个 unit，置信度 ${parsedResult.parsed.confidence}`,
          status: 'ok',
        };
      } catch {
        interpretFailed = true;
        return {
          outputSummary: 'AI 解析失败',
          status: 'failed',
          errorCode: 'PARSE_FAILED',
        };
      }
    },
  );

  if (interpretFailed || !parsedResult) {
    return {
      traceId: context.traceId,
      stages,
      overallStatus: 'failed',
      totalDurationMs: Date.now() - pipelineStart,
      errorCode: 'PARSE_FAILED',
    };
  }

  // 类型守卫：此后 parsedResult 确定非 null
  const result: ParseSemanticResult = parsedResult!;
  const units = result.parsed.units;
  const typeHints = result.type_hints;

  // ═════════════════════════════════════════════════════════
  // Stage 2: DECOMPOSE — 从解析结果提取拆解动作
  // ═════════════════════════════════════════════════════════
  await runStage(PipelineStage.DECOMPOSE, '分解复合意图', async () => {
    const actions = result.parsed.units.map(
      (u) => u.action_text ?? u.main_text ?? '未命名动作',
    );
    return {
      outputSummary: actions.length > 1
        ? `分解出 ${actions.length} 个动作: ${actions.join('; ')}`
        : `单一动作: ${actions[0]}`,
      status: 'ok',
    };
  });

  // ═════════════════════════════════════════════════════════
  // Stage 3: PLAN — 生成执行计划（暂为 no-op）
  // ═════════════════════════════════════════════════════════
  await runStage(PipelineStage.PLAN, '生成执行计划（暂为 no-op）', async () => ({
    outputSummary: 'PLAN 阶段暂未实现',
    status: 'skipped',
  }));

  // ═════════════════════════════════════════════════════════
  // Stage 4: VALIDATE — 规则中心预校验
  // ═════════════════════════════════════════════════════════
  let validationIssues: ValidationIssue[] = [];
  let validationFailed = false;

  await runStage(
    PipelineStage.VALIDATE,
    `规则中心校验 ${units.length} 个 unit`,
    async () => {
      const allBlocking: ValidationIssue[] = [];
      const allWarnings: ValidationIssue[] = [];

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const typeHint = typeHints[i] || '发生';

        // 将 parsed unit 映射为记录 payload
        const recordPayload: Record<string, unknown> = {
          type: typeHint,
          content: unit.main_text ?? '',
          action_text: unit.action_text ?? null,
          event_text: unit.event_text ?? null,
          object_text: unit.object_text ?? null,
          result_text: unit.result_text ?? null,
          cause_text: unit.cause_text ?? null,
          time_anchor_date: unit.time_anchor?.resolved_date ?? null,
          time_text: unit.time_text ?? null,
          place_text: unit.place_text ?? null,
          item_id: unit.item_hint ?? null,
          sub_item_id: unit.sub_item_hint ?? null,
          mood: unit.mood ?? null,
          energy: unit.energy ?? null,
          body_state: unit.body_state ?? null,
          cost: unit.cost ?? null,
          duration_minutes: unit.duration_minutes ?? null,
          metric: unit.metric ?? null,
        };

        // 调用记录不变式校验
        const issues = validateRecordInvariants(recordPayload, { isUpdate: false });

        for (const issue of issues) {
          const vi: ValidationIssue = {
            field: issue.field,
            severity: issue.severity === 'blocking' ? 'blocking' : 'warning',
            ruleId: issue.code,
            message: `[unit ${i}] ${issue.message}`,
          };
          if (issue.severity === 'blocking') {
            allBlocking.push(vi);
          } else {
            allWarnings.push(vi);
          }
        }
      }

      validationIssues = [...allBlocking, ...allWarnings];
      const ruleIds = [...new Set(validationIssues.map((v) => v.ruleId))];

      if (allBlocking.length > 0) {
        validationFailed = true;
        return {
          outputSummary: `校验失败: ${allBlocking.length} 个阻断问题 — ${allBlocking.map((i) => i.message).join('; ')}`,
          status: 'failed',
          errorCode: 'VALIDATION_BLOCKED',
          ruleIds,
        };
      }

      if (allWarnings.length > 0) {
        return {
          outputSummary: `校验通过，${allWarnings.length} 个警告: ${allWarnings.map((i) => i.message).join('; ')}`,
          status: 'ok',
          ruleIds,
        };
      }

      return {
        outputSummary: `校验通过，${units.length} 个 unit 均符合规则中心约束`,
        status: 'ok',
        ruleIds,
      };
    },
  );

  if (validationFailed) {
    return {
      traceId: context.traceId,
      stages,
      overallStatus: 'failed',
      totalDurationMs: Date.now() - pipelineStart,
      errorCode: 'VALIDATION_BLOCKED',
      data: result,
    };
  }

  // ═════════════════════════════════════════════════════════
  // Stage 6: VERIFY — 解析结果结构校验
  // ═════════════════════════════════════════════════════════
  await runStage(
    PipelineStage.VERIFY,
    `结构校验: ${units.length} 个 unit`,
    async () => {
      const issues: string[] = [];

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];

        // 基本字段存在性检查
        if (!unit.main_text && !unit.action_text) {
          issues.push(`unit ${i}: main_text 和 action_text 均为空`);
        }
        const typeHint = typeHints[i];
        if (typeHint && !(RULES.record_type.types as readonly string[]).includes(typeHint)) {
          issues.push(`unit ${i}: type_hint "${typeHint}" 不在合法类型中`);
        }
        // 检查关键字段的类型一致性
        if (unit.duration_minutes !== null && typeof unit.duration_minutes !== 'number') {
          issues.push(`unit ${i}: duration_minutes 应为数字`);
        }
        if (unit.cost !== null && typeof unit.cost !== 'number') {
          issues.push(`unit ${i}: cost 应为数字`);
        }
        if (unit.item_hint && typeof unit.item_hint !== 'string') {
          issues.push(`unit ${i}: item_hint 应为字符串 ID`);
        }
      }

      if (issues.length > 0) {
        return {
          outputSummary: `结构校验发现问题: ${issues.join('; ')}`,
          status: 'failed',
          errorCode: 'VERIFY_STRUCTURAL',
        };
      }

      return {
        outputSummary: `结构校验通过，${units.length} 个 unit 字段类型正确`,
        status: 'ok',
      };
    },
  );

  // ═════════════════════════════════════════════════════════
  // Stage 8: EXPLAIN — 生成用户解释（暂为 no-op）
  // ═════════════════════════════════════════════════════════
  await runStage(PipelineStage.EXPLAIN, '生成用户解释（暂为 no-op）', async () => ({
    outputSummary: 'EXPLAIN 阶段暂未实现',
    status: 'skipped',
  }));

  // ═════════════════════════════════════════════════════════
  // Stage 9: LOG — trace 记录（暂为 no-op）
  // ═════════════════════════════════════════════════════════
  await runStage(PipelineStage.LOG, '记录 trace/decision（暂为 no-op）', async () => ({
    outputSummary: 'LOG 阶段暂未实现',
    status: 'skipped',
  }));

  // ── 判定整体状态 ──
  const hasFailed = stages.some((s) => s.status === 'failed');
  const hasSkipped = stages.some((s) => s.status === 'skipped');
  const overallStatus = hasFailed ? 'failed' : hasSkipped ? 'partial' : 'ok';

  return {
    traceId: context.traceId,
    stages,
    overallStatus,
    totalDurationMs: Date.now() - pipelineStart,
    data: result,
  };
}
