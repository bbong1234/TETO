/**
 * 生命周期规则校验 — 5 条规则
 *
 * 终态定义：'completed', 'postponed', 'cancelled' 为终态。
 * 从这些状态不能再执行任何生命周期操作。
 * 'active' 和 null 为可操作状态。
 */

import type { InvariantIssue } from './domain-errors'
import { RULES } from '@/lib/rules'

const TERMINAL_STATUSES = RULES.lifecycle.terminal_statuses

export function validateLifecycleTransition(
  original: { type: string; lifecycle_status?: string | null | undefined },
  action: 'complete' | 'postpone' | 'cancel'
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1-3: 操作类型限制（仅计划可完成/推迟/取消）
  if (action === 'complete' && original.type !== '计划') {
    issues.push({
      code: 'LIFECYCLE_COMPLETE_REQUIRES_PLAN',
      severity: 'blocking',
      message: '仅计划类型的记录可以执行"完成"操作',
      entity: 'record',
      field: 'type',
    })
  }

  if (action === 'postpone' && original.type !== '计划') {
    issues.push({
      code: 'LIFECYCLE_POSTPONE_REQUIRES_PLAN',
      severity: 'blocking',
      message: '仅计划类型的记录可以执行"推迟"操作',
      entity: 'record',
      field: 'type',
    })
  }

  if (action === 'cancel' && original.type !== '计划') {
    issues.push({
      code: 'LIFECYCLE_CANCEL_REQUIRES_PLAN',
      severity: 'blocking',
      message: '仅计划类型的记录可以执行"取消"操作',
      entity: 'record',
      field: 'type',
    })
  }

  // 规则 4: lifecycle_status 已为终态时阻止操作
  if (original.lifecycle_status && TERMINAL_STATUSES.includes(original.lifecycle_status as typeof TERMINAL_STATUSES[number])) {
    issues.push({
      code: 'LIFECYCLE_ALREADY_TERMINAL',
      severity: 'blocking',
      message: `该记录已处于 ${original.lifecycle_status} 状态，无法执行"${action === 'complete' ? '完成' : action === 'postpone' ? '推迟' : '取消'}"操作`,
      entity: 'record',
      field: 'lifecycle_status',
    })
  }

  // 规则 5: 推迟操作缺少 new_date
  if (action === 'postpone') {
    // new_date 校验在调用层执行（validateLifecycleTransition 是纯逻辑）
    // 这里只是声明约束，实际检查在 postponeRecordSafely 中
  }

  return issues
}
