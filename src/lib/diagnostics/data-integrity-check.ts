/**
 * 数据一致性检查 — 13 项诊断
 *
 * 只读，不修改任何数据。
 * 所有查询加 .eq('user_id', userId)。
 * 分批查询避免 1000 行限制。
 * diagnostics 中枚举检查不 normalize，直接查 DB 原始值。
 * 性能保护：默认扫描上限 5000 条记录。
 */

import type { InvariantIssue } from '@/lib/domain/domain-errors'
import { RECORD_TYPES, LIFECYCLE_STATUSES } from '@/types/teto'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

export interface IntegrityReport {
  generatedAt: string
  summary: {
    blockingCount: number
    warningCount: number
    statsExclusionCount: number
    checkedRecords: number
    checkedItems?: number
    checkedGoals?: number
  }
  issues: InvariantIssue[]
  truncated?: boolean   // 是否因达到扫描上限而截断
  limit?: number        // 默认扫描上限
}

const DEFAULT_SCAN_LIMIT = 5000

/**
 * 分批获取全部记录（突破 Supabase 1000 行限制）
 */
async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  selectFields: string = '*',
  limit?: number
): Promise<{ data: Record<string, any>[]; truncated: boolean }> {
  const PAGE_SIZE = 1000
  const maxRows = limit ?? DEFAULT_SCAN_LIMIT
  const allData: Record<string, any>[] = []
  let from = 0

  while (from < maxRows) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1)
    const { data, error } = await supabase
      .from(table)
      .select(selectFields)
      .eq('user_id', userId)
      .range(from, to)

    if (error) break
    if (!data || data.length === 0) break

    allData.push(...data as Record<string, any>[])

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const truncated = allData.length >= maxRows
  return { data: allData, truncated }
}

