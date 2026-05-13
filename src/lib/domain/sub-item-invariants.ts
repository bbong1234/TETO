/**
 * 子项纯逻辑校验 — 4 条规则
 *
 * 只做纯逻辑校验（标题、字段组合），不做数据库查询。
 */

import type { InvariantIssue } from './domain-errors'

export function validateSubItemInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean; isCreate?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: 标题不能为空
  if (!input.title || (typeof input.title === 'string' && input.title.trim() === '')) {
    issues.push({
      code: 'SUBITEM_TITLE_REQUIRED',
      severity: 'blocking',
      message: '子项标题不能为空',
      entity: 'sub_item',
      field: 'title',
    })
  }

  // 规则 2: item_id 必填（创建时）
  if (context?.isCreate && !input.item_id) {
    issues.push({
      code: 'SUBITEM_ITEM_REQUIRED',
      severity: 'blocking',
      message: '子项必须关联事项',
      entity: 'sub_item',
      field: 'item_id',
    })
  }

  // 规则 3: 标题不超过 200 字符
  if (input.title && typeof input.title === 'string' && input.title.length > 200) {
    issues.push({
      code: 'SUBITEM_TITLE_TOO_LONG',
      severity: 'warning',
      message: '子项标题不能超过 200 字符',
      entity: 'sub_item',
      field: 'title',
      details: { currentLength: input.title.length, maxLength: 200 },
    })
  }

  // 规则 4: 不能自引用（sub_item_id 不能等于自己的 id）
  if (context?.isUpdate && input.id && input.id === input.item_id) {
    issues.push({
      code: 'SUBITEM_SELF_REFERENCE',
      severity: 'blocking',
      message: '子项不能自引用',
      entity: 'sub_item',
      field: 'item_id',
    })
  }

  return issues
}
