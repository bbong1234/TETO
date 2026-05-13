/**
 * 统一写入服务 — createRecordSafely / updateRecordSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 * - 归一化后全程使用 normalizedPayload/normalizedPatch，不用原始 payload
 * - updateRecordSafely 合并 existingRecord + normalizedPatch 做校验，但只写 normalizedPatch
 */

import type { DomainResult, BatchDomainResult, BatchItemResult, InvariantIssue } from './domain-errors'
import { validateRecordInvariants } from './record-invariants'
import { validateRecordRelations } from './relation-invariants'
import { validateLifecycleTransition } from './record-lifecycle-invariants'
import { createRecord, updateRecord, getRecordById, batchCreateRecords, deleteRecord } from '@/lib/db/records'
import { createRecordLink } from '@/lib/db/record-links'
import { normalizeRecordType } from '@/types/teto'
import type { CreateRecordPayload, UpdateRecordPayload } from '@/types/teto'
import type { Record as TetoRecord } from '@/types/teto'
import { startSpan, endSpan } from '@/lib/observability/trace'
import { PipelineStage } from '@/lib/ai/agent-pipeline'
import { ERROR_CODES, genBehaviorId } from '@/lib/observability/id-registry'
import { parseRlsError } from '@/lib/supabase/rls-error'
import { logDecision, logFieldChanges, persistDecisionLog, markRecordDerivedDataDirty } from '@/lib/observability/decision-logger'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreateRecordSafelyParams {
  userId: string
  payload: CreateRecordPayload
  supabase: SupabaseClient
  traceId?: string
}

