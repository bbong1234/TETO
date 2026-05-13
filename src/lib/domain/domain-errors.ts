/**
 * 领域层错误类型 — 规则中心基础设施
 *
 * - blocking → 阻止写入，返回 400
 * - warning → 不阻止写入，响应中附带
 * - stats_exclusion → 不阻止写入，标记给统计层。P1 仅标记，不自动影响统计
 */

export type InvariantSeverity = 'blocking' | 'warning' | 'stats_exclusion'

export interface InvariantIssue {
  code: string
  severity: InvariantSeverity
  message: string
  entity: 'record' | 'item' | 'sub_item' | 'phase' | 'goal' | 'user_rule' | 'tag' | 'item_folder'
  entityId?: string
  field?: string
  details?: Record<string, any>
}

export interface DomainResult<T> {
  ok: boolean
  data?: T
  errors: InvariantIssue[]   // blocking issues
  warnings: InvariantIssue[] // warning + stats_exclusion issues
}

// ── P2: 批量操作结果类型 ──

export interface BatchItemResult<T> {
  index: number
  ok: boolean
  data?: T
  errors: InvariantIssue[]
  warnings: InvariantIssue[]
}

export interface BatchDomainResult<T> {
  ok: boolean
  total: number
  success: number
  failed: number
  results: BatchItemResult<T>[]
  errors: InvariantIssue[]       // 全局 blocking（如超限）
  warnings: InvariantIssue[]     // 全局 warning
}
