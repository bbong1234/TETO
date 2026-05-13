/**
 * POST /api/v2/records/confirm
 *
 * TETO 1.6 确认后重新清分回路。
 * 用户在前端确认卡片中做出选择后，此端点接收选择结果，
 * 重新调用 classifyInput 验证，再将用户选择合并入 AI 提案后正式入库。
 *
 * 流程：
 *   1. 接收原始输入 + 用户选择
 *   2. 调用 classifyInput（带用户选择上下文）
 *   3. 检查所有 issue 是否已被用户选择解决
 *   4. 未解决 → 返回新的 _clarification（最多循环 2 轮）
 *   5. 已解决 → 合并 AI 提案 + 用户选择 → 入库（review_status='confirmed'）
 */

import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { createRecordSafely } from '@/lib/domain/record-service';
import type { CreateRecordPayload } from '@/types/teto';
import { classifyInput } from '@/lib/ai/classify-input';
import type { ClarificationIssue, ClarificationNeeded, ClassificationResult } from '@/types/semantic';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES, genInputId, genUnitId } from '@/lib/observability/id-registry';
import { createComponentLogger } from '@/lib/observability/logger';
import { persistTraceSummary } from '@/lib/observability/trace';

const log = createComponentLogger('records-confirm');

/** 最大确认循环次数（防止无限循环） */
const MAX_CONFIRM_ROUNDS = 2;

/**
 * 判断单条 ClarificationIssue 是否已被用户选择解决
 */
