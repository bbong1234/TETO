/**
 * 阶段统一写入服务 — createPhaseSafely / updatePhaseSafely / endPhaseSafely / deletePhaseSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validatePhaseInvariants } from './phase-invariants'
import { createPhase, updatePhase, deletePhase, getPhaseById } from '@/lib/db/phases'
import type { CreatePhasePayload, UpdatePhasePayload, Phase } from '@/types/teto'
import { genDecisionId, genToolCallId } from '@/lib/observability/id-registry'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreatePhaseSafelyParams {
  userId: string
  payload: CreatePhasePayload
  supabase: SupabaseClient
}

interface UpdatePhaseSafelyParams {
  userId: string
  id: string
  payload: UpdatePhasePayload
  supabase: SupabaseClient
}

interface EndPhaseSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

interface DeletePhaseSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 */
function normalizeCreatePayload(payload: CreatePhasePayload): CreatePhasePayload {
  const normalized = { ...payload }
  normalized.status = normalized.status ?? '进行中'
  normalized.is_historical = normalized.is_historical ?? false
  normalized.sort_order = normalized.sort_order ?? 0
  return normalized
}

/**
 * 归一化更新 payload
 */
function normalizeUpdatePayload(payload: UpdatePhasePayload): UpdatePhasePayload {
  return { ...payload }
}

/**
 * 合并 issues 为 DomainResult
 */
function buildDomainResult<T>(issues: InvariantIssue[], data?: T): DomainResult<T> {
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
 * DB 关系校验：item_id 存在性 + 事项是否已搁置
 */
async function validatePhaseRelations(
  itemId: string,
  context: { userId: string; supabase: SupabaseClient }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase } = context

  // 规则: item_id 对应事项是否存在且属于当前用户
  const { data: item, error } = await supabase
    .from('items')
    .select('id, user_id, status')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !item) {
    issues.push({
      code: 'PHASE_ITEM_NOT_FOUND',
      severity: 'blocking',
      message: '关联的事项不存在或不属于当前用户',
      entity: 'phase',
      field: 'item_id',
      entityId: itemId,
    })
  } else if (item.status === '已搁置') {
    issues.push({
      code: 'PHASE_ITEM_ARCHIVED',
      severity: 'warning',
      message: '关联的事项已搁置，新建阶段不会自动激活事项',
      entity: 'phase',
      field: 'item_id',
      entityId: itemId,
    })
  }

  return issues
}

/**
 * 安全创建阶段
 */
export async function createPhaseSafely(
  params: CreatePhaseSafelyParams
): Promise<DomainResult<Phase>> {
  const { userId, payload, supabase } = params

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validatePhaseInvariants(normalizedPayload, { isCreate: true })

  // 3. DB 关系校验
  const relationIssues = await validatePhaseRelations(normalizedPayload.item_id, { userId, supabase })

  const allIssues = [...invariantIssues, ...relationIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    genDecisionId('VALIDATION');
    return buildDomainResult<Phase>(allIssues)
  }

  // 5. 写入
  try {
    genToolCallId('PHASE_CREATE');
    const phase = await createPhase(userId, normalizedPayload)
    return buildDomainResult<Phase>(allIssues, phase)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'PHASE_CREATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '创建阶段失败',
      entity: 'phase',
    }
    return buildDomainResult<Phase>([...allIssues, dbError])
  }
}

/**
 * 安全更新阶段
 */
export async function updatePhaseSafely(
  params: UpdatePhaseSafelyParams
): Promise<DomainResult<Phase>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询已有记录
  const existingPhase = await getPhaseById(userId, id)
  if (!existingPhase) {
    return buildDomainResult<Phase>([{
      code: 'PHASE_NOT_FOUND',
      severity: 'blocking',
      message: '阶段不存在',
      entity: 'phase',
      entityId: id,
    }])
  }

  // 2. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 3. 合并 existingPhase + normalizedPatch
  const merged = {
    ...existingPhase,
    ...normalizedPatch,
    _existingStatus: existingPhase.status,
    _existingTitle: existingPhase.title,
    _existingStartDate: existingPhase.start_date,
    _existingEndDate: existingPhase.end_date,
  }

  // 4. 纯逻辑校验
  const invariantIssues = validatePhaseInvariants(merged, { isUpdate: true })

  const allIssues = [...invariantIssues]

  // 5. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<Phase>(allIssues)
  }

  // 6. 写入
  try {
    const phase = await updatePhase(userId, id, normalizedPatch)
    return buildDomainResult<Phase>(allIssues, phase)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'PHASE_UPDATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '更新阶段失败',
      entity: 'phase',
      entityId: id,
    }
    return buildDomainResult<Phase>([...allIssues, dbError])
  }
}

/**
 * 结束阶段（状态设为「已结束」，设置 end_date 为今天）
 */
export async function endPhaseSafely(
  params: EndPhaseSafelyParams
): Promise<DomainResult<Phase>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingPhase = await getPhaseById(userId, id)
  if (!existingPhase) {
    return buildDomainResult<Phase>([{
      code: 'PHASE_NOT_FOUND',
      severity: 'blocking',
      message: '阶段不存在',
      entity: 'phase',
      entityId: id,
    }])
  }

  // 2. 校验：未结束才能结束
  if (existingPhase.status === '已结束') {
    genDecisionId('STATE_TRANSITION')
    return buildDomainResult<Phase>([{
      code: 'PHASE_ALREADY_ENDED',
      severity: 'blocking',
      message: '阶段已经处于结束状态',
      entity: 'phase',
      entityId: id,
    }])
  }

  // 3. 执行结束（设置状态 + end_date）
  const today = new Date().toISOString().split('T')[0]
  try {
    const phase = await updatePhase(userId, id, {
      status: '已结束',
      end_date: existingPhase.end_date ?? today,
    })
    return buildDomainResult<Phase>([], phase)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'PHASE_END_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '结束阶段失败',
      entity: 'phase',
      entityId: id,
    }
    return buildDomainResult<Phase>([dbError])
  }
}

/**
 * 安全删除阶段
 */
export async function deletePhaseSafely(
  params: DeletePhaseSafelyParams
): Promise<DomainResult<null>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingPhase = await getPhaseById(userId, id)
  if (!existingPhase) {
    return buildDomainResult<null>([{
      code: 'PHASE_NOT_FOUND',
      severity: 'blocking',
      message: '阶段不存在',
      entity: 'phase',
      entityId: id,
    }])
  }

  // 2. 执行删除
  try {
    await deletePhase(userId, id)
    return buildDomainResult<null>([], null)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'PHASE_DELETE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '删除阶段失败',
      entity: 'phase',
      entityId: id,
    }
    return buildDomainResult<null>([dbError])
  }
}
