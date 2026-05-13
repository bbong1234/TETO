/**
 * 子项统一写入服务 — createSubItemSafely / updateSubItemSafely / deleteSubItemSafely / promoteSubItemSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validateSubItemInvariants } from './sub-item-invariants'
import { createSubItem, updateSubItem, deleteSubItem, promoteSubItemToItem, getSubItemById } from '@/lib/db/sub-items'
import type { CreateSubItemPayload, UpdateSubItemPayload, SubItem } from '@/types/teto'
import { genDecisionId, genToolCallId } from '@/lib/observability/id-registry'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreateSubItemSafelyParams {
  userId: string
  payload: CreateSubItemPayload
  supabase: SupabaseClient
}

interface UpdateSubItemSafelyParams {
  userId: string
  id: string
  payload: UpdateSubItemPayload
  supabase: SupabaseClient
}

interface DeleteSubItemSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

interface PromoteSubItemSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 */
function normalizeCreatePayload(payload: CreateSubItemPayload): CreateSubItemPayload {
  const normalized = { ...payload }
  normalized.sort_order = normalized.sort_order ?? 0
  return normalized
}

/**
 * 归一化更新 payload
 */
function normalizeUpdatePayload(payload: UpdateSubItemPayload): UpdateSubItemPayload {
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
 * DB 关系校验：item_id 存在性
 */
async function validateSubItemRelations(
  itemId: string,
  context: { userId: string; supabase: SupabaseClient }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase } = context

  const { data: item, error } = await supabase
    .from('items')
    .select('id, user_id')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !item) {
    issues.push({
      code: 'SUBITEM_ITEM_NOT_FOUND',
      severity: 'blocking',
      message: '关联的事项不存在或不属于当前用户',
      entity: 'sub_item',
      field: 'item_id',
      entityId: itemId,
    })
  }

  return issues
}

/**
 * 安全创建子项
 */
export async function createSubItemSafely(
  params: CreateSubItemSafelyParams
): Promise<DomainResult<SubItem>> {
  const { userId, payload, supabase } = params

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateSubItemInvariants(normalizedPayload, { isCreate: true })

  // 3. DB 关系校验
  const relationIssues = await validateSubItemRelations(normalizedPayload.item_id, { userId, supabase })

  const allIssues = [...invariantIssues, ...relationIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    genDecisionId('VALIDATION');
    return buildDomainResult<SubItem>(allIssues)
  }

  // 5. 写入
  try {
    genToolCallId('SUBITEM_CREATE');
    const subItem = await createSubItem(userId, normalizedPayload)
    return buildDomainResult<SubItem>(allIssues, subItem)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'SUBITEM_CREATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '创建子项失败',
      entity: 'sub_item',
    }
    return buildDomainResult<SubItem>([...allIssues, dbError])
  }
}

/**
 * 安全更新子项
 */
export async function updateSubItemSafely(
  params: UpdateSubItemSafelyParams
): Promise<DomainResult<SubItem>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询已有记录
  const existingSubItem = await getSubItemById(userId, id)
  if (!existingSubItem) {
    return buildDomainResult<SubItem>([{
      code: 'SUBITEM_NOT_FOUND',
      severity: 'blocking',
      message: '子项不存在',
      entity: 'sub_item',
      entityId: id,
    }])
  }

  // 2. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 3. 纯逻辑校验
  const merged = { ...existingSubItem, ...normalizedPatch, id }
  const invariantIssues = validateSubItemInvariants(merged, { isUpdate: true })

  const allIssues = [...invariantIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<SubItem>(allIssues)
  }

  // 5. 写入
  try {
    const subItem = await updateSubItem(userId, id, normalizedPatch)
    return buildDomainResult<SubItem>(allIssues, subItem)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'SUBITEM_UPDATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '更新子项失败',
      entity: 'sub_item',
      entityId: id,
    }
    return buildDomainResult<SubItem>([...allIssues, dbError])
  }
}

/**
 * 安全删除子项
 */
export async function deleteSubItemSafely(
  params: DeleteSubItemSafelyParams
): Promise<DomainResult<null>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingSubItem = await getSubItemById(userId, id)
  if (!existingSubItem) {
    return buildDomainResult<null>([{
      code: 'SUBITEM_NOT_FOUND',
      severity: 'blocking',
      message: '子项不存在',
      entity: 'sub_item',
      entityId: id,
    }])
  }

  // 2. 执行删除
  try {
    await deleteSubItem(userId, id)
    return buildDomainResult<null>([], null)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'SUBITEM_DELETE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '删除子项失败',
      entity: 'sub_item',
      entityId: id,
    }
    return buildDomainResult<null>([dbError])
  }
}

/**
 * 子项升格为独立事项
 */
export async function promoteSubItemSafely(
  params: PromoteSubItemSafelyParams
): Promise<DomainResult<{ newItemId: string; subItem: SubItem }>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingSubItem = await getSubItemById(userId, id)
  if (!existingSubItem) {
    return buildDomainResult<{ newItemId: string; subItem: SubItem }>([{
      code: 'SUBITEM_NOT_FOUND',
      severity: 'blocking',
      message: '子项不存在',
      entity: 'sub_item',
      entityId: id,
    }])
  }

  // 2. 执行升格
  genDecisionId('STATE_TRANSITION')
  try {
    const result = await promoteSubItemToItem(userId, id)
    return buildDomainResult<{ newItemId: string; subItem: SubItem }>([], result)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'SUBITEM_PROMOTE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '子项升格失败',
      entity: 'sub_item',
      entityId: id,
    }
    return buildDomainResult<{ newItemId: string; subItem: SubItem }>([dbError])
  }
}
