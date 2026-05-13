/**
 * 记录纯逻辑校验 — 12 条规则
 *
 * 只做纯逻辑校验（枚举、字段组合），不做数据库查询。
 * input 应当是合并后的完整数据。
 *
 * 规则 8-11：写入路径先 normalizeRecordType()，diagnostics 不 normalize
 */

import type { InvariantIssue } from './domain-errors'
import { RECORD_TYPES, LIFECYCLE_STATUSES } from '@/types/teto'
import { RULES } from '@/lib/rules'

const VALID_DATA_NATURES = RULES.lifecycle.valid_data_natures
const VALID_PERIOD_FREQUENCIES = RULES.lifecycle.valid_period_frequencies

export function validateRecordInvariants(
  input: Record<string, any>,
  context?: { isUpdate?: boolean }
): InvariantIssue[] {
  const issues: InvariantIssue[] = []

  // 规则 1: sub_item_id 存在时必须有 item_id
  if (input.sub_item_id && !input.item_id) {
    issues.push({
      code: 'RECORD_SUB_ITEM_REQUIRES_ITEM',
      severity: 'blocking',
      message: '子项存在时必须指定所属事项',
      entity: 'record',
      field: 'item_id',
    })
  }

  // 规则 2: phase_id 存在时必须有 item_id
  if (input.phase_id && !input.item_id) {
    issues.push({
      code: 'RECORD_PHASE_REQUIRES_ITEM',
      severity: 'blocking',
      message: '阶段存在时必须指定所属事项',
      entity: 'record',
      field: 'item_id',
    })
  }

  // 规则 3: data_nature='inferred' 时无 period_source_id（P3 后升级为 blocking）
  if (input.data_nature === 'inferred' && !input.period_source_id) {
    issues.push({
      code: 'RECORD_INFERRED_NO_SOURCE',
      severity: 'blocking',
      message: '推断记录缺少来源规律记录',
      entity: 'record',
      field: 'period_source_id',
    })
  }

  // 规则 4: period_source_id 存在时标记 stats_exclusion
  if (input.period_source_id) {
    issues.push({
      code: 'RECORD_DERIVED_FROM_PERIOD',
      severity: 'stats_exclusion',
      message: '此记录由规律记录派生，不参与统计',
      entity: 'record',
      field: 'period_source_id',
    })
  }

  // 规则 5: is_period_rule=true 时缺少解释字段
  if (input.is_period_rule === true) {
    const hasExplanation =
      input.period_frequency != null ||
      input.period_start_date != null ||
      input.period_end_date != null ||
      (input.content != null && String(input.content).trim() !== '')

    if (!hasExplanation) {
      issues.push({
        code: 'RECORD_PERIOD_RULE_INCOMPLETE',
        severity: 'warning',
        message: '规律记录缺少解释字段（period_frequency/period_start_date/period_end_date/content）',
        entity: 'record',
        field: 'is_period_rule',
      })
    }
  }

  // 规则 6: lifecycle_status='cancelled' 标记 stats_exclusion
  if (input.lifecycle_status === 'cancelled') {
    issues.push({
      code: 'RECORD_CANCELLED',
      severity: 'stats_exclusion',
      message: '此记录已取消，不参与统计',
      entity: 'record',
      field: 'lifecycle_status',
    })
  }

  // 规则 7: review_status='unchecked' 标记 stats_exclusion
  if (input.review_status === 'unchecked') {
    issues.push({
      code: 'RECORD_UNCHECKED',
      severity: 'stats_exclusion',
      message: '此记录未经确认，不参与统计',
      entity: 'record',
      field: 'review_status',
    })
  }

  // 规则 8: type 不在 RECORD_TYPES 内
  if (input.type != null && !RECORD_TYPES.includes(input.type)) {
    issues.push({
      code: 'RECORD_INVALID_TYPE',
      severity: 'blocking',
      message: `记录类型无效: ${input.type}，合法值为: ${RECORD_TYPES.join(', ')}`,
      entity: 'record',
      field: 'type',
    })
  }

  // 规则 9: lifecycle_status 不在 LIFECYCLE_STATUSES 内
  if (input.lifecycle_status != null && !LIFECYCLE_STATUSES.includes(input.lifecycle_status)) {
    issues.push({
      code: 'RECORD_INVALID_LIFECYCLE',
      severity: 'blocking',
      message: `生命周期状态无效: ${input.lifecycle_status}，合法值为: ${LIFECYCLE_STATUSES.join(', ')}`,
      entity: 'record',
      field: 'lifecycle_status',
    })
  }

  // 规则 10: data_nature 不在 ['fact','inferred'] 内
  if (input.data_nature != null && !VALID_DATA_NATURES.includes(input.data_nature)) {
    issues.push({
      code: 'RECORD_INVALID_DATA_NATURE',
      severity: 'blocking',
      message: `数据性质无效: ${input.data_nature}，合法值为: fact, inferred`,
      entity: 'record',
      field: 'data_nature',
    })
  }

  // 规则 11: period_frequency 不在合法枚举内且非 null
  if (input.period_frequency != null && !VALID_PERIOD_FREQUENCIES.includes(input.period_frequency)) {
    issues.push({
      code: 'RECORD_INVALID_PERIOD_FREQUENCY',
      severity: 'blocking',
      message: `规律频率无效: ${input.period_frequency}，合法值为: ${VALID_PERIOD_FREQUENCIES.join(', ')}`,
      entity: 'record',
      field: 'period_frequency',
    })
  }

  // 规则 12: time_anchor_date 为空
  if (!input.time_anchor_date && !context?.isUpdate) {
    issues.push({
      code: 'RECORD_NO_TIME_ANCHOR',
      severity: 'warning',
      message: '缺少时间锚定日期',
      entity: 'record',
      field: 'time_anchor_date',
    })
  }

  return issues
}