interface UpdateRecordSafelyParams {
  userId: string
  id: string
  payload: UpdateRecordPayload
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 * - normalizeRecordType: 映射旧类型（'情绪'/'花费'/'结果' → '发生'），默认 '发生'
 * - time_precision === 'inherited' → 'approx'（'inherited' 仅用于排序，不存入 DB）
 * - review_status 默认值：'unchecked'
 * - 默认值：type='发生', is_starred=false, sort_order=0
 */
function normalizeCreatePayload(payload: CreateRecordPayload): CreateRecordPayload {
  const normalized = { ...payload }

  // type 归一化
  normalized.type = normalizeRecordType(normalized.type ?? '发生')

  // time_precision: 'inherited' → 'approx'
  if (normalized.time_precision === 'inherited') {
    normalized.time_precision = 'approx'
  }

  // review_status 默认值
  if (normalized.review_status === undefined) {
    normalized.review_status = 'unchecked'
  }

  // 默认值（与 createRecord 中的逻辑一致）
  normalized.sort_order = normalized.sort_order ?? 0
  normalized.is_starred = normalized.is_starred ?? false

  return normalized
}

/**
 * 归一化更新 payload
 * - normalizeRecordType
 * - time_precision === 'inherited' → 'approx'
 */
function normalizeUpdatePayload(payload: UpdateRecordPayload): UpdateRecordPayload {
  const normalized = { ...payload }

  if (normalized.type) {
    normalized.type = normalizeRecordType(normalized.type)
  }

  if (normalized.time_precision === 'inherited') {
    normalized.time_precision = 'approx'
  }

  return normalized
}

/**
 * 合并 issues 为 DomainResult
 * - blocking → errors, ok=false
 * - warning/stats_exclusion → warnings, ok=true
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
 * 安全创建记录
 *
 * 流程：
 * 1. 归一化输入：payload → normalizedPayload
 * 2. validateRecordInvariants(normalizedPayload)
 * 3. validateRecordRelations(normalizedPayload, { userId, supabase })
 * 4. 合并 issues：有 blocking → ok=false；仅 warning/stats_exclusion → ok=true
 * 5. createRecord(userId, normalizedPayload)
 * 6. 返回 DomainResult<Record>
 */
export async function createRecordSafely(
  params: CreateRecordSafelyParams
): Promise<DomainResult<TetoRecord>> {
  const { userId, payload, supabase, traceId } = params
  genBehaviorId('B-010'); // createRecordSafely 入口追踪
  const spanCtx = traceId ? startSpan(traceId, PipelineStage.EXECUTE, '创建记录') : null

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateRecordInvariants(normalizedPayload)

  // 3. DB 关系校验
  const relationIssues = await validateRecordRelations(
    normalizedPayload,
    { userId, supabase }
  )

  // 4. 合并 issues
  const allIssues = [...invariantIssues, ...relationIssues]
  const blockingIssues = allIssues.filter(i => i.severity === 'blocking')

  if (blockingIssues.length > 0) {
    if (spanCtx) endSpan(spanCtx, 'failed', '校验失败', blockingIssues[0].code, blockingIssues[0].message);
    return buildDomainResult<TetoRecord>(allIssues)
  }

  // 5. 写入（使用 normalizedPayload，不用原始 payload）
  try {
    const record = await createRecord(userId, normalizedPayload)
    if (spanCtx) endSpan(spanCtx, 'ok', `记录 ${record.id} 创建成功`);
    logDecision(traceId, {
      decision: 'RECORD_CREATE',
      action: `创建记录`,
      entityId: record.id,
      meta: { type: normalizedPayload.type, content: normalizedPayload.content?.slice(0, 100) },
    });
    return buildDomainResult<TetoRecord>(allIssues, record)
  } catch (error) {
    if (spanCtx) endSpan(spanCtx, 'failed', '创建记录异常', undefined, error instanceof Error ? error.message : String(error));
    // DB 写入失败，作为 blocking error 返回
    const supabaseError = error as { code?: string; message?: string };
    const rlsInfo = parseRlsError(supabaseError);
    const dbError: InvariantIssue = {
      code: rlsInfo.isRls ? ERROR_CODES.RLS_POLICY_REJECTION : 'RECORD_CREATE_FAILED',
      severity: 'blocking',
      message: rlsInfo.isRls
        ? `RLS 拒绝: 表 ${rlsInfo.table ?? 'unknown'} — ${rlsInfo.message}`
        : (error instanceof Error ? error.message : '创建记录失败'),
      entity: 'record',
      details: rlsInfo.isRls ? { rlsTable: rlsInfo.table, pgCode: rlsInfo.pgCode } : undefined,
    }
    return buildDomainResult<TetoRecord>([...allIssues, dbError])
  }
}

/**
 * 安全更新记录
 *
 * 流程：
 * 1. 查询 existingRecord
 * 2. 归一化输入：payload → normalizedPatch
 * 3. 合并 existingRecord 与 normalizedPatch 为 mergedRecord（校验用）
 * 4. 对 mergedRecord 执行 validateRecordInvariants
 * 5. 对 mergedRecord 执行 validateRecordRelations
 * 6. 合并 issues
 * 7. updateRecord(userId, id, normalizedPatch) — 不传 mergedRecord，不传原始 payload
 * 8. 返回 DomainResult<Record>
 */
export async function updateRecordSafely(
  params: UpdateRecordSafelyParams
): Promise<DomainResult<TetoRecord>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询 existingRecord
  const existingRecord = await getRecordById(userId, id)
  if (!existingRecord) {
    return buildDomainResult<TetoRecord>([{
      code: 'RECORD_NOT_FOUND',
      severity: 'blocking',
      message: '记录不存在',
      entity: 'record',
      entityId: id,
    }])
  }

  // 2. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 3. 合并 existingRecord + normalizedPatch → mergedRecord（校验用）
  // normalizedPatch 有值用 normalizedPatch，未传保留 existingRecord
  const mergedRecord: Record<string, any> = { ...existingRecord } as Record<string, any>
  for (const [key, value] of Object.entries(normalizedPatch)) {
    if (value !== undefined) {
      mergedRecord[key] = value
    }
  }

  // 4. 纯逻辑校验（对合并后的完整数据）
  const invariantIssues = validateRecordInvariants(mergedRecord, { isUpdate: true })

  // 5. DB 关系校验（对合并后的完整数据）
  const relationIssues = await validateRecordRelations(
    mergedRecord,
    { userId, supabase }
  )

  // 6. 合并 issues
  const allIssues = [...invariantIssues, ...relationIssues]
  const blockingIssues = allIssues.filter(i => i.severity === 'blocking')

