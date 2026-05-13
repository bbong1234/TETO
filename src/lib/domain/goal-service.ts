/**
 * 目标统一写入服务 — createGoalSafely / updateGoalSafely / confirmGoalSafely / deleteGoalSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 * - createGoalSafely：归一化 → 纯逻辑校验 → 关系校验 → 写入
 * - updateGoalSafely：取已有 → 归一化 → 合并 → 校验 → 写入
 * - confirmGoalSafely：取已有 → 校验草稿状态 → 写入
 * - deleteGoalSafely：取已有 → 校验可删除 → 删除
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validateGoalInvariants } from './goal-invariants'
import { validateGoalRelations } from './relation-invariants-goal'
import { createGoal, updateGoal, deleteGoal, confirmGoal, getGoalById } from '@/lib/db/goals'
import type { CreateGoalPayload, UpdateGoalPayload, Goal } from '@/types/teto'
import { genDecisionId, genToolCallId, genBehaviorId } from '@/lib/observability/id-registry'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreateGoalSafelyParams {
  userId: string
  payload: CreateGoalPayload
  supabase: SupabaseClient
}

interface UpdateGoalSafelyParams {
  userId: string
  id: string
  payload: UpdateGoalPayload
  supabase: SupabaseClient
}

interface ConfirmGoalSafelyParams {
  userId: string
  id: string
  payload?: UpdateGoalPayload
  supabase: SupabaseClient
}

interface DeleteGoalSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 */
function normalizeCreatePayload(payload: CreateGoalPayload): CreateGoalPayload {
  const normalized = { ...payload }
  normalized.status = normalized.status ?? (normalized.confirmation_required ? '草稿' : '进行中')
  normalized.rule_type = normalized.rule_type ?? '一次性完成'
  normalized.operator = normalized.operator ?? '>='
  normalized.source = normalized.source ?? '手动创建'
  normalized.progress_source = normalized.progress_source ?? '记录统计'
  normalized.goal_text = normalized.goal_text ?? normalized.title
  return normalized
}

/**
 * 归一化更新 payload
 */
function normalizeUpdatePayload(payload: UpdateGoalPayload): UpdateGoalPayload {
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
 * 安全创建目标
 */
export async function createGoalSafely(
  params: CreateGoalSafelyParams
): Promise<DomainResult<Goal>> {
  genBehaviorId('B-022'); // createGoalSafely 入口追踪
  const { userId, payload, supabase } = params

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateGoalInvariants(normalizedPayload, { isCreate: true })

  // 3. DB 关系校验
  const relationIssues = await validateGoalRelations(
    {
      item_id: normalizedPayload.item_id,
      phase_id: normalizedPayload.phase_id,
      sub_item_id: normalizedPayload.sub_item_id,
    },
    { userId, supabase }
  )

  const allIssues = [...invariantIssues, ...relationIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    genDecisionId('VALIDATION');
    return buildDomainResult<Goal>(allIssues)
  }

  // 5. 写入
  try {
    genToolCallId('GOAL_CREATE');
    const goal = await createGoal(userId, normalizedPayload)
    return buildDomainResult<Goal>(allIssues, goal)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '创建目标失败'
    // GOAL_COMPLETED_LOCKED 错误由 DB 层抛出，不在创建场景发生
    const dbError: InvariantIssue = {
      code: 'GOAL_CREATE_FAILED',
      severity: 'blocking',
      message: errMsg,
      entity: 'goal',
    }
    return buildDomainResult<Goal>([...allIssues, dbError])
  }
}

/**
 * 安全更新目标
 */
export async function updateGoalSafely(
  params: UpdateGoalSafelyParams
): Promise<DomainResult<Goal>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询已有记录
  const existingGoal = await getGoalById(userId, id)
  if (!existingGoal) {
    return buildDomainResult<Goal>([{
      code: 'GOAL_NOT_FOUND',
      severity: 'blocking',
      message: '目标不存在',
      entity: 'goal',
      entityId: id,
    }])
  }

  // 2. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 3. 合并 existingGoal + normalizedPatch
  const merged = {
    ...existingGoal,
    ...normalizedPatch,
    _existingStatus: existingGoal.status,
  }

  // 4. 纯逻辑校验（对合并后数据）
  const invariantIssues = validateGoalInvariants(merged, { isUpdate: true })

  // 5. DB 关系校验
  const effectiveItemId = normalizedPatch.item_id !== undefined ? normalizedPatch.item_id : existingGoal.item_id
  const effectivePhaseId = normalizedPatch.phase_id !== undefined ? normalizedPatch.phase_id : existingGoal.phase_id
  const effectiveSubItemId = normalizedPatch.sub_item_id !== undefined ? normalizedPatch.sub_item_id : existingGoal.sub_item_id

  const relationIssues = await validateGoalRelations(
    {
      item_id: effectiveItemId,
      phase_id: effectivePhaseId,
      sub_item_id: effectiveSubItemId,
    },
    { userId, supabase }
  )

  const allIssues = [...invariantIssues, ...relationIssues]

  // 6. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<Goal>(allIssues)
  }

  // 7. 写入
  try {
    const goal = await updateGoal(userId, id, normalizedPatch)
    return buildDomainResult<Goal>(allIssues, goal)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '更新目标失败'
    // 如果 DB 层抛 GOAL_COMPLETED_LOCKED，包装为 domain error
    const isCompletedLocked = errMsg.includes('GOAL_COMPLETED_LOCKED')
    const dbError: InvariantIssue = {
      code: isCompletedLocked ? 'GOAL_COMPLETED_LOCKED' : 'GOAL_UPDATE_FAILED',
      severity: 'blocking',
      message: errMsg,
      entity: 'goal',
      entityId: id,
    }
    return buildDomainResult<Goal>([...allIssues, dbError])
  }
}

