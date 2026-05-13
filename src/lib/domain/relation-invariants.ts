/**
 * 记录关系规则校验 — 6 条规则
 *
 * 需要 DB 查询验证实体归属和交叉引用关系。
 * 所有查询必须加 user_id 隔离。
 */

import type { InvariantIssue } from './domain-errors'
import { ITEM_STATUSES } from '@/types/teto'

// 已搁置/已完成的事项状态，允许补录旧记录但返回 warning
const SHELVING_STATUSES = ['已搁置', '已完成'] as const

export async function validateRecordRelations(
  input: {
    item_id?: string | null
    sub_item_id?: string | null
    phase_id?: string | null
  },
  context: {
    userId: string
    supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>
  }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase } = context

  // 规则 1 & 2: item 存在性 + 搁置检查
  let itemData: { id: string; status: string } | null = null
  if (input.item_id) {
    const { data: item, error } = await supabase
      .from('items')
      .select('id, status')
      .eq('id', input.item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      issues.push({
        code: 'ITEM_QUERY_FAILED',
        severity: 'blocking',
        message: `查询事项失败: ${error.message}`,
        entity: 'item',
        entityId: input.item_id,
      })
    } else if (!item) {
      // 规则 1: item 不存在
      issues.push({
        code: 'ITEM_NOT_FOUND',
        severity: 'blocking',
        message: '事项不存在',
        entity: 'item',
        entityId: input.item_id,
        field: 'item_id',
      })
    } else {
      itemData = item
      // 规则 2: item 已搁置/已完成
      if (SHELVING_STATUSES.includes(item.status as typeof SHELVING_STATUSES[number])) {
        issues.push({
          code: 'ITEM_SHELVED',
          severity: 'warning',
          message: `事项已${item.status === '已搁置' ? '搁置' : '完成'}，记录仍将保存`,
          entity: 'item',
          entityId: input.item_id,
          field: 'item_id',
        })
      }
    }
  }

  // 规则 3 & 4: sub_item 存在性 + item_id 匹配
  if (input.sub_item_id) {
    const { data: subItem, error } = await supabase
      .from('sub_items')
      .select('id, item_id')
      .eq('id', input.sub_item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      issues.push({
        code: 'SUB_ITEM_QUERY_FAILED',
        severity: 'blocking',
        message: `查询子项失败: ${error.message}`,
        entity: 'sub_item',
        entityId: input.sub_item_id,
      })
    } else if (!subItem) {
      // 规则 3: sub_item 不存在
      issues.push({
        code: 'SUB_ITEM_NOT_FOUND',
        severity: 'blocking',
        message: '子项不存在',
        entity: 'sub_item',
        entityId: input.sub_item_id,
        field: 'sub_item_id',
      })
    } else if (input.item_id) {
      // 规则 4: sub_item.item_id ≠ record.item_id（item_id 非空时才检查交叉引用）
      if (subItem.item_id !== input.item_id) {
        issues.push({
          code: 'SUB_ITEM_ITEM_MISMATCH',
          severity: 'blocking',
          message: '子项不属于指定事项',
          entity: 'sub_item',
          entityId: input.sub_item_id,
          field: 'sub_item_id',
          details: { sub_item_item_id: subItem.item_id, record_item_id: input.item_id },
        })
      }
    }
  }

  // 规则 5 & 6: phase 存在性 + item_id 匹配
  if (input.phase_id) {
    const { data: phase, error } = await supabase
      .from('phases')
      .select('id, item_id')
      .eq('id', input.phase_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      issues.push({
        code: 'PHASE_QUERY_FAILED',
        severity: 'blocking',
        message: `查询阶段失败: ${error.message}`,
        entity: 'phase',
        entityId: input.phase_id,
      })
    } else if (!phase) {
      // 规则 5: phase 不存在
      issues.push({
        code: 'PHASE_NOT_FOUND',
        severity: 'blocking',
        message: '阶段不存在',
        entity: 'phase',
        entityId: input.phase_id,
        field: 'phase_id',
      })
    } else if (input.item_id) {
      // 规则 6: phase.item_id ≠ record.item_id（item_id 非空时才检查交叉引用）
      if (phase.item_id !== input.item_id) {
        issues.push({
          code: 'PHASE_ITEM_MISMATCH',
          severity: 'blocking',
          message: '阶段不属于指定事项',
          entity: 'phase',
          entityId: input.phase_id,
          field: 'phase_id',
          details: { phase_item_id: phase.item_id, record_item_id: input.item_id },
        })
      }
    }
  }

  return issues
}
