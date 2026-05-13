/**
 * decision-logger.ts — 统一决策日志接口 (TETO 1.6)
 *
 * 所有关键决策点通过 logDecision() 写入结构化日志。
 * 每条日志包含：traceId、behaviorId/decisionId、操作描述、变更详情。
 *
 * 写入目标：
 *   - 开发环境：结构化控制台输出（logger）
 *   - 生产环境：stdout JSON + persistDecisionLog() 写入 decision_logs 表
 */

import { logger } from './logger';
import type { LogEntry } from './logger';
import type { createClient } from '@/lib/supabase/server';

/** 一次决策的结构化记录 */
export interface DecisionDetail {
  /** 决策类型标识 */
  decision: string;
  /** 操作描述（人类可读） */
  action: string;
  /** 变更字段列表：old → new */
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
  /** 匹配链路细节 */
  matchTrace?: Array<{ stage: string; candidate: string; result: string }>;
  /** 分类原因 */
  classificationReason?: string;
  /** 相关实体 ID */
  entityId?: string;
  /** 扩展数据 */
  meta?: Record<string, unknown>;
}

/**
 * 统一决策日志写入接口
 *
 * @param traceId   当前追踪 ID
 * @param detail    决策详情
 * @param extra     附加 LogEntry 字段（behaviorId, errorCode 等）
 */
export function logDecision(
  traceId: string | undefined,
  detail: DecisionDetail,
  extra?: Partial<Pick<LogEntry, 'behaviorId' | 'decisionId' | 'errorCode' | 'componentId' | 'relatedRecordId' | 'durationMs'>>
): void {
  logger.info(`[决策] ${detail.action}`, {
    traceId,
    decisionId: extra?.decisionId,
    componentId: extra?.componentId ?? 'CMP-OR',
    relatedRecordId: extra?.relatedRecordId,
    details: {
      decision: detail.decision,
      changes: detail.changes,
      matchTrace: detail.matchTrace,
      classificationReason: detail.classificationReason,
      entityId: detail.entityId,
      meta: detail.meta,
    },
    errorCode: extra?.errorCode,
    durationMs: extra?.durationMs,
  });
}

/**
 * 记录分类决策 —— 为什么这个 unit 被分类为某种 type_hint
 */
export function logClassification(
  traceId: string | undefined,
  unitIndex: number,
  typeHint: string,
  reason: string,
): void {
  logDecision(traceId, {
    decision: 'CLASSIFICATION',
    action: `Unit[${unitIndex}] 分类为 "${typeHint}"`,
    classificationReason: reason,
    entityId: `unit-${unitIndex}`,
  });
}

/**
 * 记录事项匹配决策 —— 匹配到了哪个事项、走的哪步策略
 */
export function logItemMatch(
  traceId: string | undefined,
  hint: string,
  result: string,
  matchType: string,
  confidence: string,
): void {
  logDecision(traceId, {
    decision: 'ITEM_MATCH',
    action: `事项匹配: hint="${hint}" → ${result}`,
    matchTrace: [{ stage: matchType, candidate: hint, result }],
    meta: { confidence, hint, matchType },
  });
}

/**
 * 记录字段变更 —— 旧值 → 新值
 */
export function logFieldChanges(
  traceId: string | undefined,
  recordId: string,
  changes: Array<{ field: string; from: unknown; to: unknown }>,
  operation: string,
): void {
  logDecision(traceId, {
    decision: 'FIELD_CHANGE',
    action: `${operation}: 记录 ${recordId}`,
    changes,
    entityId: recordId,
  }, { relatedRecordId: recordId });
}

// ═══════════════════════════════════════════════════════════
// DB 持久化
// ═══════════════════════════════════════════════════════════

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface PersistDecisionParams {
  supabase: SupabaseClient;
  userId: string;
  traceId?: string;
  spanId?: string;
  decisionId?: string;
  decisionType: string;
  inputSummary?: string;
  outputSummary?: string;
  confidence?: number;
  ruleIds?: string[];
  errorCode?: string;
  metadata?: Record<string, unknown>;
  detail?: DecisionDetail;
  extra?: Partial<Pick<LogEntry, 'behaviorId' | 'decisionId' | 'errorCode' | 'componentId' | 'relatedRecordId' | 'durationMs'>>;
}

/**
 * 持久化决策日志到 decision_logs 表
 *
 * 与 logDecision() 配合使用：
 *   - logDecision() → 控制台/结构化日志
 *   - persistDecisionLog() → DB 持久化（供 diagnose/trends API 查询）
 *
 * 调用方需提供 supabase client 和 userId。
 * 不会 throw——写入失败时静默记录 error log。
 */
export async function persistDecisionLog(params: PersistDecisionParams): Promise<void> {
  const {
    supabase,
    userId,
    traceId,
    spanId,
    decisionId,
    decisionType,
    inputSummary,
    outputSummary,
    confidence,
    ruleIds,
    errorCode,
    metadata,
    detail,
    extra,
  } = params;

  try {
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      decision_id: decisionId ?? extra?.decisionId ?? 'DEC-UNKNOWN',
      decision_type: decisionType,
      trace_id: traceId,
      span_id: spanId,
      input_summary: inputSummary ?? (detail ? JSON.stringify({
        decision: detail.decision,
        action: detail.action,
        entityId: detail.entityId,
        changes: detail.changes,
        classificationReason: detail.classificationReason,
      }) : null),
      output_summary: outputSummary ?? (detail?.meta ? JSON.stringify(detail.meta) : null),
      confidence: confidence ?? null,
      rule_ids: ruleIds ?? [],
      error_code: errorCode ?? extra?.errorCode ?? null,
      metadata: metadata ?? detail?.meta ?? {},
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('decision_logs')
      .insert(insertPayload);

    if (error) {
      logger.error('[决策持久化失败]', {
        details: {
          pgError: error.message,
          pgCode: error.code,
          decisionType,
          decisionId,
          traceId,
        },
      });
    }
  } catch (err) {
    logger.error('[决策持久化异常]', {
      details: {
        error: err instanceof Error ? err.message : String(err),
        decisionType,
      },
    });
  }
}

/**
 * 标记记录衍生数据需要重算
 *
 * 在以下场景调用：
 *   - correct API 纠错后
 *   - AI enhancement 写入后
 *   - deleteRecordSafely 删除后
 *   - updateRecordSafely 重要字段变更后
 *
 * 当前实现：通过 decision_log 表持久化标记（无独立 dirty 表）。
 * 后续 goal-engine / insights 在查询时可通过 decision_logs 检查是否需要重算。
 */
export async function markRecordDerivedDataDirty(params: {
  supabase: SupabaseClient;
  userId: string;
  recordId: string;
  reason: 'correction' | 'ai_enhancement' | 'delete' | 'manual_update';
  traceId?: string;
  decisionId?: string;
  affectedDomains?: string[];
}): Promise<void> {
  const {
    supabase,
    userId,
    recordId,
    reason,
    traceId,
    decisionId,
    affectedDomains = ['trust', 'goal', 'insight'],
  } = params;

  await persistDecisionLog({
    supabase,
    userId,
    traceId,
    decisionId: decisionId ?? `DEC-DIRTY-${recordId.slice(0, 8)}`,
    decisionType: 'DERIVED_DATA_DIRTY',
    inputSummary: JSON.stringify({ record_id: recordId, reason }),
    outputSummary: JSON.stringify({ requires_recompute: true, affected_domains: affectedDomains }),
    metadata: {
      record_id: recordId,
      reason,
      requires_recompute: true,
      affected_domains: affectedDomains,
    },
  });
}
