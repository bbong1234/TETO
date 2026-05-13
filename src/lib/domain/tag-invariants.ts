/**
 * 标签纯逻辑校验 — 3 条规则
 *
 * 只做纯逻辑校验（名称、类型枚举），不做数据库查询。
 */

import type { InvariantIssue } from './domain-errors'

/** 合法的标签类型 */
const VALID_TAG_TYPES = [null, 'content', 'emotion', 'location', 'person', 'custom'] as const

export function validateTagInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean; isCreate?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: 名称不能为空
  if (!input.name || (typeof input.name === 'string' && input.name.trim() === '')) {
    issues.push({
      code: 'TAG_NAME_REQUIRED',
      severity: 'blocking',
      message: '标签名称不能为空',
      entity: 'tag',
      field: 'name',
    })
  }

  // 规则 2: 名称长度限制（100 字符）
  if (input.name && typeof input.name === 'string' && input.name.length > 100) {
    issues.push({
      code: 'TAG_NAME_TOO_LONG',
      severity: 'warning',
      message: '标签名称不能超过 100 字符',
      entity: 'tag',
      field: 'name',
      details: { currentLength: input.name.length, maxLength: 100 },
    })
  }

  // 规则 3: type 必须合法
  if (input.type != null && !VALID_TAG_TYPES.includes(input.type)) {
    issues.push({
      code: 'TAG_TYPE_INVALID',
      severity: 'warning',
      message: `标签类型无效: ${input.type}`,
      entity: 'tag',
      field: 'type',
    })
  }

  return issues
}
