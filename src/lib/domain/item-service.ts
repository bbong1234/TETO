/**
 * 事项统一写入服务 — createItemSafely / updateItemSafely / archiveItemSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 * - createItemSafely：归一化 → 纯逻辑校验 → 关系校验 → 写入
 * - updateItemSafely：取已有 → 归一化 → 合并 → 校验 → 写入
 * - archiveItemSafely：取已有 → 校验终态 → 关系校验 → 软删除(→已搁置)
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validateItemInvariants } from './item-invariants'
import { validateItemRelations } from './relation-invariants-item'
import { createItem, updateItem, deleteItem, getItemById } from '@/lib/db/items'
import type { CreateItemPayload, UpdateItemPayload, Item } from '@/types/teto'
import { genDecisionId, genToolCallId, genBehaviorId } from '@/lib/observability/id-registry'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreateItemSafelyParams {
  userId: string
  payload: CreateItemPayload
  supabase: SupabaseClient
}

interface UpdateItemSafelyParams {
  userId: string
  id: string
  payload: UpdateItemPayload
  supabase: SupabaseClient
}

interface ArchiveItemSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 */
function normalizeCreatePayload(payload: CreateItemPayload): CreateItemPayload {
  const normalized = { ...payload }
  normalized.status = normalized.status ?? '活跃'
  normalized.is_pinned = normalized.is_pinned ?? false
  return normalized
}

/**
 * 归一化更新 payload
 */
function normalizeUpdatePayload(payload: UpdateItemPayload): UpdateItemPayload {
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
 * 安全创建事项
 */
export async function createItemSafely(
  params: CreateItemSafelyParams
): Promise<DomainResult<Item>> {
  genBehaviorId('B-020'); // createItemSafely 入口追踪
  const { userId, payload, supabase } = params

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateItemInvariants(normalizedPayload, { isCreate: true })

  // 3. DB 关系校验
  const relationIssues = await validateItemRelations(
    { folder_id: normalizedPayload.folder_id },
    { userId, supabase }
  )

  const allIssues = [...invariantIssues, ...relationIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    genDecisionId('VALIDATION');
    return buildDomainResult<Item>(allIssues)
  }

  // 5. 写入
  try {
    genToolCallId('ITEM_CREATE');
    const item = await createItem(userId, normalizedPayload)
    return buildDomainResult<Item>(allIssues, item)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'ITEM_CREATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '创建事项失败',
      entity: 'item',
    }
    return buildDomainResult<Item>([...allIssues, dbError])
  }
}

/**
 * 安全更新事项
 */
export async function updateItemSafely(
  params: UpdateItemSafelyParams
): Promise<DomainResult<Item>> {
  const { userId, id, payload, supabase } = params

  // 1. 查询已有记录
  const existingItem = await getItemById(userId, id)
  if (!existingItem) {
    return buildDomainResult<Item>([{
      code: 'ITEM_NOT_FOUND',
      severity: 'blocking',
      message: '事项不存在',
      entity: 'item',
      entityId: id,
    }])
  }

  // 2. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 3. 合并 existingItem + normalizedPatch
  const merged = {
    ...existingItem,
    ...normalizedPatch,
    // 传递已有状态用于不变式校验
    _existingStatus: existingItem.status,
    _existingTitle: existingItem.title,
  }

  // 4. 纯逻辑校验（对合并后数据）
  const invariantIssues = validateItemInvariants(merged, { isUpdate: true })

  // 5. DB 关系校验
  const relationIssues = await validateItemRelations(
    { folder_id: merged.folder_id },
    { userId, supabase }
  )

  const allIssues = [...invariantIssues, ...relationIssues]

  // 6. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<Item>(allIssues)
  }

  // 7. 写入（只传 normalizedPatch）
  try {
    const item = await updateItem(userId, id, normalizedPatch)
    return buildDomainResult<Item>(allIssues, item)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'ITEM_UPDATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '更新事项失败',
      entity: 'item',
      entityId: id,
    }
    return buildDomainResult<Item>([...allIssues, dbError])
  }
}

/**
 * 安全搁置事项（原 deleteItem — 软删除为"已搁置"状态）
 */
export async function archiveItemSafely(
  params: ArchiveItemSafelyParams
): Promise<DomainResult<Item>> {
  const { userId, id, supabase } = params

  // 1. 查询已有记录
  const existingItem = await getItemById(userId, id)
  if (!existingItem) {
    return buildDomainResult<Item>([{
      code: 'ITEM_NOT_FOUND',
      severity: 'blocking',
      message: '事项不存在',
      entity: 'item',
      entityId: id,
    }])
  }

  // 2. 检查是否已是终态
  if (existingItem.status === '已搁置') {
    return buildDomainResult<Item>([{
      code: 'ITEM_ALREADY_ARCHIVED',
      severity: 'blocking',
      message: '事项已处于搁置状态',
      entity: 'item',
      entityId: id,
    }])
  }

  // 3. 关系校验（检查是否有进行中的 phases/goals）
  const relationIssues = await validateItemRelations(
    { _existingStatus: existingItem.status, _itemId: id },
    { userId, supabase, isArchiving: true }
  )

  const allIssues = [...relationIssues]
  // archiveItem 关系校验中的 warning 不阻止写入

  // 4. 执行软删除（→ 已搁置）
  try {
    await deleteItem(userId, id)
    // 重新获取搁置后的状态
    const archived = await getItemById(userId, id)
    return buildDomainResult<Item>(allIssues, archived ?? existingItem)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'ITEM_ARCHIVE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '搁置事项失败',
      entity: 'item',
      entityId: id,
    }
    return buildDomainResult<Item>([...allIssues, dbError])
  }
}