  if (blockingIssues.length > 0) {
    return buildDomainResult<TetoRecord>(allIssues)
  }

  // 7. 写入（使用 normalizedPatch，不传 mergedRecord 或原始 payload）
  try {
    const record = await updateRecord(userId, id, normalizedPatch)
    logFieldChanges(undefined, id,
      Object.keys(normalizedPatch).map(k => ({ field: k, from: (existingRecord as unknown as Record<string, unknown>)[k], to: (normalizedPatch as unknown as Record<string, unknown>)[k] })),
      'UPDATE');
    return buildDomainResult<TetoRecord>(allIssues, record)
  } catch (error) {
    const supabaseError = error as { code?: string; message?: string };
    const rlsInfo = parseRlsError(supabaseError);
    const dbError: InvariantIssue = {
      code: rlsInfo.isRls ? ERROR_CODES.RLS_POLICY_REJECTION : 'RECORD_UPDATE_FAILED',
      severity: 'blocking',
      message: rlsInfo.isRls
        ? `RLS 拒绝: 表 ${rlsInfo.table ?? 'unknown'} — ${rlsInfo.message}`
        : (error instanceof Error ? error.message : '更新记录失败'),
      entity: 'record',
      entityId: id,
      details: rlsInfo.isRls ? { rlsTable: rlsInfo.table, pgCode: rlsInfo.pgCode } : undefined,
    }
    return buildDomainResult<TetoRecord>([...allIssues, dbError])
  }
}

// ──────────────────────────────────────────
// P2: 生命周期 + 批量 + 链接 Safely 函数
// ──────────────────────────────────────────

/**
 * 校验关联实体是否有效，返回有效 id 或 null + warnings
 * 不得静默丢字段：如果因不存在被置 null，必须返回 warning 说明
 */
async function validateLifecycleEntities(
  supabase: SupabaseClient,
  userId: string,
  original: TetoRecord
): Promise<{
  validItemId: string | null
  validPhaseId: string | null
  validSubItemId: string | null
  warnings: InvariantIssue[]
}> {
  const warnings: InvariantIssue[] = []

  let validItemId = original.item_id
  if (original.item_id) {
    const { data: item } = await supabase
      .from('items')
      .select('id, status')
      .eq('id', original.item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!item) {
      validItemId = null
      warnings.push({
        code: 'LIFECYCLE_ENTITY_CLEARED', severity: 'warning',
        message: '事项不存在，已清除事项关联', entity: 'item', field: 'item_id',
        details: { original_item_id: original.item_id, reason: 'not_found' },
      })
    } else if ((item as { status: string }).status === '已搁置') {
      validItemId = null
      warnings.push({
        code: 'LIFECYCLE_ENTITY_CLEARED', severity: 'warning',
        message: '事项已搁置，已清除事项关联', entity: 'item', field: 'item_id',
        details: { original_item_id: original.item_id, reason: 'shelved' },
      })
    }
  }

  let validPhaseId = original.phase_id
  if (original.phase_id) {
    const { data: phase } = await supabase
      .from('phases')
      .select('id')
      .eq('id', original.phase_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!phase) {
      validPhaseId = null
      warnings.push({
        code: 'LIFECYCLE_ENTITY_CLEARED', severity: 'warning',
        message: '阶段不存在，已清除阶段关联', entity: 'phase', field: 'phase_id',
        details: { original_phase_id: original.phase_id, reason: 'not_found' },
      })
    }
  }

  let validSubItemId = original.sub_item_id
  if (original.sub_item_id) {
    const { data: subItem } = await supabase
      .from('sub_items')
      .select('id')
      .eq('id', original.sub_item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!subItem) {
      validSubItemId = null
      warnings.push({
        code: 'LIFECYCLE_ENTITY_CLEARED', severity: 'warning',
        message: '子项不存在，已清除子项关联', entity: 'sub_item', field: 'sub_item_id',
        details: { original_sub_item_id: original.sub_item_id, reason: 'not_found' },
      })
    }
  }

  return { validItemId, validPhaseId, validSubItemId, warnings }
}

/**
 * 从原记录构建新记录 payload 的通用字段拷贝
 */
