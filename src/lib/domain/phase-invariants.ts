/**
 * 阶段纯逻辑校验 — 6 条规则 + DB 关系校验
 *
 * 只做纯逻辑校验（枚举、字段组合、日期范围），不做数据库查询。
 * DB 关系校验（item_id 存在性、重叠阶段检查）在 phase-service 中单独处理。
 */

import type { InvariantIssue } from './domain-errors'
import { PHASE_STATUSES } from '@/types/teto'
import type { PhaseStatus } from '@/types/teto'

/** 终态：这些状态下阶段不可编辑 */
const TERMINAL_PHASE_STATUSES: PhaseStatus[] = ['已结束']

export function validatePhaseInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean; isCreate?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: 标题不能为空
  if (!input.title || (typeof input.title === 'string' && input.title.trim() === '')) {
    issues.push({
      code: 'PHASE_TITLE_REQUIRED',
      severity: 'blocking',
      message: '阶段标题不能为空',
      entity: 'phase',
      field: 'title',
    })
  }

  // 规则 2: item_id 必填（创建时）
  if (context?.isCreate && !input.item_id) {
    issues.push({
      code: 'PHASE_ITEM_REQUIRED',
      severity: 'blocking',
      message: '阶段必须关联事项',
      entity: 'phase',
      field: 'item_id',
    })
  }

  // 规则 3: status 必须在 PHASE_STATUSES 内
  if (input.status != null && !PHASE_STATUSES.includes(input.status)) {
    issues.push({
      code: 'PHASE_INVALID_STATUS',
      severity: 'blocking',
      message: `阶段状态无效: ${input.status}，合法值为: ${PHASE_STATUSES.join(', ')}`,
      entity: 'phase',
      field: 'status',
    })
  }

  // 规则 4: start_date ≤ end_date
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    issues.push({
      code: 'PHASE_DATE_RANGE_INVALID',
      severity: 'blocking',
      message: '阶段结束日期不能早于开始日期',
      entity: 'phase',
      field: 'end_date',
      details: { startDate: input.start_date, endDate: input.end_date },
    })
  }

  // 规则 5: 标题不超过 200 字符
  if (input.title && typeof input.title === 'string' && input.title.length > 200) {
    issues.push({
      code: 'PHASE_TITLE_TOO_LONG',
      severity: 'warning',
      message: '阶段标题不能超过 200 字符',
      entity: 'phase',
      field: 'title',
      details: { currentLength: input.title.length, maxLength: 200 },
    })
  }

  // 规则 6: 已结束阶段不可修改核心字段
  if (context?.isUpdate && input._existingStatus && TERMINAL_PHASE_STATUSES.includes(input._existingStatus)) {
    const changedFields = []
    if (input.title !== undefined && input.title !== input._existingTitle) changedFields.push('title')
    if (input.start_date !== undefined && input.start_date !== input._existingStartDate) changedFields.push('start_date')
    if (input.end_date !== undefined && input.end_date !== input._existingEndDate) changedFields.push('end_date')
    if (input.status !== undefined && input.status !== input._existingStatus) changedFields.push('status')

    if (changedFields.length > 0) {
      issues.push({
        code: 'PHASE_ENDED_IMMUTABLE',
        severity: 'blocking',
        message: `已结束的阶段不可修改: ${changedFields.join(', ')}`,
        entity: 'phase',
        field: changedFields[0],
        details: { existingStatus: input._existingStatus, changedFields },
      })
    }
  }

  return issues
}
