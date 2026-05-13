/**
 * 标签统一写入服务 — createTagSafely / updateTagSafely / deleteTagSafely
 *
 * 核心流程：归一化 → 校验 → 写入
 * 额外检查：同类型下名称唯一性（DB 关系校验）
 */

import type { DomainResult, InvariantIssue } from './domain-errors'
import { validateTagInvariants } from './tag-invariants'
import { createTag, updateTag, deleteTag, listTags } from '@/lib/db/tags'
import type { CreateTagPayload, UpdateTagPayload, Tag } from '@/types/teto'
import { genDecisionId, genToolCallId } from '@/lib/observability/id-registry'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

interface CreateTagSafelyParams {
  userId: string
  payload: CreateTagPayload
  supabase: SupabaseClient
}

interface UpdateTagSafelyParams {
  userId: string
  id: string
  payload: UpdateTagPayload
  supabase: SupabaseClient
}

interface DeleteTagSafelyParams {
  userId: string
  id: string
  supabase: SupabaseClient
}

/**
 * 归一化创建 payload
 */
function normalizeCreatePayload(payload: CreateTagPayload): CreateTagPayload {
  return { ...payload }
}

/**
 * 归一化更新 payload
 */
function normalizeUpdatePayload(payload: UpdateTagPayload): UpdateTagPayload {
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
 * DB 关系校验：同用户+同类型下名称唯一性
 */
async function validateTagRelations(
  name: string,
  type: string | null | undefined,
  context: { userId: string; supabase: SupabaseClient; excludeId?: string }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase, excludeId } = context

  // 查询用户所有标签，检查同名+同类型
  const { data: tags, error } = await supabase
    .from('tags')
    .select('id, name, type')
    .eq('user_id', userId)

  if (error) {
    issues.push({
      code: 'TAG_DUPLICATE_CHECK_FAILED',
      severity: 'warning',
      message: '无法验证标签唯一性，已跳过检查',
      entity: 'tag',
    })
    return issues
  }

  const duplicates = (tags ?? []).filter(
    (t: { id: string; name: string; type: string | null }) =>
      t.name === name &&
      (t.type ?? null) === (type ?? null) &&
      t.id !== excludeId
  )

  if (duplicates.length > 0) {
    issues.push({
      code: 'TAG_DUPLICATE_NAME',
      severity: 'blocking',
      message: `已存在同名同类型的标签"${name}"`,
      entity: 'tag',
      field: 'name',
      details: { duplicateId: duplicates[0].id },
    })
  }

  return issues
}

/**
 * 安全创建标签
 */
export async function createTagSafely(
  params: CreateTagSafelyParams
): Promise<DomainResult<Tag>> {
  const { userId, payload, supabase } = params

  // 1. 归一化
  const normalizedPayload = normalizeCreatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateTagInvariants(normalizedPayload, { isCreate: true })

  // 3. DB 关系校验（名称唯一性）
  const relationIssues = await validateTagRelations(
    normalizedPayload.name,
    normalizedPayload.type,
    { userId, supabase }
  )

  const allIssues = [...invariantIssues, ...relationIssues]

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    genDecisionId('VALIDATION');
    return buildDomainResult<Tag>(allIssues)
  }

  // 5. 写入
  try {
    genToolCallId('TAG_CREATE');
    const tag = await createTag(userId, normalizedPayload)
    return buildDomainResult<Tag>(allIssues, tag)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'TAG_CREATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '创建标签失败',
      entity: 'tag',
    }
    return buildDomainResult<Tag>([...allIssues, dbError])
  }
}

/**
 * 安全更新标签
 */
export async function updateTagSafely(
  params: UpdateTagSafelyParams
): Promise<DomainResult<Tag>> {
  const { userId, id, payload, supabase } = params

  // 1. 归一化
  const normalizedPatch = normalizeUpdatePayload(payload)

  // 2. 纯逻辑校验
  const invariantIssues = validateTagInvariants(normalizedPatch, { isUpdate: true })

  // 3. 如果修改了名称或类型，检查唯一性
  const allIssues = [...invariantIssues]
  if (normalizedPatch.name != null) {
    const relationIssues = await validateTagRelations(
      normalizedPatch.name,
      normalizedPatch.type,
      { userId, supabase, excludeId: id }
    )
    allIssues.push(...relationIssues)
  }

  // 4. 有 blocking → 不写入
  if (allIssues.some(i => i.severity === 'blocking')) {
    return buildDomainResult<Tag>(allIssues)
  }

  // 5. 写入
  try {
    const tag = await updateTag(userId, id, normalizedPatch)
    return buildDomainResult<Tag>(allIssues, tag)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'TAG_UPDATE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '更新标签失败',
      entity: 'tag',
      entityId: id,
    }
    return buildDomainResult<Tag>([...allIssues, dbError])
  }
}

/**
 * 安全删除标签
 */
export async function deleteTagSafely(
  params: DeleteTagSafelyParams
): Promise<DomainResult<null>> {
  const { userId, id, supabase } = params

  // 执行删除
  try {
    await deleteTag(userId, id)
    return buildDomainResult<null>([], null)
  } catch (error) {
    const dbError: InvariantIssue = {
      code: 'TAG_DELETE_FAILED',
      severity: 'blocking',
      message: error instanceof Error ? error.message : '删除标签失败',
      entity: 'tag',
      entityId: id,
    }
    return buildDomainResult<null>([dbError])
  }
}
