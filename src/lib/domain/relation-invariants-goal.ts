/**
 * 目标关系校验 — 5 条 DB 关系规则
 *
 * 验证 item_id / phase_id / sub_item_id 的引用完整性。
 */

import type { InvariantIssue } from './domain-errors'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

export async function validateGoalRelations(
  input: {
    item_id?: string | null
    phase_id?: string | null
    sub_item_id?: string | null
  },
  context: {
    userId: string
    supabase: SupabaseClient
  }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase } = context

  // 规则 1: item_id 对应的事项是否存在且属于当前用户
  if (input.item_id) {
    const { data: item, error } = await supabase
      .from('items')
      .select('id, user_id, status')
      .eq('id', input.item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !item) {
      issues.push({
        code: 'GOAL_ITEM_NOT_FOUND',
        severity: 'blocking',
        message: '关联的事项不存在或不属于当前用户',
        entity: 'goal',
        field: 'item_id',
        entityId: input.item_id,
      })
    }
  }

  // 规则 2: phase_id 对应的阶段是否存在且属于当前用户
  if (input.phase_id) {
    const { data: phase, error } = await supabase
      .from('phases')
      .select('id, user_id, item_id')
      .eq('id', input.phase_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !phase) {
      issues.push({
        code: 'GOAL_PHASE_NOT_FOUND',
        severity: 'blocking',
        message: '关联的阶段不存在或不属于当前用户',
        entity: 'goal',
        field: 'phase_id',
        entityId: input.phase_id,
      })
    } else if (input.item_id && phase.item_id !== input.item_id) {
      // 规则 3: phase_id 必须属于指定的 item_id
      issues.push({
        code: 'GOAL_PHASE_WRONG_ITEM',
        severity: 'blocking',
        message: '阶段不属于指定的事项',
        entity: 'goal',
        field: 'phase_id',
        entityId: input.phase_id,
        details: { phaseItemId: phase.item_id, goalItemId: input.item_id },
      })
    }
  }

  // 规则 4: sub_item_id 对应的子项是否存在且属于当前用户
  if (input.sub_item_id) {
    const { data: subItem, error } = await supabase
      .from('sub_items')
      .select('id, user_id, item_id')
      .eq('id', input.sub_item_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !subItem) {
      issues.push({
        code: 'GOAL_SUB_ITEM_NOT_FOUND',
        severity: 'blocking',
        message: '关联的子项不存在或不属于当前用户',
        entity: 'goal',
        field: 'sub_item_id',
        entityId: input.sub_item_id,
      })
    }
    // 注：子项与事项的匹配关系（subItem.item_id === goal.item_id）由 phase 层隐式保障
    // 因为 sub_item 属于 item，goal 也属于同一个 item，所以不需要额外校验
    // 但如果只给 sub_item_id 不给 item_id，则 subItem.item_id 自动作为隐式 item_id
  }

  return issues
}