export async function runDataIntegrityCheck(
  userId: string,
  supabase: SupabaseClient,
  options?: { limit?: number }
): Promise<IntegrityReport> {
  const limit = options?.limit ?? DEFAULT_SCAN_LIMIT
  const issues: InvariantIssue[] = []

  // 获取所有记录（带截断保护）
  const { data: records, truncated: recordsTruncated } = await fetchAllRows(
    supabase, 'records', userId, 'id, item_id, sub_item_id, phase_id, type, lifecycle_status, data_nature, is_period_rule, period_frequency, period_start_date, period_end_date, period_source_id, content, time_anchor_date, record_day_id', limit)

  const checkedRecords = records.length

  // 获取 sub_items 和 phases 的 item_id 映射
  const { data: subItems } = await supabase
    .from('sub_items')
    .select('id, item_id, user_id')
    .eq('user_id', userId)

  const subItemMap = new Map<string, string>()
  for (const si of subItems ?? []) {
    subItemMap.set(si.id, si.item_id)
  }

  const { data: phases } = await supabase
    .from('phases')
    .select('id, item_id, user_id')
    .eq('user_id', userId)

  const phaseMap = new Map<string, string>()
  for (const ph of phases ?? []) {
    phaseMap.set(ph.id, ph.item_id)
  }

  // 构建 record id set 用于 period_source_id 检查
  const recordIdSet = new Set(records.map(r => r.id))

  // 逐条检查记录
  for (const record of records) {
    // 检查 1: record.sub_item_id 不属于 record.item_id
    if (record.sub_item_id && record.item_id) {
      const subItemItemId = subItemMap.get(record.sub_item_id)
      if (subItemItemId && subItemItemId !== record.item_id) {
        issues.push({
          code: 'DIAG_RECORD_SUB_ITEM_MISMATCH',
          severity: 'blocking',
          message: '记录的子项不属于记录的事项',
          entity: 'record',
          entityId: record.id,
          details: { sub_item_id: record.sub_item_id, expected_item_id: subItemItemId, actual_item_id: record.item_id },
        })
      }
    }

    // 检查 2: record.phase_id 不属于 record.item_id
    if (record.phase_id && record.item_id) {
      const phaseItemId = phaseMap.get(record.phase_id)
      if (phaseItemId && phaseItemId !== record.item_id) {
        issues.push({
          code: 'DIAG_RECORD_PHASE_MISMATCH',
          severity: 'blocking',
          message: '记录的阶段不属于记录的事项',
          entity: 'record',
          entityId: record.id,
          details: { phase_id: record.phase_id, expected_item_id: phaseItemId, actual_item_id: record.item_id },
        })
      }
    }

    // 检查 3: inferred 记录缺少来源
    if (record.data_nature === 'inferred' && !record.period_source_id) {
      issues.push({
        code: 'DIAG_INFERRED_NO_SOURCE',
        severity: 'warning',
        message: '推断记录缺少来源规律记录',
        entity: 'record',
        entityId: record.id,
        field: 'period_source_id',
      })
    }

    // 检查 4: period_source_id 指向不存在记录
    if (record.period_source_id && !recordIdSet.has(record.period_source_id)) {
      issues.push({
        code: 'DIAG_PERIOD_SOURCE_MISSING',
        severity: 'blocking',
        message: '派生记录的来源规律记录不存在',
        entity: 'record',
        entityId: record.id,
        field: 'period_source_id',
        details: { period_source_id: record.period_source_id },
      })
    }

    // 检查 5: is_period_rule=true 但缺少解释字段
    if (record.is_period_rule === true) {
      const hasExplanation =
        record.period_frequency != null ||
        record.period_start_date != null ||
        record.period_end_date != null ||
        (record.content != null && String(record.content).trim() !== '')

      if (!hasExplanation) {
        issues.push({
          code: 'DIAG_PERIOD_RULE_INCOMPLETE',
          severity: 'warning',
          message: '规律记录缺少解释字段',
          entity: 'record',
          entityId: record.id,
          field: 'is_period_rule',
        })
      }
    }

    // 检查 6: record_day.date 与 time_anchor_date 不一致
    // （需要 JOIN record_days，跳过此检查的 inline 实现，改用批量查询）
    // 在下方统一处理

    // 检查 7: records.type 非法值 — 不 normalize
    if (record.type != null && !RECORD_TYPES.includes(record.type)) {
      issues.push({
        code: 'DIAG_INVALID_TYPE',
        severity: 'blocking',
        message: `记录类型非法: ${record.type}`,
        entity: 'record',
        entityId: record.id,
        field: 'type',
      })
    }

    // 检查 8: records.lifecycle_status 非法值 — 不 normalize
    if (record.lifecycle_status != null && !LIFECYCLE_STATUSES.includes(record.lifecycle_status)) {
      issues.push({
        code: 'DIAG_INVALID_LIFECYCLE',
        severity: 'blocking',
        message: `生命周期状态非法: ${record.lifecycle_status}`,
        entity: 'record',
        entityId: record.id,
        field: 'lifecycle_status',
      })
    }

    // 检查 9: records.data_nature 非法值 — 不 normalize
    if (record.data_nature != null && !['fact', 'inferred'].includes(record.data_nature)) {
      issues.push({
        code: 'DIAG_INVALID_DATA_NATURE',
        severity: 'blocking',
        message: `数据性质非法: ${record.data_nature}`,
        entity: 'record',
        entityId: record.id,
        field: 'data_nature',
      })
    }
  }

  // 检查 6: record_day.date 与 time_anchor_date 不一致（批量查询）
  const { data: recordDays } = await supabase
    .from('record_days')
    .select('id, date')
    .eq('user_id', userId)

  const dayDateMap = new Map<string, string>()
  for (const day of recordDays ?? []) {
    dayDateMap.set(day.id, day.date)
  }

  for (const record of records) {
    if (record.time_anchor_date && record.record_day_id) {
      const dayDate = dayDateMap.get(record.record_day_id)
      if (dayDate && dayDate !== record.time_anchor_date) {
        issues.push({
          code: 'DIAG_DATE_ANCHOR_MISMATCH',
          severity: 'warning',
          message: '记录日日期与时间锚定日期不一致',
          entity: 'record',
          entityId: record.id,
          field: 'time_anchor_date',
          details: { record_day_date: dayDate, time_anchor_date: record.time_anchor_date },
        })
      }
    }
  }

  // 检查 10: user_rule 指向不存在 item/sub_item
  const { data: userRules } = await supabase
    .from('user_rules')
    .select('id, target_id, target_type')
    .eq('user_id', userId)

  if (userRules && userRules.length > 0) {
    // 批量获取 item 和 sub_item id
    const itemIds = new Set((await supabase.from('items').select('id').eq('user_id', userId)).data?.map((i: any) => i.id) ?? [])
    const subItemIds = new Set((await supabase.from('sub_items').select('id').eq('user_id', userId)).data?.map((s: any) => s.id) ?? [])

    for (const rule of userRules) {
      if (rule.target_type === 'item' && rule.target_id && !itemIds.has(rule.target_id)) {
        issues.push({
          code: 'DIAG_USER_RULE_ORPHAN_TARGET',
          severity: 'blocking',
          message: '用户规则指向不存在的事项',
          entity: 'user_rule',
          entityId: rule.id,
          details: { target_id: rule.target_id, target_type: 'item' },
        })
      }
      if (rule.target_type === 'sub_item' && rule.target_id && !subItemIds.has(rule.target_id)) {
        issues.push({
          code: 'DIAG_USER_RULE_ORPHAN_TARGET',
          severity: 'blocking',
          message: '用户规则指向不存在的子项',
          entity: 'user_rule',
          entityId: rule.id,
          details: { target_id: rule.target_id, target_type: 'sub_item' },
        })
      }
    }
  }

  // 检查 11-13: goal 指向不存在或已搁置 item/sub_item/phase
  const { data: goals } = await fetchAllRows(
    supabase, 'goals', userId, 'id, item_id, sub_item_id, phase_id'
  )

  const checkedGoals = goals.length

  // 批量获取 items 的状态
  const { data: itemsForGoals } = await supabase
    .from('items')
    .select('id, status')
    .eq('user_id', userId)

  const itemStatusMap = new Map<string, string>()
  for (const item of itemsForGoals ?? []) {
    itemStatusMap.set(item.id, item.status)
  }

  for (const goal of goals) {
    // 检查 11: goal 指向不存在或已搁置 item
    if (goal.item_id) {
      const itemStatus = itemStatusMap.get(goal.item_id)
      if (!itemStatus) {
        issues.push({
          code: 'DIAG_GOAL_ORPHAN_ITEM',
          severity: 'warning',
          message: '目标指向不存在的事项',
          entity: 'goal',
          entityId: goal.id,
          details: { item_id: goal.item_id },
        })
      } else if (itemStatus === '已搁置') {
        issues.push({
          code: 'DIAG_GOAL_ORPHAN_ITEM',
          severity: 'warning',
          message: '目标指向已搁置的事项',
          entity: 'goal',
          entityId: goal.id,
          details: { item_id: goal.item_id, item_status: itemStatus },
        })
      }
    }

    // 检查 12: goal 指向不存在 sub_item
    if (goal.sub_item_id) {
      const subItemExists = subItemMap.has(goal.sub_item_id)
      if (!subItemExists) {
        issues.push({
          code: 'DIAG_GOAL_ORPHAN_SUB_ITEM',
          severity: 'warning',
          message: '目标指向不存在的子项',
          entity: 'goal',
          entityId: goal.id,
          details: { sub_item_id: goal.sub_item_id },
        })
      }
    }

    // 检查 13: goal 指向不存在 phase
    if (goal.phase_id) {
      const phaseExists = phaseMap.has(goal.phase_id)
      if (!phaseExists) {
        issues.push({
          code: 'DIAG_GOAL_ORPHAN_PHASE',
          severity: 'warning',
          message: '目标指向不存在的阶段',
          entity: 'goal',
          entityId: goal.id,
          details: { phase_id: goal.phase_id },
        })
      }
    }
  }

  // ── P2 新增检查 ──

  // 检查 14: 已完成/推迟/取消的计划记录缺少对应的 record_link
  const terminalRecords = records.filter(
    (r: Record<string, any>) =>
      (r.lifecycle_status === 'completed' || r.lifecycle_status === 'postponed' || r.lifecycle_status === 'cancelled') &&
      r.type === '计划'
  )

  if (terminalRecords.length > 0) {
    const terminalIds = terminalRecords.map((r: Record<string, any>) => r.id)

    // 查找指向这些记录的 record_links
    const { data: linksToTerminals } = await supabase
      .from('record_links')
      .select('target_id, link_type')
      .in('target_id', terminalIds)

    const linkedTargetIds = new Set(
      (linksToTerminals ?? []).map((l: Record<string, any>) => l.target_id)
    )

    for (const record of terminalRecords) {
      if (!linkedTargetIds.has(record.id)) {
        issues.push({
          code: 'DIAG_LIFECYCLE_MISSING_LINK',
          severity: 'warning',
          message: `已${record.lifecycle_status === 'completed' ? '完成' : record.lifecycle_status === 'postponed' ? '推迟' : '取消'}的计划记录缺少对应的关联记录`,
          entity: 'record',
          entityId: record.id,
          field: 'lifecycle_status',
          details: { lifecycle_status: record.lifecycle_status },
        })
      }
    }
  }

  // 检查 15: record_link 的 source/target 记录不存在
  const { data: allLinks } = await supabase
    .from('record_links')
    .select('id, source_id, target_id')
    .eq('user_id', userId)

  if (allLinks && allLinks.length > 0) {
    const recordIdsSet = new Set(records.map((r: Record<string, any>) => r.id))

    for (const link of allLinks) {
      if (!recordIdsSet.has(link.source_id)) {
        issues.push({
          code: 'DIAG_ORPHAN_RECORD_LINK',
          severity: 'blocking',
          message: '记录关联的源记录不存在',
          entity: 'record',
          entityId: link.id,
          details: { source_id: link.source_id },
        })
      }
      if (!recordIdsSet.has(link.target_id)) {
        issues.push({
          code: 'DIAG_ORPHAN_RECORD_LINK',
          severity: 'blocking',
          message: '记录关联的目标记录不存在',
          entity: 'record',
          entityId: link.id,
          details: { target_id: link.target_id },
        })
      }
    }
  }

  // 统计
  const blockingCount = issues.filter(i => i.severity === 'blocking').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const statsExclusionCount = issues.filter(i => i.severity === 'stats_exclusion').length

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      blockingCount,
      warningCount,
      statsExclusionCount,
      checkedRecords,
      checkedGoals,
    },
    issues,
    truncated: recordsTruncated,
    limit: recordsTruncated ? limit : undefined,
  }
}