/**
 * 安全确认目标（草稿 → 进行中）
 */
export async function confirmGoalSafely(
  params: ConfirmGoalSafelyParams
): Promise<DomainResult<Goal>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询已有记录
  const existingGoal = await getGoalById(userId, id)
  if (!existingGoal) {
    return buildDomainResult<Goal>([{
      code: 'GOAL_NOT_FOUND',
      severity: 'blocking',
      message: '目标不存在',
      entity: 'goal',
      entityId: id,
    }])
  }

  // 2. 校验：必须是草稿状态
  if (existingGoal.status !== '草稿') {
    genDecisionId('ELIGIBILITY');
    genDecisionId('STATE_TRANSITION')
    return buildDomainResult<Goal>([{
      code: 'GOAL_CONFIRM_ONLY_DRAFT',
      severity: 'blocking',
      message: `只有草稿状态的目标才能确认，当前状态: ${existingGoal.status}`,
      entity: 'goal',
      entityId: id,
      details: { currentStatus: existingGoal.status },
    }])
  }

  // 3. 如果带 payload，做纯逻辑校验
  const allIssues: InvariantIssue[] = []
  if (payload) {
    const merged = { ...existingGoal, ...payload, status: '进行中', _existingStatus: existingGoal.status }
    const invariantIssues = validateGoalInvariants(merged, { isUpdate: true, isConfirm: true })
    allIssues.push(...invariantIssues)

    if (allIssues.some(i => i.severity === 'blocking')) {
      return buildDomainResult<Goal>(allIssues)
    }
  }

  // 4. 执行确认
  try {
    const goal = await confirmGoal(userId, id, payload)
    return buildDomainResult<Goal>(allIssues, goal)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'GOAL_CONFIRM_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '确认目标失败',
      entity: 'goal',
      entityId: id,
    }
    return buildDomainResult<Goal>([...allIssues, dbError])
  }
}

/**
 * 安全删除目标
 */
export async function deleteGoalSafely(
  params: DeleteGoalSafelyParams
): Promise<DomainResult<null>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingGoal = await getGoalById(userId, id)
  if (!existingGoal) {
    return buildDomainResult<null>([{
      code: 'GOAL_NOT_FOUND',
      severity: 'blocking',
      message: '目标不存在',
      entity: 'goal',
      entityId: id,
    }])
  }

  // 2. 已完成目标不可直接删除（需先回退状态）
  if (existingGoal.status === '已完成') {
    genDecisionId('STATE_TRANSITION')
    return buildDomainResult<null>([{
      code: 'GOAL_COMPLETED_LOCKED',
      severity: 'blocking',
      message: '已完成的目标不可直接删除，请先将状态回退为「放弃」或「暂停」',
      entity: 'goal',
      entityId: id,
      details: { currentStatus: existingGoal.status },
    }])
  }

  // 3. 执行删除
  try {
    await deleteGoal(userId, id)
    return buildDomainResult<null>([], null)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'GOAL_DELETE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '删除目标失败',
      entity: 'goal',
      entityId: id,
    }
    return buildDomainResult<null>([dbError])
  }
}