function copyRecordFields(original: TetoRecord, overrides: Partial<CreateRecordPayload>): CreateRecordPayload {
  return {
    content: original.content,
    date: new Date().toISOString().split('T')[0],
    ...overrides,
    mood: original.mood ?? undefined,
    energy: original.energy ?? undefined,
    duration_minutes: original.duration_minutes ?? undefined,
    cost: original.cost ?? undefined,
    metric_value: original.metric_value ?? undefined,
    metric_unit: original.metric_unit ?? undefined,
    metric_name: original.metric_name ?? undefined,
    location: original.location ?? undefined,
    people: original.people ?? undefined,
    note: original.note ?? undefined,
    raw_input: original.raw_input ?? undefined,
    action_text: original.action_text ?? undefined,
    event_text: original.event_text ?? undefined,
    object_text: original.object_text ?? undefined,
    outcome_type: original.outcome_type ?? undefined,
    outcome_direction: original.outcome_direction ?? undefined,
    cause_text: original.cause_text ?? undefined,
    time_text: original.time_text ?? undefined,
    time_precision: original.time_precision ?? undefined,
    place_type: original.place_type ?? undefined,
    money_direction: original.money_direction ?? undefined,
    relation_roles: original.relation_roles ?? undefined,
    body_state: original.body_state ?? undefined,
    money_currency: original.money_currency ?? undefined,
    occurred_at_end: original.occurred_at_end ?? undefined,
    review_status: original.review_status ?? undefined,
    confidence_level: original.confidence_level ?? undefined,
    metrics: original.metrics ?? undefined,
  }
}

/**
 * 完成计划记录
 */
export async function completeRecordSafely(params: {
  userId: string
  id: string
  body: { occurred_at?: string; date?: string; completion_content?: string }
  supabase: SupabaseClient
}): Promise<DomainResult<TetoRecord>> {
  const { userId, id, body, supabase } = params

  const original = await getRecordById(userId, id)
  if (!original) {
    return buildDomainResult<TetoRecord>([{
      code: 'RECORD_NOT_FOUND', severity: 'blocking', message: '记录不存在', entity: 'record', entityId: id,
    }])
  }

  const lifecycleIssues = validateLifecycleTransition(original, 'complete')
  if (lifecycleIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<TetoRecord>(lifecycleIssues)
  }

  const { validItemId, validPhaseId, validSubItemId, warnings: entityWarnings } = await validateLifecycleEntities(supabase, userId, original)

  const now = new Date()
  const nowISO = now.toISOString()
  const todayStr = nowISO.split('T')[0]
  const occurredAt = body.occurred_at || nowISO
  const recordDate = body.date || occurredAt.split('T')[0] || todayStr

  const newPayload = copyRecordFields(original, {
    content: body.completion_content?.trim() || original.content,
    date: recordDate,
    type: '发生',
    occurred_at: occurredAt,
    item_id: validItemId || undefined,
    phase_id: validPhaseId || undefined,
    sub_item_id: validSubItemId || undefined,
  })

  const invariantIssues = validateRecordInvariants(newPayload)
  const relationIssues = await validateRecordRelations(newPayload, { userId, supabase })
  const allIssues = [...lifecycleIssues, ...entityWarnings, ...invariantIssues, ...relationIssues]

  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<TetoRecord>(allIssues)
  }

  try {
    const newRecord = await createRecord(userId, newPayload)
    await createRecordLink(userId, { source_id: newRecord.id, target_id: id, link_type: 'completes' })
    await updateRecord(userId, id, { lifecycle_status: 'completed' })
    return buildDomainResult<TetoRecord>(allIssues, newRecord)
  } catch (error) {
    const supabaseError = error as { code?: string; message?: string };
    const rlsInfo = parseRlsError(supabaseError);
    return buildDomainResult<TetoRecord>([...allIssues, {
      code: rlsInfo.isRls ? ERROR_CODES.RLS_POLICY_REJECTION : 'RECORD_COMPLETE_FAILED', severity: 'blocking',
      message: rlsInfo.isRls
        ? `RLS 拒绝: 表 ${rlsInfo.table ?? 'unknown'} — ${rlsInfo.message}`
        : (error instanceof Error ? error.message : '完成记录失败'), entity: 'record', entityId: id,
      details: rlsInfo.isRls ? { rlsTable: rlsInfo.table, pgCode: rlsInfo.pgCode } : undefined,
    }])
  }
}

