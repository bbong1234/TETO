/**
 * GET /api/v2/diagnose?trace_id=T-xxx
 *
 * TETO 1.6 诊断 API — 让大模型高效定位断点。
 * 不用全项目扫描，一次调用拿到 trace 上下文 + break_point + 关联决策/规则 + 建议修复方向。
 */

import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { getTraceSummary, type SpanResult, type TraceSummary } from '@/lib/observability/trace';
import { getRuleId, RULES_VERSION } from '@/lib/rules';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { PipelineStage } from '@/lib/ai/agent-pipeline';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

interface SpanNode {
  spanId: string;
  stage: string;
  stageIndex: number;
  status: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  errorCode: string | null;
}

interface RelatedDecision {
  decisionId: string;
  decisionType: string;
  inputSummary: string;
  outputSummary: string;
  confidence: number;
  ruleIds: string[];
}

interface RelatedRule {
  ruleId: string;
  ruleCode: string;
  stage: string;
}

interface SuggestedFix {
  targetFile: string;
  targetFunction: string;
  errorCategory: string;
}

interface DiagnosisResult {
  traceId: string;
  status: 'ok' | 'failed' | 'partial';

  /** 断点定位（出错时最重要） */
  breakPoint: {
    stage: PipelineStage;
    stageName: string;
    spanId: string;
    errorCode: string | null;
    errorMessage: string | null;
    inputSummary: string;
    outputSummary: string;
    durationMs: number;
  } | null;

  /** 完整 span 树 */
  spans: SpanNode[];

  /** 关联的决策 */
  relatedDecisions: RelatedDecision[];

  /** 关联的规则 */
  relatedRules: RelatedRule[];

  /** 建议修复方向 */
  suggestedFixes: SuggestedFix[];

  /** 大模型友好摘要（一行文本） */
  aiPromptSummary: string;
}

// ═══════════════════════════════════════════════════════════
// 修复建议映射（基于 error_code → 文件/函数）
// ═══════════════════════════════════════════════════════════

const ERROR_TO_FIX_MAP: Record<string, SuggestedFix> = {
  RECORD_INVALID_TYPE: {
    targetFile: 'src/lib/domain/record-invariants.ts',
    targetFunction: 'validateRecordInvariants()',
    errorCategory: '类型校验',
  },
  RECORD_INVALID_LIFECYCLE: {
    targetFile: 'src/lib/domain/record-invariants.ts',
    targetFunction: 'validateRecordInvariants()',
    errorCategory: '生命周期校验',
  },
  RECORD_SUB_ITEM_REQUIRES_ITEM: {
    targetFile: 'src/lib/domain/record-invariants.ts',
    targetFunction: 'validateRecordInvariants()',
    errorCategory: '实体关系校验',
  },
  ITEM_NOT_FOUND: {
    targetFile: 'src/lib/domain/relation-invariants.ts',
    targetFunction: 'validateRecordRelations()',
    errorCategory: '实体关系校验',
  },
  LIFECYCLE_ALREADY_TERMINAL: {
    targetFile: 'src/lib/domain/record-lifecycle-invariants.ts',
    targetFunction: 'validateLifecycleTransition()',
    errorCategory: '生命周期校验',
  },
  GOAL_NO_DATA: {
    targetFile: 'src/lib/db/goal-engine.ts',
    targetFunction: 'computeGoalEngine()',
    errorCategory: '数据查询',
  },
  PARSE_INSUFFICIENT_INFO: {
    targetFile: 'src/lib/ai/parse-semantic.ts',
    targetFunction: 'parseNaturalInput()',
    errorCategory: 'AI 解析',
  },
};

