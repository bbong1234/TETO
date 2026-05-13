/**
 * AI 记录服务 — AI 增强写入经规则中心管控
 *
 * 核心流程：
 * 1. 查询 existingRecord
 * 2. 调用 applyFieldOwnershipPolicy → allowedUpdate + AiWriteResult
 * 3. 自动追加 AI 元数据（review_status, data_nature, period_source_id）
 * 4. validateRecordInvariants(mergedRecord)
 * 5. validateRecordRelations(mergedRecord, { userId, supabase })
 * 6. 有 blocking → ok=false，不写入
 * 7. 执行 supabase.from('records').update(allowedUpdate)
 * 8. 返回 DomainResult，data._aiWriteResult = AiWriteResult
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validateRecordInvariants } from './record-invariants'
import { validateRecordRelations } from './relation-invariants'
import { applyFieldOwnershipPolicy } from './field-ownership-policy'
import type { AiWriteResult } from './field-ownership-policy'
import { AI_FIELD_POLICIES } from './ai-write-policy'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface ApplyAiEnhancementSafelyParams {
  userId: string
  recordId: string
  aiUpdate: Record<string, any>
  source?: { type: 'parse' | 'period_expansion'; sourceId?: string }
  supabase: SupabaseClient
}

/**
 * 合并 issues 为 DomainResult
 */
function buildDomainResult<T>(
  issues: InvariantIssue[],
  data?: T
): DomainResult<T> {
  const errors = issues.filter(i => i.severity === 'blocking')
  const warnings = issues.filter(i => i.severity !== 'blocking')

  return {
    ok: errors.length === 0,
    data,
    errors,
    warnings,
  }
}

/**
 * 安全应用 AI 增强
 *
 * 流程：
 * 1. 查询 existingRecord
 * 2. applyFieldOwnershipPolicy → allowedUpdate + AiWriteResult
 * 3. 自动追加 AI 元数据
 * 4. validateRecordInvariants + validateRecordRelations
 * 5. 执行写入
 * 6. 返回 DomainResult
 */
export async function applyAiEnhancementSafely(
  params: ApplyAiEnhancementSafelyParams
): Promise<DomainResult<Record<string, any> & { _aiWriteResult?: AiWriteResult }>> {
  const { userId, recordId, aiUpdate, source, supabase } = params

  // 1. 查询 existingRecord
  const { data: existingRecord, error: fetchError } = await supabase
    .from('records')
    .select('*')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError) {
    return buildDomainResult([{
      code: 'AI_ENHANCE_FETCH_FAILED', severity: 'blocking',
      message: `查询记录失败: ${fetchError.message}`, entity: 'record', entityId: recordId,
    }])
  }

  if (!existingRecord) {
    return buildDomainResult([{
      code: 'RECORD_NOT_FOUND', severity: 'blocking',
      message: '记录不存在', entity: 'record', entityId: recordId,
    }])
  }

  // 2. 应用字段所有权策略
  const { allowedUpdate, result: aiWriteResult } = applyFieldOwnershipPolicy(
    existingRecord,
    aiUpdate,
    AI_FIELD_POLICIES
  )

  // 如果 AI 被策略完全阻止，没有任何字段可写入
  if (Object.keys(allowedUpdate).length === 0) {
    return buildDomainResult([], {
      ...existingRecord,
      _aiWriteResult: aiWriteResult,
    })
  }

  // 3. 自动追加 AI 元数据
  // review_status: AI 写入时设为 'unchecked'（如果当前不是 'confirmed'/'corrected'）
  if (existingRecord.review_status !== 'confirmed' && existingRecord.review_status !== 'corrected') {
    allowedUpdate.review_status = 'unchecked'
  }

  // data_nature: 不自动修改。AI 补充用户已有记录的字段，不改变整条记录的 data_nature
  // 只有派生记录（source.type='derived'）或周期规律展开记录（source.type='period_expansion'）才设为 'inferred'
  if (source?.type === 'period_expansion') {
    if (existingRecord.review_status !== 'confirmed' && existingRecord.review_status !== 'corrected') {
      allowedUpdate.data_nature = 'inferred'
    }
  }

  // period_source_id: 如果有来源
  if (source?.sourceId) {
    allowedUpdate.period_source_id = source.sourceId
  }

  // 4. 合并 existingRecord + allowedUpdate → mergedRecord（校验用）
  const mergedRecord: Record<string, any> = { ...existingRecord }
  for (const [key, value] of Object.entries(allowedUpdate)) {
    mergedRecord[key] = value
  }

  // 5. 执行规则校验
  const invariantIssues = validateRecordInvariants(mergedRecord, { isUpdate: true })
  const relationIssues = await validateRecordRelations(mergedRecord, { userId, supabase })
  const allIssues = [...invariantIssues, ...relationIssues]

  // 有 blocking → 不写入
  const blockingIssues = allIssues.filter(i => i.severity === 'blocking')
  if (blockingIssues.length > 0) {
    return buildDomainResult(allIssues)
  }

  // 6. 执行写入
  const { data: updatedRecord, error: updateError } = await supabase
    .from('records')
    .update(allowedUpdate)
    .eq('id', recordId)
    .eq('user_id', userId)
    .select()
    .maybeSingle()

  if (updateError) {
    return buildDomainResult([...allIssues, {
      code: 'AI_ENHANCE_UPDATE_FAILED', severity: 'blocking',
      message: `AI 增强写入失败: ${updateError.message}`, entity: 'record', entityId: recordId,
    }])
  }

  return buildDomainResult(allIssues, {
    ...(updatedRecord ?? mergedRecord),
    _aiWriteResult: aiWriteResult,
  })
}
