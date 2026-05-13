/**
 * 事项关系校验 — 4 条 DB 关系规则
 *
 * 验证 folder_id 的引用完整性，以及搁置前的事项状态。
 */

import type { InvariantIssue } from './domain-errors'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

export async function validateItemRelations(
  input: {
    folder_id?: string | null
    _existingStatus?: string    // update 时传入，用于判断是否有活跃 phases/goals
    _itemId?: string            // archive 时传入，用于过滤属于该事项的 phases/goals
  },
  context: {
    userId: string
    supabase: SupabaseClient
    isArchiving?: boolean       // true 表示正在执行搁置操作
  }
): Promise<InvariantIssue[]> {
  const issues: InvariantIssue[] = []
  const { userId, supabase, isArchiving } = context

  // 规则 1: folder_id 对应文件夹是否存在
  if (input.folder_id) {
    const { data: folder, error } = await supabase
      .from('item_folders')
      .select('id, user_id')
      .eq('id', input.folder_id)
      .single()

    if (error || !folder) {
      issues.push({
        code: 'ITEM_FOLDER_NOT_FOUND',
        severity: 'warning',
        message: '关联的文件夹不存在',
        entity: 'item',
        field: 'folder_id',
        entityId: input.folder_id,
      })
    } else if (folder.user_id !== userId) {
      // 规则 2: folder_id 不属于当前用户
      issues.push({
        code: 'ITEM_FOLDER_WRONG_USER',
        severity: 'blocking',
        message: '文件夹不属于当前用户',
        entity: 'item',
        field: 'folder_id',
        entityId: input.folder_id,
      })
    }
  }

  // 规则 3 & 4: 搁置操作时检查是否有进行中的 phases/goals
  if (isArchiving && input._existingStatus) {
    // 规则 3: 检查进行中的阶段
    let phasesQuery = supabase
      .from('phases')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', '进行中')
    if (input._itemId) {
      phasesQuery = phasesQuery.eq('item_id', input._itemId)
    }
    const { data: activePhases } = await phasesQuery.limit(1)

    if (activePhases && activePhases.length > 0) {
      issues.push({
        code: 'ITEM_HAS_ACTIVE_PHASES',
        severity: 'warning',
        message: `事项下仍有进行中的阶段（${activePhases[0].title}），搁置后阶段仍会保留`,
        entity: 'item',
        details: { activePhaseCount: activePhases.length },
      })
    }

    // 规则 4: 检查进行中的目标
    let goalsQuery = supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', '进行中')
    if (input._itemId) {
      goalsQuery = goalsQuery.eq('item_id', input._itemId)
    }
    const { data: activeGoals } = await goalsQuery.limit(1)

    if (activeGoals && activeGoals.length > 0) {
      issues.push({
        code: 'ITEM_HAS_ACTIVE_GOALS',
        severity: 'warning',
        message: `事项下仍有进行中的目标（${activeGoals[0].title}），搁置后目标仍会保留`,
        entity: 'item',
        details: { activeGoalCount: activeGoals.length },
      })
    }
  }

  return issues
}