// ═══════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const targetTraceId = searchParams.get('trace_id');

    if (!targetTraceId) {
      return apiError(
        ERROR_CODES.PARSE_INSUFFICIENT_INFO,
        '缺少 trace_id 查询参数。用法: /api/v2/diagnose?trace_id=T-xxx',
        ctx.traceId,
        400
      );
    }

    const summary: TraceSummary | null = getTraceSummary(targetTraceId);
    const spans = summary?.spans ?? [];

    // 查询持久化的 decision_logs（无论内存是否有数据，都尝试查询 DB）
    let relatedDecisions: RelatedDecision[] = [];
    const supabase = await createClient();
    const { data: dbDecisions, error: dbErr } = await supabase
      .from('decision_logs')
      .select('decision_id, decision_type, input_summary, output_summary, confidence, rule_ids')
      .eq('trace_id', targetTraceId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!dbErr && dbDecisions) {
      relatedDecisions = dbDecisions.map((d: Record<string, unknown>) => ({
        decisionId: (d.decision_id as string) ?? '',
        decisionType: (d.decision_type as string) ?? '',
        inputSummary: (d.input_summary as string) ?? '',
        outputSummary: (d.output_summary as string) ?? '',
        confidence: (d.confidence as number) ?? 0,
        ruleIds: (d.rule_ids as string[]) ?? [],
      }));
    }

    // 如果内存无数据，尝试从 trace_summaries 表查询
    let dbTraceStatus: string | null = null;
    if (!summary || spans.length === 0) {
      const { data: dbTrace } = await supabase
        .from('trace_summaries')
        .select('status, operation, total_duration_ms, span_count, error_code, error_message')
        .eq('trace_id', targetTraceId)
        .eq('user_id', userId)
        .maybeSingle();

      if (dbTrace) {
        dbTraceStatus = (dbTrace.status as string) ?? 'ok';
      }
    }

    // 构建 span 节点树
    const spanNodes: SpanNode[] = spans.map((s: SpanResult) => ({
      spanId: s.spanId,
      stage: s.stageName,
      stageIndex: s.stage,
      status: s.status,
      inputSummary: s.inputSummary,
      outputSummary: s.outputSummary,
      durationMs: s.durationMs,
      errorCode: s.errorCode ?? null,
    }));

    // 断点定位：找到第一个失败的 span
    const failedSpan = spans.find((s: SpanResult) => s.status === 'failed');

    const breakPoint = failedSpan
      ? {
          stage: failedSpan.stage,
          stageName: failedSpan.stageName,
          spanId: failedSpan.spanId,
          errorCode: failedSpan.errorCode ?? null,
          errorMessage: failedSpan.errorMessage ?? null,
          inputSummary: failedSpan.inputSummary,
          outputSummary: failedSpan.outputSummary,
          durationMs: failedSpan.durationMs,
        }
      : null;

    // 关联规则（从 span 的 errorCode 反查 rule_id）
    const relatedRules: RelatedRule[] = [];
    if (failedSpan?.errorCode) {
      const ruleId = getRuleId(failedSpan.errorCode);
      if (ruleId) {
        relatedRules.push({
          ruleId,
          ruleCode: failedSpan.errorCode,
          stage: failedSpan.stageName,
        });
      }
    }

    // 修复建议
    const suggestedFixes: SuggestedFix[] = [];
    if (failedSpan?.errorCode) {
      const fix = ERROR_TO_FIX_MAP[failedSpan.errorCode];
      if (fix) {
        suggestedFixes.push(fix);
      }
    }
    // 即使没有准确映射，也给出通用建议
    if (suggestedFixes.length === 0 && failedSpan) {
      suggestedFixes.push({
        targetFile: 'src/lib/domain/',
        targetFunction: `${failedSpan.stageName.toLowerCase()}_invariants`,
        errorCategory: '未知',
      });
    }

    // 大模型友好摘要
    const aiPromptSummary = summary
      ? summary.status === 'ok'
        ? `Trace ${targetTraceId}: 全部 ${summary.spanCount} 个 span 正常完成，总耗时 ${summary.totalDurationMs}ms。`
        : `Trace ${targetTraceId}: 在 ${failedSpan?.stageName ?? '未知'} 阶段失败${failedSpan?.errorCode ? ` (${failedSpan.errorCode})` : ''}，${failedSpan?.errorMessage ?? '无详细错误信息'}。共 ${summary.spanCount} 个 span，总耗时 ${summary.totalDurationMs}ms。`
      : `Trace ${targetTraceId}: 未找到 trace 数据（可能已过期或 trace_id 不正确）。`;

    const result: DiagnosisResult = {
      traceId: targetTraceId,
      status: (summary?.status ?? dbTraceStatus ?? 'partial') as 'ok' | 'failed' | 'partial',
      breakPoint,
      spans: spanNodes,
      relatedDecisions,
      relatedRules,
      suggestedFixes,
      aiPromptSummary,
    };

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '诊断服务内部错误';
    return apiError(ERROR_CODES.GOAL_NO_DATA, message, ctx.traceId, 500);
  }
}
