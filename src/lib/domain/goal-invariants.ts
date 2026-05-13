/**
 * 目标纯逻辑校验 — 10 条规则
 *
 * 只做纯逻辑校验（枚举、字段组合、状态转换），不做数据库查询。
 * input 应当是合并后的完整数据。
 */

import type { InvariantIssue } from './domain-errors'
import { GOAL_STATUSES, GOAL_RULE_TYPES, GOAL_OPERATORS, GOAL_PERIODS, GOAL_SOURCES, GOAL_PROGRESS_SOURCES } from '@/types/teto'
import type { GoalStatus, GoalRuleType, GoalOperator, GoalPeriod, GoalSource, GoalProgressSource } from '@/types/teto'

/** 终态：这些状态下目标不可编辑核心字段 */
const TERMINAL_GOAL_STATUSES: GoalStatus[] = ['已完成']

/** 只允许状态回退的目标状态 */
const ALLOWED_ROLLBACK_STATUSES: GoalStatus[] = ['放弃', '暂停']

export function validateGoalInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean; isCreate?: boolean; isConfirm?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: 标题不能为空
  if (!input.title || (typeof input.title === 'string' && input.title.trim() === '')) {
    issues.push({
      code: 'GOAL_TITLE_REQUIRED',
      severity: 'blocking',
      message: '目标标题不能为空',
      entity: 'goal',
      field: 'title',
    })
  }

  // 规则 2: status 必须在 GOAL_STATUSES 内
  if (input.status != null && !GOAL_STATUSES.includes(input.status)) {
    issues.push({
      code: 'GOAL_INVALID_STATUS',
      severity: 'blocking',
      message: `目标状态无效: ${input.status}，合法值为: ${GOAL_STATUSES.join(', ')}`,
      entity: 'goal',
      field: 'status',
    })
  }

  // 规则 3: rule_type 必须在 GOAL_RULE_TYPES 内
  if (input.rule_type != null && !GOAL_RULE_TYPES.includes(input.rule_type)) {
    issues.push({
      code: 'GOAL_INVALID_RULE_TYPE',
      severity: 'blocking',
      message: `目标规则类型无效: ${input.rule_type}，合法值为: ${GOAL_RULE_TYPES.join(', ')}`,
      entity: 'goal',
      field: 'rule_type',
    })
  }

  // 规则 4: operator 必须在 GOAL_OPERATORS 内
  if (input.operator != null && !GOAL_OPERATORS.includes(input.operator)) {
    issues.push({
      code: 'GOAL_INVALID_OPERATOR',
      severity: 'blocking',
      message: `目标操作符无效: ${input.operator}，合法值为: ${GOAL_OPERATORS.join(', ')}`,
      entity: 'goal',
      field: 'operator',
    })
  }

  // 规则 5: period 必须在 GOAL_PERIODS 内
  if (input.period != null && !GOAL_PERIODS.includes(input.period)) {
    issues.push({
      code: 'GOAL_INVALID_PERIOD',
      severity: 'blocking',
      message: `目标周期无效: ${input.period}，合法值为: ${GOAL_PERIODS.join(', ')}`,
      entity: 'goal',
      field: 'period',
    })
  }

  // 规则 6: source 必须在 GOAL_SOURCES 内
  if (input.source != null && !GOAL_SOURCES.includes(input.source)) {
    issues.push({
      code: 'GOAL_SOURCE_INVALID',
      severity: 'warning',
      message: `目标来源无效: ${input.source}，合法值为: ${GOAL_SOURCES.join(', ')}`,
      entity: 'goal',
      field: 'source',
    })
  }

  // 规则 7: 已完成目标锁定 — 不允许修改核心字段
  if (context?.isUpdate && input._existingStatus && TERMINAL_GOAL_STATUSES.includes(input._existingStatus)) {
    // 已完成状态下，仅允许将状态回退到「放弃」或「暂停」
    const isOnlyStatusRollback =
      Object.keys(input).every(k =>
        k === 'status' || k === '_existingStatus' || k.startsWith('_')
      ) &&
      input.status != null &&
      ALLOWED_ROLLBACK_STATUSES.includes(input.status)

    if (!isOnlyStatusRollback) {
      issues.push({
        code: 'GOAL_COMPLETED_LOCKED',
        severity: 'blocking',
        message: '已完成的目标不可修改核心数据，仅可将状态回退为「放弃」或「暂停」',
        entity: 'goal',
        details: { existingStatus: input._existingStatus },
      })
    }
  }

  // 规则 8: target_value 或 target_min 至少有一个（创建时）
  if (context?.isCreate) {
    const hasTarget = input.target_value != null || input.target_min != null
    if (!hasTarget && input.rule_type !== '周期性限制') {
      // 周期性限制型允许只有 target_max
      const hasMax = input.target_max != null
      if (!hasMax) {
        issues.push({
          code: 'GOAL_TARGET_REQUIRED',
          severity: 'blocking',
          message: '目标必须设置目标值（target_value 或 target_min）',
          entity: 'goal',
          field: 'target_value',
        })
      }
    }
  }

  // 规则 9: confirmation_required 的目标必须为草稿状态
  if (input.confirmation_required === true && input.status && input.status !== '草稿') {
    issues.push({
      code: 'GOAL_CONFIRM_ONLY_DRAFT',
      severity: 'blocking',
      message: '需要确认的目标必须为草稿状态',
      entity: 'goal',
      field: 'status',
      details: { currentStatus: input.status },
    })
  }

  // 规则 10: progress_source 必须在 GOAL_PROGRESS_SOURCES 内
  if (input.progress_source != null && !GOAL_PROGRESS_SOURCES.includes(input.progress_source)) {
    issues.push({
      code: 'GOAL_INVALID_PROGRESS_SOURCE',
      severity: 'warning',
      message: `进度来源无效: ${input.progress_source}，合法值为: ${GOAL_PROGRESS_SOURCES.join(', ')}`,
      entity: 'goal',
      field: 'progress_source',
    })
  }

  // 规则 11: deadline 不能在过去（仅创建时警告）
  if (context?.isCreate && input.deadline) {
    const deadline = new Date(input.deadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (deadline < today) {
      issues.push({
        code: 'GOAL_DEADLINE_PAST',
        severity: 'warning',
        message: '截止日期已过，目标将立即显示为超期',
        entity: 'goal',
        field: 'deadline',
        details: { deadline: input.deadline },
      })
    }
  }

  return issues
}