/**
 * 推迟计划记录
 */
export async function postponeRecordSafely(params: {
  userId: string
  id: string
  new_date: string
  supabase: SupabaseClient
}): Promise<DomainResult<TetoRecord>> {
  const { userId, id, new_date, supabase } = params

  if (!new_date) {
    return buildDomainResult<TetoRecord>([{
      code: 'LIFECYCLE_POSTPONE_REQUIRES_DATE', severity: 'blocking',
      message: '推迟操作必须提供新日期', entity: 'record', field: 'new_date',
    }])
  }

  const original = await getRecordById(userId, id)
  if (!original) {
    return buildDomainResult<TetoRecord>([{
      code: 'RECORD_NOT_FOUND', severity: 'blocking', message: '记录不存在', entity: 'record', entityId: id,
    }])
  }

  const lifecycleIssues = validateLifecycleTransition(original, 'postpone')
  if (lifecycleIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<TetoRecord>(lifecycleIssues)
  }

  const { validItemId, validPhaseId, validSubItemId, warnings: entityWarnings } = await validateLifecycleEntities(supabase, userId, original)

  const newPayload = copyRecordFields(original, {
    content: original.content,
    date: new_date,
    type: '计划',
    time_anchor_date: new_date,
    item_id: validItemId || undefined,
    phase_id: validPhaseId || undefined,
    sub_item_id: validSubItemId || undefined,
  })

  const invariantIssues = validateRecordInvariants(newPayload)
  const relationIssues = await validateRecordRelations(newPayload, { userId, supabase })
  const allIssues = [...lifecycleIssues, ...entityWarnings, ...invariantIssues, ...relationIssues]

  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<TetoRecord>(allIssues)
  }

  try {
    const newRecord = await createRecord(userId, newPayload)
    await createRecordLink(userId, { source_id: newRecord.id, target_id: id, link_type: 'postponed_from' })
    await updateRecord(userId, id, { lifecycle_status: 'postponed' })
    return buildDomainResult<TetoRecord>(allIssues, newRecord)
  } catch (error) {
    const supabaseError = error as { code?: string; message?: string };
    const rlsInfo = parseRlsError(supabaseError);
    return buildDomainResult<TetoRecord>([...allIssues, {
      code: rlsInfo.isRls ? ERROR_CODES.RLS_POLICY_REJECTION : 'RECORD_POSTPONE_FAILED', severity: 'blocking',
      message: rlsInfo.isRls
        ? `RLS 拒绝: 表 ${rlsInfo.table ?? 'unknown'} — ${rlsInfo.message}`
        : (error instanceof Error ? error.message : '推迟记录失败'), entity: 'record', entityId: id,
      details: rlsInfo.isRls ? { rlsTable: rlsInfo.table, pgCode: rlsInfo.pgCode } : undefined,
    }])
  }
}

/**
 * 取消计划记录（仅更新 lifecycle_status，不创建新记录/链接）
 */
export async function cancelRecordSafely(params: {
  userId: string
  id: string
  supabase: SupabaseClient
}): Promise<DomainResult<TetoRecord>> {
  const { userId, id, supabase } = params

  const original = await getRecordById(userId, id)
  if (!original) {
    return buildDomainResult<TetoRecord>([{
      code: 'RECORD_NOT_FOUND', severity: 'blocking', message: '记录不存在', entity: 'record', entityId: id,
    }])
  }

  const lifecycleIssues = validateLifecycleTransition(original, 'cancel')
  if (lifecycleIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<TetoRecord>(lifecycleIssues)
  }

  try {
    const updated = await updateRecord(userId, id, { lifecycle_status: 'cancelled' })
    return buildDomainResult<TetoRecord>(lifecycleIssues, updated)
  } catch (error) {
    const supabaseError = error as { code?: string; message?: string };
    const rlsInfo = parseRlsError(supabaseError);
    return buildDomainResult<TetoRecord>([...lifecycleIssues, {
      code: rlsInfo.isRls ? ERROR_CODES.RLS_POLICY_REJECTION : 'RECORD_CANCEL_FAILED', severity: 'blocking',
      message: rlsInfo.isRls
        ? `RLS 拒绝: 表 ${rlsInfo.table ?? 'unknown'} — ${rlsInfo.message}`
        : (error instanceof Error ? error.message : '取消记录失败'), entity: 'record', entityId: id,
      details: rlsInfo.isRls ? { rlsTable: rlsInfo.table, pgCode: rlsInfo.pgCode } : undefined,
    }])
  }
}

