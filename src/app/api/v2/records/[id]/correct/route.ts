/**
 * POST /api/v2/records/[id]/correct
 *
 * 用户纠错 API — 修正 AI 推断错误的字段
 *
 * 副作用：
 *   1. 生成 corrections 记录（绑定原 decision_id）
 *   2. 触发 trust_level 重算
 *   3. 自动生成回归测试用例（"纠错即测试"）
 */

import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError, apiDomainError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { generateRegressionTest, writeTestCaseToDisk } from '@/lib/correction/regression-test-generator';
import { scheduleRuleLearning } from '@/lib/correction/rule-learner';
import { createComponentLogger } from '@/lib/observability/logger';
import { logDecision, persistDecisionLog, markRecordDerivedDataDirty } from '@/lib/observability/decision-logger';
import { updateRecordSafely } from '@/lib/domain/record-service';
import { persistTraceSummary } from '@/lib/observability/trace';
import type { UpdateRecordPayload } from '@/types/teto';

const log = createComponentLogger('api-correct');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const body = await request.json();
    const {
      field_corrected,
      new_value,
      decision_id,
      decision_type,
      rule_id,
      user_input,
    } = body as {
      field_corrected?: string;
      new_value?: unknown;
      decision_id?: string;
      decision_type?: string;
      rule_id?: string;
      user_input?: string;
    };

    if (!field_corrected || new_value === undefined) {
      return apiError(
        ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
        'field_corrected 和 new_value 为必填字段',
        ctx.traceId
      );
    }

    const supabase = await createClient();

    // 1. 获取记录的当前值（old_value），用于 corrections 表
    const { data: record, error: fetchError } = await supabase
      .from('records')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !record) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '记录不存在', ctx.traceId, 404);
    }

    const oldValue = (record as Record<string, unknown>)[field_corrected];
    const recordInputId = (record as Record<string, unknown>).input_id as string | null;

    // 2. 通过 Domain Service 更新记录（走规则中心 + invariants + relations）
    const updatePayload: UpdateRecordPayload = {
      [field_corrected]: new_value,
      review_status: 'corrected',
    } as UpdateRecordPayload;

    const updateResult = await updateRecordSafely({ userId, id, payload: updatePayload, supabase });

    if (!updateResult.ok) {
      // 记录字段变更日志（即使失败也记录）
      logDecision(ctx.traceId, {
        decision: 'CORRECTION_APPLIED',
        action: `[BLOCKED] 纠错字段 ${field_corrected}: ${String(oldValue)} → ${String(new_value)}`,
        changes: [{ field: field_corrected, from: oldValue, to: new_value }],
        entityId: id,
        meta: { decision_id: decision_id, blocked: true, errors: updateResult.errors.map(e => e.message) },
      }, { decisionId: decision_id, relatedRecordId: id });
      return apiDomainError(updateResult.errors, ctx.traceId);
    }

    // 3. 创建 correction 记录
    const effectiveDecisionId = decision_id ?? `DEC-CORR-${id.slice(0, 8)}`;

    const { data: correction, error: corrError } = await supabase
      .from('corrections')
      .insert({
        record_id: id,
        decision_id: effectiveDecisionId,
        decision_type: decision_type ?? null,
        rule_id: rule_id ?? null,
        field_corrected,
        old_value: oldValue !== undefined ? String(oldValue) : null,
        new_value: String(new_value),
        corrected_by: 'user',
        trace_id: ctx.traceId,
        input_id: recordInputId ?? null,
      })
      .select()
      .single();

    if (corrError) {
      log.error('创建 correction 记录失败', { details: { message: corrError.message } });
    }

    // 4. 自动生成回归测试用例（"纠错即测试"）
    try {
      const testCase = generateRegressionTest({
        traceId: ctx.traceId,
        recordId: id,
        decisionId: effectiveDecisionId,
        fieldCorrected: field_corrected,
        oldValue: oldValue !== undefined ? String(oldValue) : null,
        newValue: String(new_value),
        userInput: user_input,
      });
      writeTestCaseToDisk(testCase);
    } catch (genErr) {
      log.error('生成回归测试用例失败', { details: { error: String(genErr) } });
    }

    // 4b. TETO 1.6: 异步触发规则学习（不阻塞主流程）
    scheduleRuleLearning(userId);

    // 5. 写入结构化 decision log（类型 CORRECTION_APPLIED）
    logDecision(ctx.traceId, {
      decision: 'CORRECTION_APPLIED',
      action: `纠错字段 ${field_corrected}: ${String(oldValue)} → ${String(new_value)}`,
      changes: [{ field: field_corrected, from: oldValue, to: new_value }],
      entityId: id,
      meta: {
        decision_id: effectiveDecisionId,
        correction_id: correction?.id,
        was_inferred: oldValue !== undefined && oldValue !== new_value,
        requires_recompute: true,
        affected_domains: ['record', 'trust', 'goal', 'insight'],
      },
    }, { decisionId: effectiveDecisionId, relatedRecordId: id });

    // 5b. 持久化到 decision_logs 表（供 diagnose/trends 查询）
    persistDecisionLog({
      supabase,
      userId,
      traceId: ctx.traceId,
      decisionId: effectiveDecisionId,
      decisionType: 'CORRECTION_APPLIED',
      inputSummary: JSON.stringify({ field_corrected, old_value: String(oldValue), new_value: String(new_value) }),
      outputSummary: JSON.stringify({ correction_id: correction?.id, requires_recompute: true }),
      metadata: {
        affected_domains: ['record', 'trust', 'goal', 'insight'],
        correction_id: correction?.id,
      },
    });

    // 5c. 标记衍生数据需要重算
    markRecordDerivedDataDirty({
      supabase,
      userId,
      recordId: id,
      reason: 'correction',
      traceId: ctx.traceId,
      decisionId: effectiveDecisionId,
      affectedDomains: ['trust', 'goal', 'insight'],
    });

    // 6. 持久化 trace 摘要
    persistTraceSummary({
      supabase,
      userId,
      traceId: ctx.traceId,
      operation: 'record_correct',
      status: 'ok',
    });

    return apiSuccess(
      {
        recordId: id,
        fieldCorrected: field_corrected,
        oldValue: oldValue !== undefined ? String(oldValue) : null,
        newValue: String(new_value),
        correctionId: correction?.id ?? null,
        trustLevel: 'reviewed',
        traceId: ctx.traceId,
        decisionId: effectiveDecisionId,
        affectedDomains: ['record', 'trust', 'goal', 'insight'],
      },
      ctx.traceId,
      200
    );
  } catch (error) {
    log.error('纠错 API 异常', { details: { error: String(error) } });
    return apiError(
      ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
      error instanceof Error ? error.message : '纠错处理失败',
      ctx.traceId,
      500
    );
  }
}