function isIssueResolved(issue: ClarificationIssue, selections: Record<string, unknown>): boolean {
  switch (issue.type) {
    case 'item_ambiguous':
    case 'item_suggestion':
    case 'item_missing':
      return !!selections.item_id;
    case 'sub_item_ambiguous':
      return !!selections.sub_item_id;
    case 'shared_duration':
      return selections.duration_minutes != null;
    case 'metric_prompt':
      return selections.metric_value != null;
    case 'low_confidence':
    case 'parse_uncertain':
    case 'compound_uncertain':
    case 'boundary_blur':
      // 这些类型需要用户明确确认（或修改原文后重试）
      return selections._confirmed === true;
    default:
      return false;
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();
    const body = await request.json();

    const content: string = body.content;
    const date: string = body.date;
    const selections: Record<string, unknown> = body.selections || {};
    const confirmRound: number = typeof body._confirmRound === 'number' ? body._confirmRound : 0;

    if (!content || !date) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'content 和 date 为必填字段', ctx.traceId, 400);
    }

    // ── 1. 重新调用 classifyInput 获取基础分析 ──
    const classification: ClassificationResult = await classifyInput(
      userId, content, date, ctx.traceId
    );

    // ── 2. 检查用户选择是否解决了所有 issue ──
    if (classification.needsConfirmation && classification.clarification) {
      const unresolvedIssues = classification.clarification.issues.filter(
        issue => !isIssueResolved(issue, selections)
      );

      if (unresolvedIssues.length > 0) {
        // 检查是否超过最大循环次数
        if (confirmRound >= MAX_CONFIRM_ROUNDS) {
          // 超过最大轮次：强制入库（用户已多次确认），标记为需注意
          log.warn('确认循环超过最大轮次，强制入库', {
            details: { confirmRound, unresolvedCount: unresolvedIssues.length, issueTypes: unresolvedIssues.map(i => i.type) },
          });
          // 继续执行入库逻辑（下面 unified path）
        } else {
          // 返回新的确认卡片，仅包含未解决的 issue
          persistTraceSummary({ supabase, userId, traceId: ctx.traceId, operation: 'record_confirm', status: 'partial' });
          const updatedClarification: ClarificationNeeded = {
            ...classification.clarification,
            issues: unresolvedIssues,
            timestamp: Date.now(),
          };
          return apiSuccess(
            {
              _clarification: updatedClarification,
              _compound: { detected: classification.isCompound, unitsCount: classification.unitsCount },
              _confirmRound: confirmRound + 1,
            },
            ctx.traceId, 200
          );
        }
      }
    }

    // ── 3. 所有 issue 已解决（或无需确认）→ 合并 AI 提案 + 用户选择 → 入库 ──
    const inputId = genInputId();
    const createdRecords: Record<string, unknown>[] = [];
    const splitRecordIds: string[] = [];
    const batchId = classification.isCompound ? crypto.randomUUID() : undefined;
    const proposals = classification.unitProposals;

    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i];
      const isMainRecord = i === 0;

      const createPayload: Record<string, unknown> = {
        content: proposal.contentSummary || content,
        date,
        type: (selections.type as string) || (proposal.fields.type as string) || '发生',
        input_id: isMainRecord ? inputId : genUnitId(inputId, i),
        ...(isMainRecord ? {} : { parent_input_id: inputId }),
        ...(batchId ? { batch_id: batchId } : {}),
        parsed_semantic: classification.rawParsed,
        review_status: 'confirmed',
        confidence_level: confirmRound > 0 ? 'medium' : 'high',
        input_source: 'ai',
        ...proposal.fields,
        // 用户选择覆盖 AI 提案（selections 中的字段显式覆盖）
        ...Object.fromEntries(
          Object.entries(selections).filter(([k]) => k !== '_confirmed' && k !== '_confirmRound')
        ),
      };

      const result = await createRecordSafely({
        userId,
        payload: createPayload as unknown as CreateRecordPayload,
        supabase,
      });

      if (!result.ok) {
        log.error('确认后记录创建失败', { details: { unitIndex: i, errors: result.errors.map(e => e.message) } });
        if (isMainRecord) {
          return apiError(
            ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
            result.errors.map(e => e.message).join('; '),
            ctx.traceId, 400,
            result.errors.map(e => ({ code: e.code, message: e.message }))
          );
        }
        continue;
      }

      const record = result.data as unknown as Record<string, unknown>;
      createdRecords.push(record);

      if (!isMainRecord && record.id) {
        splitRecordIds.push(record.id as string);
        const mainRecordId = createdRecords[0]?.id;
        if (mainRecordId) {
          await supabase.from('record_links').insert({
            source_id: record.id,
            target_id: mainRecordId,
            link_type: 'derived_from',
            user_id: userId,
          }).select('id').maybeSingle();
        }
      }
    }

    if (createdRecords.length === 0) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '所有记录创建失败', ctx.traceId, 500);
    }

    // 持久化决策日志
    if (classification.decisions.length > 0) {
      const decisionRows = classification.decisions.map(d => ({
        decision_id: d.decisionId,
        trace_id: ctx.traceId,
        decision_type: d.type,
        input_summary: d.explain,
        output_summary: JSON.stringify(proposals[d.unitIndex]?.fields ?? {}),
        metadata: d.detail ?? {},
      }));
      const { error: decErr } = await supabase.from('decision_logs').insert(decisionRows);
      if (decErr) {
        log.warn('决策日志写入失败（非致命）', { details: { error: decErr.message } });
      }
    }

    // 持久化用户确认操作日志（可审计）
    if (classification.needsConfirmation) {
      const { error: corrErr } = await supabase.from('corrections').insert({
        record_id: createdRecords[0]?.id,
        user_id: userId,
        field_corrected: '_clarification_resolved',
        old_value: JSON.stringify(classification.clarification?.issues.map(i => i.type) ?? []),
        new_value: JSON.stringify(Object.keys(selections)),
        input_id: inputId,
        decision_type: 'USER_CONFIRM',
      });
      if (corrErr) {
        log.warn('确认记录写入 corrections 失败（非致命）', { details: { error: corrErr.message } });
      }
    }

    persistTraceSummary({ supabase, userId, traceId: ctx.traceId, operation: 'record_confirm', status: 'ok' });

    return apiSuccess(
      {
        ...createdRecords[0],
        _compound: classification.isCompound
          ? { detected: true, unitsCount: classification.unitsCount, splitRecordIds }
          : undefined,
        _decisions: classification.decisions,
      },
      ctx.traceId, 201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