/**
 * 批量安全创建记录
 */
export async function batchCreateRecordsSafely(params: {
  userId: string
  records: CreateRecordPayload[]
  supabase: SupabaseClient
}): Promise<BatchDomainResult<TetoRecord>> {
  const { userId, records, supabase } = params

  if (!Array.isArray(records) || records.length === 0) {
    return {
      ok: false, total: 0, success: 0, failed: 0, results: [],
      errors: [{ code: 'BATCH_EMPTY', severity: 'blocking', message: 'records 必须为非空数组', entity: 'record' }],
      warnings: [],
    }
  }

  if (records.length > 2000) {
    return {
      ok: false, total: records.length, success: 0, failed: records.length, results: [],
      errors: [{ code: 'BATCH_TOO_LARGE', severity: 'blocking', message: `单次批量导入上限 2000 条，当前 ${records.length} 条`, entity: 'record' }],
      warnings: [],
    }
  }

  const validRecords: CreateRecordPayload[] = []
  const results: BatchItemResult<TetoRecord>[] = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]

    if (!r.content || typeof r.content !== 'string' || !r.content.trim()) {
      results.push({
        index: i, ok: false,
        errors: [{ code: 'BATCH_MISSING_CONTENT', severity: 'blocking', message: `第 ${i + 1} 条: content 为必填字段`, entity: 'record' }],
        warnings: [],
      })
      continue
    }

    if (!r.date) {
      results.push({
        index: i, ok: false,
        errors: [{ code: 'BATCH_MISSING_DATE', severity: 'blocking', message: `第 ${i + 1} 条: date 为必填字段`, entity: 'record' }],
        warnings: [],
      })
      continue
    }

    const normalized = normalizeCreatePayload(r)
    const invariantIssues = validateRecordInvariants(normalized)
    const blockingIssues = invariantIssues.filter(i => i.severity === 'blocking')

    if (blockingIssues.length > 0) {
      results.push({
        index: i, ok: false,
        errors: blockingIssues,
        warnings: invariantIssues.filter(i => i.severity !== 'blocking'),
      })
      continue
    }

    validRecords.push(normalized)
    results.push({ index: i, ok: true, errors: [], warnings: invariantIssues.filter(i => i.severity !== 'blocking') })
  }

  if (validRecords.length > 0) {
    try {
      await batchCreateRecords(userId, validRecords)
    } catch (error) {
      return {
        ok: false, total: records.length, success: 0, failed: records.length, results,
        errors: [{ code: 'BATCH_CREATE_FAILED', severity: 'blocking', message: error instanceof Error ? error.message : '批量创建失败', entity: 'record' }],
        warnings: [],
      }
    }
  }

  const successCount = results.filter(r => r.ok).length
  const failedCount = results.length - successCount

  return {
    ok: failedCount === 0,
    total: records.length,
    success: successCount,
    failed: failedCount,
    results,
    errors: [],
    warnings: [],
  }
}

/**
 * 批量安全删除记录
 */
