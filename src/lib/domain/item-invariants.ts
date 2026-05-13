/**
 * 事项纯逻辑校验 — 8 条规则
 *
 * 只做纯逻辑校验（枚举、字段组合），不做数据库查询。
 * input 应当是合并后的完整数据。
 */

import type { InvariantIssue } from './domain-errors'
import { ITEM_STATUSES } from '@/types/teto'
import type { ItemStatus } from '@/types/teto'

/** 终态：这些状态下事项不可编辑 */
const TERMINAL_ITEM_STATUSES: ItemStatus[] = ['已完成', '已搁置']

/** 合法的 color hex 格式 */
const COLOR_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function validateItemInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean; isCreate?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: 标题不能为空
  if (!input.title || (typeof input.title === 'string' && input.title.trim() === '')) {
    issues.push({
      code: 'ITEM_TITLE_REQUIRED',
      severity: 'blocking',
      message: '事项标题不能为空',
      entity: 'item',
      field: 'title',
    })
  }

  // 规则 2: 标题不超过 200 字符
  if (input.title && typeof input.title === 'string' && input.title.length > 200) {
    issues.push({
      code: 'ITEM_TITLE_TOO_LONG',
      severity: 'blocking',
      message: '事项标题不能超过 200 字符',
      entity: 'item',
      field: 'title',
      details: { currentLength: input.title.length, maxLength: 200 },
    })
  }

  // 规则 3: status 必须在 ITEM_STATUSES 内
  if (input.status != null && !ITEM_STATUSES.includes(input.status)) {
    issues.push({
      code: 'ITEM_INVALID_STATUS',
      severity: 'blocking',
      message: `事项状态无效: ${input.status}，合法值为: ${ITEM_STATUSES.join(', ')}`,
      entity: 'item',
      field: 'status',
    })
  }

  // 规则 4: 已搁置/已完成事项不可修改 title/status（仅允许回退到活跃）
  if (context?.isUpdate && input._existingStatus && TERMINAL_ITEM_STATUSES.includes(input._existingStatus)) {
    const changedFields = []
    if (input.title !== undefined && input.title !== input._existingTitle) changedFields.push('title')
    if (input.status !== undefined && input.status !== input._existingStatus) changedFields.push('status')

    if (changedFields.length > 0) {
      issues.push({
        code: 'ITEM_ARCHIVED_IMMUTABLE',
        severity: 'blocking',
        message: `已搁置/已完成的事项不可修改: ${changedFields.join(', ')}`,
        entity: 'item',
        field: changedFields[0],
        details: { existingStatus: input._existingStatus, changedFields },
      })
    }
  }

  // 规则 5: ended_at 不能早于 started_at
  if (input.started_at && input.ended_at && input.ended_at < input.started_at) {
    issues.push({
      code: 'ITEM_ENDED_BEFORE_STARTED',
      severity: 'warning',
      message: '结束日期不能早于开始日期',
      entity: 'item',
      field: 'ended_at',
      details: { startedAt: input.started_at, endedAt: input.ended_at },
    })
  }

  // 规则 6: description 不超过 2000 字符
  if (input.description && typeof input.description === 'string' && input.description.length > 2000) {
    issues.push({
      code: 'ITEM_DESCRIPTION_TOO_LONG',
      severity: 'warning',
      message: '事项描述不能超过 2000 字符',
      entity: 'item',
      field: 'description',
      details: { currentLength: input.description.length, maxLength: 2000 },
    })
  }

  // 规则 7: color 必须是合法 hex 值
  if (input.color != null) {
    if (typeof input.color !== 'string' || !COLOR_HEX_RE.test(input.color)) {
      issues.push({
        code: 'ITEM_COLOR_INVALID',
        severity: 'warning',
        message: '颜色值无效，应为 hex 格式（如 #ff5733）',
        entity: 'item',
        field: 'color',
      })
    }
  }

  return issues
}