export async function batchDeleteRecordsSafely(params: {
  userId: string
  ids: string[]
  supabase: SupabaseClient
}): Promise<BatchDomainResult<void>> {
  const { userId, ids, supabase } = params

  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      ok: false, total: 0, success: 0, failed: 0, results: [],
      errors: [{ code: 'BATCH_EMPTY', severity: 'blocking', message: '请提供要删除的记录 ID 列表', entity: 'record' }],
      warnings: [],
    }
  }

  if (ids.length > 200) {
    return {
      ok: false, total: ids.length, success: 0, failed: ids.length, results: [],
      errors: [{ code: 'BATCH_TOO_LARGE', severity: 'blocking', message: '单次最多删除 200 条记录', entity: 'record' }],
      warnings: [],
    }
  }

  const { data: ownedRecords } = await supabase
    .from('records')
    .select('id')
    .in('id', ids)
    .eq('user_id', userId)

  const ownedIdSet = new Set((ownedRecords ?? []).map((r: { id: string }) => r.id))

  const results: BatchItemResult<void>[] = ids.map((id, index) => {
    if (!ownedIdSet.has(id)) {
      return { index, ok: false, errors: [{ code: 'RECORD_NOT_FOUND', severity: 'blocking', message: '记录不存在或不属于当前用户', entity: 'record', entityId: id }], warnings: [] }
    }
    return { index, ok: true, errors: [], warnings: [] }
  })

  const validIds = ids.filter(id => ownedIdSet.has(id))

  if (validIds.length > 0) {
    try {
      await supabase
        .from('record_links')
        .delete()
        .or(`source_id.in.(${validIds.join(',')}),target_id.in.(${validIds.join(',')})`)

      await supabase
        .from('record_tags')
        .delete()
        .in('record_id', validIds)

      await supabase
        .from('records')
        .delete()
        .in('id', validIds)
        .eq('user_id', userId)
    } catch (error) {
      return {
        ok: false, total: ids.length, success: 0, failed: ids.length, results,
        errors: [{ code: 'BATCH_DELETE_FAILED', severity: 'blocking', message: error instanceof Error ? error.message : '批量删除失败', entity: 'record' }],
        warnings: [],
      }
    }
  }

  const successCount = results.filter(r => r.ok).length
  const failedCount = results.length - successCount

  return {
    ok: failedCount === 0,
    total: ids.length,
    success: successCount,
    failed: failedCount,
    results,
    errors: [],
    warnings: [],
  }
}

/**
 * 安全删除单条记录
 *
 * 流程：
 * 1. 查询 existingRecord（带 user_id）
 * 2. 不存在 → blocking error
 * 3. 检查 lifecycle_status（终态返回 warning，不阻止删除）
 * 4. 检查 record_links 关联（有则返回 warning）
 * 5. 调用底层 deleteRecord
 * 6. 返回 DomainResult
 */
export async function deleteRecordSafely(params: {
  userId: string
  id: string
  supabase: SupabaseClient
  traceId?: string
}): Promise<DomainResult<{ id: string }>> {
  const { userId, id, supabase, traceId } = params

  // 1. 查询 existingRecord
  const existingRecord = await getRecordById(userId, id)
  if (!existingRecord) {
    return buildDomainResult<{ id: string }>([{
      code: 'RECORD_NOT_FOUND',
      severity: 'blocking',
      message: '记录不存在或不属于当前用户',
      entity: 'record',
      entityId: id,
    }])
  }

  const issues: InvariantIssue[] = []

  // 2. 生命周期检查：终态记录删除时返回 warning
  const TERMINAL_STATUSES = ['completed', 'postponed', 'cancelled']
  if (existingRecord.lifecycle_status && TERMINAL_STATUSES.includes(existingRecord.lifecycle_status)) {
    issues.push({
      code: 'DELETE_TERMINAL_RECORD',
      severity: 'warning',
      message: `该记录处于 ${existingRecord.lifecycle_status} 终态，删除可能导致数据一致性问题`,
      entity: 'record',
      entityId: id,
      field: 'lifecycle_status',
    })
  }

  // 3. 检查 record_links 关联
  const { data: links, error: linksErr } = await supabase
    .from('record_links')
    .select('id, source_id, target_id')
    .or(`source_id.eq.${id},target_id.eq.${id}`)
    .limit(1)

  if (linksErr) {
    issues.push({
      code: 'RECORD_LINKS_QUERY_FAILED',
      severity: 'warning',
      message: `查询记录关联失败: ${linksErr.message}`,
      entity: 'record',
      entityId: id,
    })
  } else if (links && links.length > 0) {
    issues.push({
      code: 'DELETE_RECORD_HAS_LINKS',
      severity: 'warning',
      message: `该记录存在关联记录，删除后关联将被破坏`,
      entity: 'record',
      entityId: id,
    })
  }

  // 4. 写入 decision log
  logDecision(traceId, {
    decision: 'DELETE_RECORD',
    action: `删除记录 ${id}`,
    entityId: id,
    meta: {
      lifecycle_status: existingRecord.lifecycle_status,
      has_links: links && links.length > 0,
      warnings: issues.filter(i => i.severity === 'warning').map(i => i.code),
    },
  }, { relatedRecordId: id })

  // 4b. 持久化到 decision_logs 表
  persistDecisionLog({
    supabase,
    userId,
    traceId,
    decisionId: `DEC-DELETE-${id.slice(0, 8)}`,
    decisionType: 'DELETE_RECORD',
    inputSummary: JSON.stringify({ record_id: id, lifecycle_status: existingRecord.lifecycle_status }),
    outputSummary: JSON.stringify({ has_links: links && links.length > 0, warnings: issues.filter(i => i.severity === 'warning').map(i => i.code) }),
  })

  // 4c. 标记衍生数据需要重算
  markRecordDerivedDataDirty({
    supabase,
    userId,
    recordId: id,
    reason: 'delete',
    traceId,
    affectedDomains: ['trust', 'goal', 'insight'],
  })

  // 5. 执行删除
  try {
    await deleteRecord(userId, id)
    return buildDomainResult<{ id: string }>(issues, { id })
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'RECORD_DELETE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '删除记录失败',
      entity: 'record',
      entityId: id,
    }
    return buildDomainResult<{ id: string }>([...issues, dbError])
  }
}

/**
 * 安全链接记录
 */
export async function linkRecordsSafely(params: {
  userId: string
  record_id: string
  linked_record_id: string | null
  supabase: SupabaseClient
}): Promise<DomainResult<{ record_id: string; linked_record_id: string | null }>> {
  const { userId, record_id, linked_record_id, supabase } = params

  if (!record_id) {
    return buildDomainResult<{ record_id: string; linked_record_id: string | null }>([{
      code: 'LINK_MISSING_RECORD_ID', severity: 'blocking', message: 'record_id 为必填字段', entity: 'record',
    }])
  }

  const { data: record, error: recErr } = await supabase
    .from('records')
    .select('id, user_id')
    .eq('id', record_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (recErr) {
    return buildDomainResult([{ code: 'RECORD_QUERY_FAILED', severity: 'blocking', message: `查询记录失败: ${recErr.message}`, entity: 'record', entityId: record_id }])
  }
  if (!record) {
    return buildDomainResult([{ code: 'RECORD_NOT_FOUND', severity: 'blocking', message: '记录不存在或不属于当前用户', entity: 'record', entityId: record_id }])
  }

  if (linked_record_id) {
    if (linked_record_id === record_id) {
      return buildDomainResult([{ code: 'LINK_SELF_REFERENCE', severity: 'blocking', message: '不能关联自己', entity: 'record' }])
    }

    const { data: linked, error: linkErr } = await supabase
      .from('records')
      .select('id, user_id')
      .eq('id', linked_record_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (linkErr) {
      return buildDomainResult([{ code: 'RECORD_QUERY_FAILED', severity: 'blocking', message: `查询关联记录失败: ${linkErr.message}`, entity: 'record', entityId: linked_record_id }])
    }
    if (!linked) {
      return buildDomainResult([{ code: 'LINK_TARGET_NOT_FOUND', severity: 'blocking', message: '关联目标记录不存在或不属于当前用户', entity: 'record', entityId: linked_record_id }])
    }
  }

  const { error: updateErr } = await supabase
    .from('records')
    .update({ linked_record_id: linked_record_id ?? null })
    .eq('id', record_id)
    .eq('user_id', userId)

  if (updateErr) {
    return buildDomainResult([{ code: 'LINK_UPDATE_FAILED', severity: 'blocking', message: `更新关联失败: ${updateErr.message}`, entity: 'record', entityId: record_id }])
  }

  return buildDomainResult([], { record_id, linked_record_id: linked_record_id ?? null })
}
