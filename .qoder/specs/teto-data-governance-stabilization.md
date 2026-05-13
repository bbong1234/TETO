# TETO 规则中心 / 数据治理层 — 完整方案 P1-P5

## Context

TETO 当前核心问题：
1. **Problem 1**：修一个 bug 引出另一个 bug — 写入校验分散在 12+ 个入口、多步操作无事务、部分失败无回滚
2. **Problem 3**：简单数据筛选/统计变得复杂且不可信 — 0/24 统计查询过滤 data_nature/lifecycle_status/is_period_rule/review_status，不同页面同一指标数字不同

本方案实现规则中心完整版本：P1 防止用户直接写入路径的新脏数据（异步 AI 回写仍绕过规则中心，P3 解决） → P2 全写路径集成 → P3 AI 写边界 → P4 统计口径层 → P5 多步操作事务化

### 全局约束
- 不修改 docs 和 sql 目录
- 不拆 records 表
- 不重写洞察系统
- 不新增未来功能
- 不做前端规则配置页面
- 不一次性替换所有 API
- 不大重构
- 不新增数据库字段或约束（P5 需新增 RPC 函数，但不在 sql 迁移目录中）

### 阶段闸门

本文件是 TETO 数据治理完整路线图，**不代表一次性执行**。每个阶段必须单独确认、单独执行、单独验收。未通过当前阶段验收，不得进入下一阶段。

**当前默认只允许执行 P1。P2-P5 为后续方案，不得自动执行。**

P1 完成条件：
- `npm run build` + `npm run lint` 通过
- POST/PUT records 行为兼容现有前端
- blocking/warning/stats_exclusion 返回正确
- diagnostics API 可用
- 未接入 AI 回写、complete/postpone/cancel/batch/link、统计口径、RPC

P1 未验收通过，不得进入 P2。P2/P3/P4/P5 均需用户单独确认后才能执行。

---

## P1：最小可用版 — 防止用户直接写入路径的新脏数据 + 让已有脏数据可见

### P1-1 新建领域错误类型

**新建**: `src/lib/domain/domain-errors.ts`

```ts
export type InvariantSeverity = 'blocking' | 'warning' | 'stats_exclusion'

export interface InvariantIssue {
  code: string
  severity: InvariantSeverity
  message: string
  entity: 'record' | 'item' | 'sub_item' | 'phase' | 'goal' | 'user_rule'
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
```

- `blocking` → 阻止写入，返回 400
- `warning` → 不阻止写入，响应中附带
- `stats_exclusion` → 不阻止写入，标记给统计层。**P1 仅标记，不自动影响统计**

### P1-2 新建记录规则校验

**新建**: `src/lib/domain/record-invariants.ts`

```ts
validateRecordInvariants(
  input: Record<string, any>,  // 已合并的完整记录数据
  context?: { isUpdate?: boolean }
): InvariantIssue[]
```

只做纯逻辑校验（枚举、字段组合），不做数据库查询。`input` 应当是合并后的完整数据。

| # | 规则 | severity | code |
|---|------|----------|------|
| 1 | sub_item_id 存在时必须有 item_id | blocking | `RECORD_SUB_ITEM_REQUIRES_ITEM` |
| 2 | phase_id 存在时必须有 item_id | blocking | `RECORD_PHASE_REQUIRES_ITEM` |
| 3 | data_nature='inferred' 时无 period_source_id | warning（过渡策略） | `RECORD_INFERRED_NO_SOURCE` |
| 4 | period_source_id 存在时标记 stats_exclusion | stats_exclusion | `RECORD_DERIVED_FROM_PERIOD` |
| 5 | is_period_rule=true 时缺少解释字段 | warning | `RECORD_PERIOD_RULE_INCOMPLETE` |
| 6 | lifecycle_status='cancelled' 标记 stats_exclusion | stats_exclusion | `RECORD_CANCELLED` |
| 7 | review_status='unchecked' 标记 stats_exclusion | stats_exclusion | `RECORD_UNCHECKED` |
| 8 | type 不在 RECORD_TYPES 内 | blocking | `RECORD_INVALID_TYPE` |
| 9 | lifecycle_status 不在 LIFECYCLE_STATUSES 内 | blocking | `RECORD_INVALID_LIFECYCLE` |
| 10 | data_nature 不在 ['fact','inferred'] 内 | blocking | `RECORD_INVALID_DATA_NATURE` |
| 11 | period_frequency 不在合法枚举内且非 null | blocking | `RECORD_INVALID_PERIOD_FREQUENCY` |
| 12 | time_anchor_date 为空 | warning | `RECORD_NO_TIME_ANCHOR` |

**规则细节**：
- 规则 3：过渡策略，等 P3 AI 写服务接入后升级为 blocking
- 规则 5：至少有 period_frequency/period_start_date/period_end_date/content 之一
- 规则 7：review_status 合法值为 'unchecked'/'confirmed'/'corrected'，不存在 'needs_review'
- 规则 8-11：写入路径先 normalizeRecordType()，diagnostics 不 normalize
- 规则 12：为空返回 warning，createRecord() 有 fallback

### P1-3 新建关系规则校验

**新建**: `src/lib/domain/relation-invariants.ts`

```ts
validateRecordRelations(
  input: {
    item_id?: string | null
    sub_item_id?: string | null
    phase_id?: string | null
  },
  context: {
    userId: string
    supabase: Awaited<ReturnType<typeof createClient>>
  }
): Promise<InvariantIssue[]>
```

| # | 规则 | severity | code | 查询（所有查询必须加 user_id 隔离） |
|---|------|----------|------|------|
| 1 | item 不存在 | blocking | `ITEM_NOT_FOUND` | `SELECT id, status FROM items WHERE id = ? AND user_id = ?` |
| 2 | item 已搁置 | warning | `ITEM_SHELVED` | 用上一步结果检查 status |
| 3 | sub_item 不存在 | blocking | `SUB_ITEM_NOT_FOUND` | `SELECT id, item_id FROM sub_items WHERE id = ? AND user_id = ?` |
| 4 | sub_item.item_id ≠ record.item_id | blocking | `SUB_ITEM_ITEM_MISMATCH` | 用上一步结果比对 |
| 5 | phase 不存在 | blocking | `PHASE_NOT_FOUND` | `SELECT id, item_id FROM phases WHERE id = ? AND user_id = ?` |
| 6 | phase.item_id ≠ record.item_id | blocking | `PHASE_ITEM_MISMATCH` | 用上一步结果比对 |

**修正要点**：
- 签名改为 context 对象，必须包含 userId 和 supabase
- **所有 item/sub_item/phase 查询都必须加 `.eq('user_id', context.userId)`**。sub_items 和 phases 表均有 user_id 列，绝不能只按 id 查
- item status='已搁置'/'已完成' → warning（允许补录/编辑旧记录）
- item_id 为 null 时的行为：
  - record-invariants 已规定 sub_item_id/phase_id 存在但 item_id 为空 → blocking（规则 1/2）
  - 因此 relation-invariants 在 item_id 为 null 时**跳过交叉引用检查**（规则 4/6），避免重复报错
  - 仍检查 sub_item/phase 自身存在性（规则 3/5），作为补充检查

### P1-4 新建统一写入服务

**新建**: `src/lib/domain/record-service.ts`

```ts
interface CreateRecordSafelyParams {
  userId: string
  payload: CreateRecordPayload
  supabase: Awaited<ReturnType<typeof createClient>>
}

interface UpdateRecordSafelyParams {
  userId: string
  id: string
  payload: UpdateRecordPayload
  supabase: Awaited<ReturnType<typeof createClient>>
}

createRecordSafely(params: CreateRecordSafelyParams): Promise<DomainResult<Record>>
updateRecordSafely(params: UpdateRecordSafelyParams): Promise<DomainResult<Record>>
```

**createRecordSafely 流程**：
1. 归一化输入：原始 payload → **normalizedPayload**
   - `normalizeRecordType(payload.type)` → 映射旧类型（'情绪'/'花费'/'结果' → '发生'），默认 '发生'
   - `time_precision === 'inherited'` → 'approx'（'inherited' 仅用于排序，不存入 DB）
   - 默认值：type='发生', is_starred=false, sort_order=0
2. validateRecordInvariants(**normalizedPayload**) → 纯逻辑校验
3. validateRecordRelations(**normalizedPayload**, { userId, supabase }) → DB 归属校验
4. 合并 issues：有 blocking → ok=false；仅 warning/stats_exclusion → ok=true
5. 调用现有 createRecord(userId, **normalizedPayload**)
6. 返回 DomainResult<Record>

**注意**：归一化后全程使用 normalizedPayload，不要用原始 payload 做校验或写入。

**updateRecordSafely 流程（关键：必须合并 existingRecord）**：
1. 查询 existingRecord（不存在 → blocking/not_found）
2. 归一化输入：原始 payload → **normalizedPatch**
   - `normalizeRecordType(payload.type)`
   - `time_precision === 'inherited'` → 'approx'
3. **合并** existingRecord 与 normalizedPatch 为 mergedRecord（normalizedPatch 有值用 normalizedPatch，未传保留 existingRecord）
4. 对 mergedRecord 执行 validateRecordInvariants
5. 对 mergedRecord 执行 validateRecordRelations(mergedRecord, { userId, supabase })（mergedRecord 包含完整 item_id/sub_item_id/phase_id）
6. 合并 issues
7. 调用现有 updateRecord(userId, id, **normalizedPatch**)
8. 返回 DomainResult<Record>

**注意**：
- 不要传 mergedRecord 给 updateRecord（它包含所有字段，会导致未传字段被覆盖为 null）
- 不要传未归一化的原始 payload（可能包含 '情绪' 等旧类型）
- 传 normalizedPatch：归一化后的 patch，只包含用户实际传入的字段

### P1-5 接入 POST/PUT records API

**修改**: `src/app/api/v2/records/route.ts` (POST handler)
- 提前创建 supabase 客户端
- 调用 createRecordSafely
- 成功：`{ data: record, warnings? }` (status 201)
- 失败：`{ error: message, errors }` (status 400)
- 异步 enhanceRecord() 保留不变，但需明确以下风险：
  - createRecordSafely 只能保证**初始写入**合法
  - 异步 AI 回写（enhance-record.ts）仍通过 `supabase.from('records').update()` 直接写入，绕过规则中心
  - 因此 P1 **不能宣称已完全防止所有新脏数据**，仅防止用户直接写入路径的脏数据
  - 该风险在 P3（AI 写边界集成）阶段解决

**修改**: `src/app/api/v2/records/[id]/route.ts` (PUT handler)
- 同上模式，调用 updateRecordSafely
- 成功：`{ data: record, warnings? }` (status 200)
- 失败：`{ error: message, errors }` (status 400)

**响应兼容性**：`{ data: Record }` 格式保持，`warnings` 为可选字段

### P1-6 新建数据一致性检查

**新建**: `src/lib/diagnostics/data-integrity-check.ts`

```ts
interface IntegrityReport {
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
```

### 检查项（所有查询必须加 .eq('user_id', userId)）

| # | 检查 | severity | code | 查询逻辑 |
|---|------|----------|------|---------|
| 1 | record.sub_item_id 不属于 record.item_id | blocking | `DIAG_RECORD_SUB_ITEM_MISMATCH` | JOIN sub_items 比对 item_id |
| 2 | record.phase_id 不属于 record.item_id | blocking | `DIAG_RECORD_PHASE_MISMATCH` | JOIN phases 比对 item_id |
| 3 | inferred 记录缺少来源 | warning | `DIAG_INFERRED_NO_SOURCE` | WHERE data_nature='inferred' AND period_source_id IS NULL |
| 4 | period_source_id 指向不存在记录 | blocking | `DIAG_PERIOD_SOURCE_MISSING` | LEFT JOIN records 找 NULL |
| 5 | is_period_rule=true 但缺少解释字段 | warning | `DIAG_PERIOD_RULE_INCOMPLETE` | WHERE is_period_rule=true AND period_frequency IS NULL AND period_start_date IS NULL AND period_end_date IS NULL AND (content IS NULL OR trim(content) = '') |
| 6 | record_day.date 与 time_anchor_date 不一致 | warning | `DIAG_DATE_ANCHOR_MISMATCH` | JOIN record_days 比对 date ≠ time_anchor_date |
| 7 | records.type 非法值 | blocking | `DIAG_INVALID_TYPE` | WHERE type NOT IN ('发生','计划','想法','总结') — **不 normalize** |
| 8 | records.lifecycle_status 非法值 | blocking | `DIAG_INVALID_LIFECYCLE` | WHERE lifecycle_status NOT IN ('active','completed','postponed','cancelled') AND lifecycle_status IS NOT NULL |
| 9 | records.data_nature 非法值 | blocking | `DIAG_INVALID_DATA_NATURE` | WHERE data_nature NOT IN ('fact','inferred') AND data_nature IS NOT NULL |
| 10 | user_rule 指向不存在 item/sub_item | blocking | `DIAG_USER_RULE_ORPHAN_TARGET` | LEFT JOIN items/sub_items 找 NULL（user_rules.target_id / target_type） |
| 11 | goal 指向不存在或已搁置 item | warning | `DIAG_GOAL_ORPHAN_ITEM` | LEFT JOIN items 找 NULL 或 status='已搁置' |
| 12 | goal 指向不存在 sub_item | warning | `DIAG_GOAL_ORPHAN_SUB_ITEM` | LEFT JOIN sub_items 找 NULL |
| 13 | goal 指向不存在 phase | warning | `DIAG_GOAL_ORPHAN_PHASE` | LEFT JOIN phases 找 NULL |

**修正要点**：
- 检查 5（DIAG_PERIOD_RULE_INCOMPLETE）**必须包含 content**：is_period_rule=true 且 period_frequency/period_start_date/period_end_date/content 四者全空才报。有 content 的规律记录不应被误报
- 这与 record-invariants 规则 5 保持一致（允许 content 作为解释字段）

### 实现要点

- 只读，不修改任何数据
- 所有查询加 .eq('user_id', userId)
- 分批查询避免 1000 行限制（复用 fetchAllRows 模式）
- diagnostics 中枚举检查**不 normalize**，直接查 DB 原始值
- **性能保护**：默认扫描上限 5000 条记录。超过时 truncated=true，limit=5000。后续可加分页

### P1-7 新增 diagnostics API

**新建**: `src/app/api/v2/diagnostics/integrity/route.ts`

```
GET /api/v2/diagnostics/integrity → { data: IntegrityReport }
```

### P1 stats_exclusion 边界声明

P1 阶段 stats_exclusion 只会作为 structured warnings 返回给调用方。不会自动让洞察页、事项页、目标页排除这些记录。真正让 stats_exclusion 生效需要 P4 接入统计口径层。

### P1 不做什么

1. 不接入 complete/postpone/cancel/batch/link 路由（→ P2）
2. 不接入 enhance-record.ts 的 AI 回写（→ P3）— 异步 AI 回写仍绕过规则中心，P1 仅保证用户直接写入路径合法
3. 不接入 deleteItem 事务化（→ P5）
4. 不修改统计口径（→ P4）
5. 不新增数据库字段或约束
6. 不做前端规则配置页面

### P1 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/domain/domain-errors.ts` | InvariantIssue / DomainResult |
| 新建 | `src/lib/domain/record-invariants.ts` | 12 条记录规则 |
| 新建 | `src/lib/domain/relation-invariants.ts` | 6 条关系规则 |
| 新建 | `src/lib/domain/record-service.ts` | createRecordSafely / updateRecordSafely |
| 新建 | `src/lib/diagnostics/data-integrity-check.ts` | runDataIntegrityCheck |
| 新建 | `src/app/api/v2/diagnostics/integrity/route.ts` | GET 端点 |
| 修改 | `src/app/api/v2/records/route.ts` | POST 改用 createRecordSafely |
| 修改 | `src/app/api/v2/records/[id]/route.ts` | PUT 改用 updateRecordSafely |

### P1 已验证字段参考（执行前以代码为准）

以下字段名/表名/枚举值已对照代码验证。**执行编码前必须再次确认，如与代码不一致，以代码为准，不得臆造字段。**

| 项目 | 验证值 | 来源 |
|------|--------|------|
| RECORD_TYPES | `['发生', '计划', '想法', '总结']` | `src/types/teto.ts:12` |
| LIFECYCLE_STATUSES | `['active', 'completed', 'postponed', 'cancelled']` | `src/types/teto.ts:25` |
| ITEM_STATUSES | `['活跃', '推进中', '放缓', '停滞', '已完成', '已搁置']` | `src/types/teto.ts:28` |
| data_nature 合法值 | `'fact' \| 'inferred'` | sql/003 CHECK 约束 |
| review_status 合法值 | `'unchecked' \| 'confirmed' \| 'corrected'` | sql/004 CHECK 约束，teto.ts:136 |
| period_frequency 合法值 | `'daily' \| 'weekly' \| 'monthly' \| 'irregular'` | sql/003 CHECK 约束 |
| time_precision 合法值 | `'exact' \| 'approx' \| 'fuzzy' \| 'unknown'`（DB CHECK）；TS 额外有 `'inherited'` 仅用于排序 | sql/004, teto.ts:118 |
| normalizeRecordType | 函数位于 `src/types/teto.ts:16-20`，映射 '情绪'/'花费'/'结果' → '发生' | teto.ts:16-20 |
| records → record_days FK | `record_day_id`（非 record_days_id） | teto.ts:79, records.ts:29 |
| sub_items 表 | 有 `user_id` 列（NOT NULL），有 `item_id` 列 | sql/014, teto.ts:718 |
| phases 表 | 有 `user_id` 列（NOT NULL），有 `item_id` 列 | sql/003, teto.ts:580 |
| goals 表 | 有 `user_id` 列，有 `item_id`/`phase_id`/`sub_item_id` 列 | sql/003, sql/006 |
| user_rules 表 | 表名 `user_rules`，有 `target_id`/`target_type`/`rule_type` 列 | sql/002 |
| RECORD_LINK_TYPES | `['completes', 'derived_from', 'postponed_from', 'related_to']` | teto.ts:22 |

---

## P2：全写路径集成 — 所有记录写入入口接入规则中心

### 目标

将 P1 仅覆盖的 POST/PUT 两个入口，扩展到 records 的所有写入入口，实现：
1. 每个写入入口都经过规则校验
2. 生命周期操作（complete/postpone/cancel）有专门的生命周期规则
3. 批量操作有结构化的逐条结果

### P2-1 新建生命周期规则校验

**新建**: `src/lib/domain/record-lifecycle-invariants.ts`

```ts
validateLifecycleTransition(
  original: { type: string; lifecycle_status: string | null },
  action: 'complete' | 'postpone' | 'cancel'
): InvariantIssue[]
```

| # | 规则 | severity | code | 说明 |
|---|------|----------|------|------|
| 1 | 完成操作要求 type='计划' | blocking | `LIFECYCLE_COMPLETE_REQUIRES_PLAN` | 仅计划可完成 |
| 2 | 推迟操作要求 type='计划' | blocking | `LIFECYCLE_POSTPONE_REQUIRES_PLAN` | 仅计划可推迟 |
| 3 | 取消操作要求 type='计划' | blocking | `LIFECYCLE_CANCEL_REQUIRES_PLAN` | 仅计划可取消 |
| 4 | lifecycle_status 已为终态时阻止操作 | blocking | `LIFECYCLE_ALREADY_TERMINAL` | 'completed'/'postponed'/'cancelled' 为终态 |
| 5 | 推迟操作缺少 new_date | blocking | `LIFECYCLE_POSTPONE_REQUIRES_DATE` | postpone 必须提供新日期 |

**终态定义**：'completed', 'postponed', 'cancelled' 为终态。从这些状态不能再执行任何生命周期操作。'active' 和 null 为可操作状态。

### P2-2 新建批量结果类型

**在 `src/lib/domain/domain-errors.ts` 中追加**：

```ts
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
```

### P2-3 扩展 record-service.ts

在 `src/lib/domain/record-service.ts` 中追加以下函数：

#### completeRecordSafely

```ts
interface CompleteRecordSafelyParams {
  userId: string
  id: string
  body: { occurred_at?: string; date?: string; completion_content?: string }
  supabase: Awaited<ReturnType<typeof createClient>>
}

completeRecordSafely(params: CompleteRecordSafelyParams): Promise<DomainResult<Record>>
```

**流程**：
1. 查询 original record（不存在 → blocking）
2. validateLifecycleTransition(original, 'complete')
3. 构建 newRecordPayload（type='发生'，复制 30+ 字段，参考 complete/route.ts 第 61-98 行）
4. **调用 validateRecordInvariants(newRecordPayload) + validateRecordRelations(newRecordPayload, { userId, supabase })**
   - 规则中心不可绕过：生命周期操作内部创建新记录也必须经过校验
   - 如因兼容现有逻辑不能直接调用 createRecordSafely，必须显式执行这两个校验函数
5. 关联实体宽松失败处理：
   - item 不存在/已搁置 → newRecordPayload.item_id = null，**返回 warning `LIFECYCLE_ENTITY_CLEARED`**，说明被清空的字段和原因
   - phase 不存在 → newRecordPayload.phase_id = null，**返回 warning**
   - sub_item 不存在 → newRecordPayload.sub_item_id = null，**返回 warning**
   - **不得静默丢字段**：如果因不存在被置 null，必须返回 warning 说明
6. 调用 createRecord(userId, newRecordPayload) 创建新发生记录
7. 调用 createRecordLink(userId, newRecord.id, original.id, 'completes')
8. 调用 updateRecord(userId, original.id, { lifecycle_status: 'completed' })
9. 返回 DomainResult（data 为新发生记录，warnings 包含被清空字段的 warning）

**与现有 complete 路由的区别**：
- 增加了生命周期规则校验（步骤 2）
- 新记录也经过 record-invariants + relation-invariants 校验（步骤 4）
- 关联实体验证从"静默设 null"改为"warning + 设 null"（不得静默丢字段）

#### postponeRecordSafely

```ts
interface PostponeRecordSafelyParams {
  userId: string
  id: string
  new_date: string
  supabase: Awaited<ReturnType<typeof createClient>>
}

postponeRecordSafely(params: PostponeRecordSafelyParams): Promise<DomainResult<Record>>
```

**流程**：
1. 查询 original record
2. validateLifecycleTransition(original, 'postpone')
3. 构建 newRecordPayload（type='计划'，time_anchor_date=new_date，复制字段）
4. **调用 validateRecordInvariants(newRecordPayload) + validateRecordRelations(newRecordPayload, { userId, supabase })**
5. 关联实体宽松失败处理（同 complete：置 null + warning，不得静默丢字段）
6. createRecord(userId, newRecordPayload)
6. createRecordLink(userId, newRecord.id, original.id, 'postponed_from')
7. updateRecord(userId, original.id, { lifecycle_status: 'postponed' })
8. 返回 DomainResult

#### cancelRecordSafely

```ts
interface CancelRecordSafelyParams {
  userId: string
  id: string
  supabase: Awaited<ReturnType<typeof createClient>>
}

cancelRecordSafely(params: CancelRecordSafelyParams): Promise<DomainResult<Record>>
```

**流程**：
1. 查询 original record
2. validateLifecycleTransition(original, 'cancel')
3. updateRecord(userId, original.id, { lifecycle_status: 'cancelled' })
4. 返回 DomainResult

注意：cancel 不创建新记录、不创建 record_link、不验证关联实体（仅更新 lifecycle_status）

#### batchCreateRecordsSafely

```ts
interface BatchCreateRecordsSafelyParams {
  userId: string
  records: CreateRecordPayload[]
  supabase: Awaited<ReturnType<typeof createClient>>
}

batchCreateRecordsSafely(params: BatchCreateRecordsSafelyParams): Promise<BatchDomainResult<Record>>
```

**流程**：
1. 全局校验：records 非空数组，≤2000 条
2. 批量验证 item_id 归属（一次性查询所有不重复 item_id）
3. 逐条预处理 + 校验：
   - 日期标准化（YYYY/MM/DD → YYYY-MM-DD）
   - normalizeRecordType()
   - validateRecordInvariants(perRecord)
   - 记录每条的 errors/warnings
4. 对校验通过的记录：调用现有 batchCreateRecords（分批 500 条插入）
5. 返回 BatchDomainResult（含逐条 success/failed/errors/warnings）

**响应格式**（兼容现有 batch 响应）：
```json
{
  "data": {
    "total": 100,
    "success": 95,
    "failed": 5,
    "errors": ["第1条: content 为必填字段", ...],
    "results": [  // P2 新增，可选
      { "index": 0, "ok": true, "warnings": [...] },
      { "index": 4, "ok": false, "errors": [...] }
    ]
  }
}
```

#### batchDeleteRecordsSafely

```ts
interface BatchDeleteRecordsSafelyParams {
  userId: string
  ids: string[]
  supabase: Awaited<ReturnType<typeof createClient>>
}

batchDeleteRecordsSafely(params: BatchDeleteRecordsSafelyParams): Promise<BatchDomainResult<void>>
```

**流程**：
1. 全局校验：ids 非空数组，≤200 条
2. 验证所有权（SELECT id FROM records WHERE id IN ids AND user_id = userId）
3. 逐步删除：record_links → record_tags → records
4. 返回 BatchDomainResult（含每条记录的删除结果）

**注意**：batch-delete 当前已有"先删关联再删记录"的顺序逻辑，P2 不改变此逻辑，仅用 DomainResult 包装返回值。

#### linkRecordsSafely

```ts
interface LinkRecordsSafelyParams {
  userId: string
  record_id: string
  linked_record_id: string | null
  supabase: Awaited<ReturnType<typeof createClient>>
}

linkRecordsSafely(params: LinkRecordsSafelyParams): Promise<DomainResult<{ record_id: string; linked_record_id: string | null }>>
```

**流程**：
1. 验证 record_id 存在且属于用户
2. 如果 linked_record_id 非 null：验证目标记录存在且属于用户、不能自关联
3. update records SET linked_record_id = linked_record_id WHERE id = record_id
4. 返回 DomainResult

### P2-4 接入所有路由

| 路由 | 改动 |
|------|------|
| `POST /api/v2/records/[id]/complete` | 调用 completeRecordSafely，移除内联校验 |
| `POST /api/v2/records/[id]/postpone` | 调用 postponeRecordSafely，移除内联校验 |
| `POST /api/v2/records/[id]/cancel` | 调用 cancelRecordSafely，移除内联校验 |
| `POST /api/v2/records/batch` | 调用 batchCreateRecordsSafely，移除内联校验 |
| `POST /api/v2/records/batch-delete` | 调用 batchDeleteRecordsSafely，移除内联校验 |
| `POST /api/v2/records/link` | 调用 linkRecordsSafely，移除内联校验 |

每个路由的响应格式保持兼容，仅追加 `warnings` 可选字段。错误响应使用 `{ error: message, errors: InvariantIssue[] }` 格式。

### P2-5 扩展 diagnostics

在 `data-integrity-check.ts` 中追加以下检查项：

| # | 检查 | severity | code |
|---|------|----------|------|
| 14 | 已完成/推迟/取消的计划记录缺少对应的 record_link | warning | `DIAG_LIFECYCLE_MISSING_LINK` |
| 15 | record_link 的 source/target 记录不存在 | blocking | `DIAG_ORPHAN_RECORD_LINK` |

### P2 不做什么

1. 不接入 enhance-record.ts（→ P3）
2. 不接入 deleteItem/deleteSubItem/deletePhase 事务化（→ P5）
3. 不修改统计口径（→ P4）
4. 不修改前端代码
5. 不新增数据库字段或约束

### P2 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/domain/record-lifecycle-invariants.ts` | 5 条生命周期规则 |
| 修改 | `src/lib/domain/domain-errors.ts` | 追加 BatchItemResult / BatchDomainResult |
| 修改 | `src/lib/domain/record-service.ts` | 追加 6 个 Safely 函数 |
| 修改 | `src/lib/diagnostics/data-integrity-check.ts` | 追加 2 项检查 |
| 修改 | `src/app/api/v2/records/[id]/complete/route.ts` | 接入 completeRecordSafely |
| 修改 | `src/app/api/v2/records/[id]/postpone/route.ts` | 接入 postponeRecordSafely |
| 修改 | `src/app/api/v2/records/[id]/cancel/route.ts` | 接入 cancelRecordSafely |
| 修改 | `src/app/api/v2/records/batch/route.ts` | 接入 batchCreateRecordsSafely |
| 修改 | `src/app/api/v2/records/batch-delete/route.ts` | 接入 batchDeleteRecordsSafely |
| 修改 | `src/app/api/v2/records/link/route.ts` | 接入 linkRecordsSafely |

---

## P3：AI 写边界集成 — 约束 AI 增强写入范围

### 目标

将 enhance-record.ts 的 AI 回写纳入规则中心管控：
1. 定义 AI 可写字段白名单和所有权策略
2. AI 写入必须设置 review_status='unchecked'
3. AI 写入必须设置 data_nature='inferred'（如果有来源则设置 period_source_id）
4. AI 写入结果有结构化追踪

### 当前 AI 写入现状（已验证）

`src/lib/ai/enhance-record.ts` 当前行为：
- 使用"只填空白"（Only Fill Empty）模式，永远不覆盖用户已有值
- 直接通过 `supabase.from('records').update()` 写入，绕过所有校验
- **从不设置 review_status** — 无代码提及
- **从不设置 data_nature='inferred'** — 无代码提及
- 可写字段：item_id, sub_item_id, metric_value/unit/name, cost, duration_minutes, occurred_at_end, mood, energy, location, people, 三层九组字段, result, status, parsed_semantic, time_anchor_date
- 不可写字段：id, user_id, record_day_id, content, date, type, occurred_at, batch_id, lifecycle_status, data_nature, is_period_rule, period_*, created_at, updated_at

### P3-1 新建 AI 写入策略

**新建**: `src/lib/domain/ai-write-policy.ts`

```ts
export type FieldOwner = 'user' | 'ai' | 'shared'

export interface AiFieldPolicy {
  field: string
  owner: FieldOwner
  aiCanWrite: boolean
  requiresReview: boolean    // AI 写入后是否需要 review
  overwriteRule: 'never' | 'if_empty' | 'if_unconfirmed'
}

// 定义所有记录字段的 AI 写入策略
export const AI_FIELD_POLICIES: Record<string, AiFieldPolicy> = { ... }
```

**策略规则**：

| 字段分类 | owner | aiCanWrite | overwriteRule | 说明 |
|---------|-------|------------|---------------|------|
| content | user | **false** | never | 内容永不 AI 覆写 |
| type, lifecycle_status, date | user | false | never | 用户控制的生命周期字段 |
| item_id, sub_item_id | shared | true | if_empty | AI 可建议但只填空白 |
| metric_value/unit/name | shared | true | if_empty | AI 可补充度量信息 |
| mood, energy | shared | true | if_empty | AI 可推断情绪/能量 |
| location, people | shared | true | if_empty | AI 可提取位置/人物 |
| 三层九组字段 | shared | true | if_empty | AI 解析的结构化字段 |
| result, status | shared | true | if_empty | AI 推断 |
| parsed_semantic | ai | true | never | AI 解析结果，自有 |
| confidence_level | ai | true | never | AI 信心度 |
| review_status | shared | **true** | if_unconfirmed | AI 写入时设为 'unchecked' |
| data_nature | shared | **true** | if_unconfirmed | AI 写入时设为 'inferred' |
| period_source_id | ai | true | if_empty | AI 派生记录来源 |

**overwriteRule 细节**：
- `never`：永不覆写
- `if_empty`：只在字段为 null/undefined 时写入（当前 OFFE 行为）
- `if_unconfirmed`：只在 review_status≠'confirmed' 时写入（比 if_empty 更宽松，但保护用户确认过的值）

### P3-2 新建字段所有权校验

**新建**: `src/lib/domain/field-ownership-policy.ts`

```ts
export interface AiWriteResult {
  changedFields: string[]      // AI 实际修改的字段列表
  skippedFields: string[]      // AI 尝试但被策略跳过的字段
  skippedReasons: Record<string, string>  // field → reason
  reviewFields: string[]       // 需要用户审核的字段
}

export function applyFieldOwnershipPolicy(
  existingRecord: Record<string, any>,
  aiUpdate: Record<string, any>,
  policies: Record<string, AiFieldPolicy>
): { allowedUpdate: Record<string, any>; result: AiWriteResult }
```

**流程**：
1. 遍历 aiUpdate 的每个字段
2. 查找该字段的 policy
3. 如果 aiCanWrite=false → 加入 skippedFields
4. 如果 overwriteRule='never' → 加入 skippedFields
5. 如果 overwriteRule='if_empty' 且 existingRecord[field] 有值 → 加入 skippedFields
6. 如果 overwriteRule='if_unconfirmed' 且 existingRecord.review_status='confirmed' → 加入 skippedFields
7. 否则 → 加入 allowedUpdate 和 changedFields
8. 如果 policy.requiresReview=true → 加入 reviewFields

### P3-3 新建 AI 记录服务

**新建**: `src/lib/domain/record-ai-service.ts`

```ts
interface ApplyAiEnhancementSafelyParams {
  userId: string
  recordId: string
  aiUpdate: Record<string, any>
  source?: { type: 'parse' | 'period_expansion'; sourceId?: string }
  supabase: Awaited<ReturnType<typeof createClient>>
}

applyAiEnhancementSafely(
  params: ApplyAiEnhancementSafelyParams
): Promise<DomainResult<Record & { _aiWriteResult?: AiWriteResult }>>
```

**流程**：
1. 查询 existingRecord
2. 调用 applyFieldOwnershipPolicy(existingRecord, aiUpdate, AI_FIELD_POLICIES) → allowedUpdate + AiWriteResult
3. **自动追加 AI 元数据**：
   - `allowedUpdate.review_status = 'unchecked'`（如果当前不是 'confirmed'/'corrected'）
   - **data_nature 不自动修改**：AI 补充用户已有记录的字段，不改变整条记录的 data_nature。data_nature 表示"整条记录本身是否为事实"，不是"是否被 AI 补过字段"。只有以下情况才设置 data_nature='inferred'：
     - AI 生成的派生记录（source.type='derived'）
     - 周期规律展开记录（source.type='period_expansion'）
     - 用户原始输入的记录始终为 'fact'（或保持现有值）
   - AI 补字段的影响通过 `review_status='unchecked'` + `AiWriteResult.changedFields` 标记，而非修改 data_nature
   - `allowedUpdate.period_source_id = source.sourceId`（如果有来源）
4. 调用 validateRecordInvariants(mergedRecord) — 合并 existingRecord + allowedUpdate
5. 调用 validateRecordRelations(mergedRecord, { userId, supabase })
6. 如果有 blocking → ok=false，不写入
7. 执行 supabase.from('records').update(allowedUpdate).eq('id', recordId).eq('user_id', userId)
8. 返回 DomainResult，data._aiWriteResult = AiWriteResult

### P3-4 修改 enhance-record.ts

**修改**: `src/lib/ai/enhance-record.ts`

**核心改动**：
1. 将第 410-416 行的直接 `supabase.from('records').update(update)` 替换为调用 `applyAiEnhancementSafely`
2. 将歧义情况（第 391-396 行）的 `supabase.from('records').update(safeUpdate)` 同样替换
3. 在构建 update 对象时，不再手动判断"只填空白"（OFFE 逻辑），改为直接构建 aiUpdate，让 applyFieldOwnershipPolicy 处理

**改动前后对比**：
```ts
// 改动前：手动 OFFE + 直接写入
if (!existingRecord.mood && firstUnit.mood) update.mood = firstUnit.mood;
// ... 30+ 字段逐一判断 ...
await supabase.from('records').update(update).eq('id', recordId)

// 改动后：构建 aiUpdate + 策略引擎 + 校验
const aiUpdate: Record<string, any> = {};
if (firstUnit.mood) aiUpdate.mood = firstUnit.mood;
// ... 所有字段直接加入（不判断空白）...
const result = await applyAiEnhancementSafely({ userId, recordId, aiUpdate, supabase });
```

**ClarificationNeeded 流程保持不变**：歧义检测逻辑（shared_duration, sub_item_ambiguous, low_confidence）不修改。

### P3-5 过渡策略升级

完成 P3 后，以下规则升级：
- P1 规则 3（inferred 无来源）：从 **warning** 升级为 **blocking**
  - 因为 P3-3 会自动设置 data_nature='inferred' + period_source_id
  - 如果 inferred 无来源，说明数据确实有问题

### P3 不做什么

1. 不修改 /api/v2/parse 端点（它不写入记录，只返回解析结果）
2. 不修改前端 QuickInput.tsx 的客户端增强逻辑
3. 不修改 parsed_semantic 的内容格式
4. 不实现 AI 写入的撤销功能
5. 不修改 statistics 计算

### P3 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/domain/ai-write-policy.ts` | AI 字段策略定义 + AiFieldPolicy |
| 新建 | `src/lib/domain/field-ownership-policy.ts` | applyFieldOwnershipPolicy + AiWriteResult |
| 新建 | `src/lib/domain/record-ai-service.ts` | applyAiEnhancementSafely |
| 修改 | `src/lib/ai/enhance-record.ts` | 用 applyAiEnhancementSafely 替换直接写入 |
| 修改 | `src/lib/domain/record-invariants.ts` | 规则 3 升级为 blocking |

---

## P4：统计口径层 — 统一统计筛选规则

### 目标

解决"不同页面同一指标数字不同"问题：
1. 定义每个统计指标的精确筛选规则
2. 统一所有统计查询使用相同的筛选器
3. stats_exclusion 标记真正生效

### 当前统计现状（已验证）

| 查询层 | 文件 | type 过滤 | data_nature 过滤 | lifecycle_status 过滤 | is_period_rule 过滤 | review_status 过滤 |
|--------|------|-----------|-----------------|----------------------|-------------------|-------------------|
| insights.computeDayTimeline | insights.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| insights.computeActivityHeatmap | insights.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| insights.computeItemActivity | insights.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| insights.computeTimeDistribution | insights.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| insights.computePeriodChanges | insights.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| insights.computeDataReview | insights.ts | ✗ | 计数非过滤 | ✗ | ✗ | ✗ |
| goal-engine.sumMetricValues | goal-engine.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| goal-engine.sumDuration | goal-engine.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| goal-engine.countRecords | goal-engine.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| items.computeItemAggregation | items/[id]/route.ts | ✗ | ✗ | ✗ | ✗ | ✗ |
| items.computeRecentDailyStats | items/[id]/route.ts | ✗ | ✗ | ✗ | ✗ | ✗ |

**结论**：0/11 查询函数过滤 data_nature/lifecycle_status/is_period_rule/review_status/type

### P4-1 新建指标定义

**新建**: `src/lib/stats/metric-definitions.ts`

```ts
export type MetricCaliber = 'display' | 'insight'
// display: 宽松展示口径，可包含 unchecked，用于记录列表、日历、普通展示
// insight: 严格洞察口径，默认排除 unchecked/inferred/period_rule/cancelled，用于目标进度、时间投入、有效行动、趋势洞察

export interface MetricDefinition {
  id: string
  label: string
  description: string
  unit: string
  caliber: MetricCaliber            // display 或 insight
  dateField: 'time_anchor_date' | 'created_at' | 'occurred_at'  // 日期过滤用哪个字段
  includeTypes: RecordType[]          // 只包含这些 type
  excludeLifecycleStatuses: LifecycleStatus[]  // 排除这些 lifecycle_status
  includeDataNature: ('fact' | 'inferred')[]   // 只包含这些 data_nature
  excludePeriodRules: boolean         // 是否排除 is_period_rule=true
  excludeReviewStatuses: string[]     // 排除这些 review_status
  computeBy: 'count' | 'sum_duration' | 'sum_metric' | 'composite'
}
```

**口径区分说明**：
- **display（宽松展示口径）**：可包含 review_status='unchecked'，用于记录列表、日历、普通展示。必须显示未确认标识
- **insight（严格洞察口径）**：默认排除 unchecked/inferred/is_period_rule=true/cancelled，用于目标进度、时间投入、有效行动、趋势洞察、事项活跃度、停滞判断

**9 个核心指标定义**：

```ts
export const CORE_METRICS: Record<string, MetricDefinition> = {
  // --- 洞察页指标 ---
  activity_heatmap: {
    id: 'activity_heatmap',
    label: '活跃热力图',
    description: '每日记录数量分布（宽松口径，包含未确认记录）',
    unit: '条',
    caliber: 'display',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: [],         // display 口径：不排除 unchecked
    computeBy: 'count',
  },

  time_distribution: {
    id: 'time_distribution',
    label: '时间分布',
    description: '记录在一天中的时间分布（宽松口径）',
    unit: '条',
    caliber: 'display',
    dateField: 'occurred_at',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: [],         // display 口径：不排除 unchecked
    computeBy: 'count',
  },

  period_comparison: {
    id: 'period_comparison',
    label: '周/月对比',
    description: '本周vs上周、本月vs上月的变化（严格口径）',
    unit: '综合',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'composite',
  },

  // --- 事项页指标 ---
  item_total_effort: {
    id: 'item_total_effort',
    label: '事项总投入',
    description: '某事项下所有有效记录的时长/花费/度量汇总（严格口径）',
    unit: '分钟',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'sum_duration',
  },

  item_daily_breakdown: {
    id: 'item_daily_breakdown',
    label: '事项日维度分解',
    description: '某事项下按日+子事项分解的统计（宽松口径）',
    unit: '综合',
    caliber: 'display',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: [],         // display 口径：不排除 unchecked
    computeBy: 'composite',
  },

  // --- 目标引擎指标 ---
  goal_progress: {
    id: 'goal_progress',
    label: '目标进度',
    description: '目标完成百分比（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'sum_metric',
  },

  // --- 活跃度评分指标 ---
  activity_score: {
    id: 'activity_score',
    label: '活跃度评分',
    description: '事项活跃度/停滞判断（严格口径）',
    unit: '分',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '计划', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'composite',
  },

  plan_achievement: {
    id: 'plan_achievement',
    label: '计划达成率',
    description: '按时完成的计划数 / 总计划数（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['计划'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'count',
  },

  effectiveness: {
    id: 'effectiveness',
    label: '有效性',
    description: '有结果的记录数 / 有时长的记录数（严格口径）',
    unit: '%',
    caliber: 'insight',
    dateField: 'time_anchor_date',
    includeTypes: ['发生', '总结'],
    excludeLifecycleStatuses: ['cancelled'],
    includeDataNature: ['fact'],
    excludePeriodRules: true,
    excludeReviewStatuses: ['unchecked'],  // insight 口径：排除 unchecked
    computeBy: 'composite',
  },
}
```

**关键决策说明**：
- **统计口径**：只统计 type=['发生','总结']，排除计划/想法；排除 lifecycle_status='cancelled'；排除 data_nature='inferred'；排除 is_period_rule=true
- **口径区分**：display 口径不排除 review_status（用于展示），insight 口径排除 unchecked（用于洞察/目标）
- **dateField 选择**：统一使用 `time_anchor_date`（而非 `record_days.date`），因为 time_anchor_date 是记录的实际日期锚点。过渡期间需处理 time_anchor_date 为 null 的记录（fallback 到 record_day.date）
- **inferred 处理**：所有指标 includeDataNature=['fact']，即排除 inferred。确保统计数字只反映用户确认的事实
- **null 兼容策略（必须处理 SQL null 语义）**：
  - lifecycle_status 为 null → 按 'active' 处理（旧记录无此字段，视为活跃）
  - is_period_rule 为 null → 按 false 处理（旧记录无此字段，视为非规律记录）
  - data_nature 为 null → 按 'fact' 处理（旧记录无此字段，视为事实）
  - review_status 为 null → 按 'confirmed' 处理（旧记录无此字段，视为已确认）
  - **不得简单依赖 .neq()**：SQL 中 `NULL ≠ 'cancelled'` 结果为 NULL（不是 TRUE），会导致旧记录被误排除
  - 实现方式：`.or('lifecycle_status.is.null,lifecycle_status.neq.cancelled')` 或在应用层过滤

### P4-2 新建记录筛选器

**新建**: `src/lib/stats/record-filters.ts`

```ts
import { MetricDefinition } from './metric-definitions'

export function buildStatsQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  metric: MetricDefinition,
  options?: {
    itemId?: string
    subItemId?: string
    dateFrom?: string
    dateTo?: string
  }
) {
  let q = supabase
    .from('records')
    .select('*')
    .eq('user_id', userId)

  // type 过滤
  if (metric.includeTypes.length > 0) {
    q = q.in('type', metric.includeTypes)
  }

  // lifecycle_status 过滤（null 兼容：null 按 active 处理，不被排除）
  if (metric.excludeLifecycleStatuses.length > 0) {
    // 不能简单 .neq()：SQL NULL ≠ 'cancelled' 结果为 NULL，旧记录被误排除
    // 用 .or() 包含 null 的情况
    for (const status of metric.excludeLifecycleStatuses) {
      q = q.or(`lifecycle_status.is.null,lifecycle_status.neq.${status}`)
    }
  }

  // data_nature 过滤（null 兼容：null 按 fact 处理）
  if (metric.includeDataNature.length > 0) {
    // data_nature 为 null 的旧记录视为 fact，需要包含
    if (metric.includeDataNature.includes('fact')) {
      q = q.or(`data_nature.is.null,data_nature.in.(${metric.includeDataNature.join(',')})`)
    } else {
      q = q.in('data_nature', metric.includeDataNature)
    }
  }

  // is_period_rule 过滤（null 兼容：null 按 false 处理，不被排除）
  if (metric.excludePeriodRules) {
    // is_period_rule 为 null 的旧记录视为 false，不应被排除
    q = q.or('is_period_rule.is.null,is_period_rule.neq.true')
  }

  // review_status 过滤（null 兼容：null 按 confirmed 处理，不被排除）
  if (metric.excludeReviewStatuses.length > 0) {
    for (const rs of metric.excludeReviewStatuses) {
      // review_status 为 null 的旧记录视为 confirmed，不应被排除
      q = q.or(`review_status.is.null,review_status.neq.${rs}`)
    }
  }

  // 范围过滤
  if (options?.itemId) {
    q = q.eq('item_id', options.itemId)
  }
  if (options?.subItemId) {
    q = q.eq('sub_item_id', options.subItemId)
  }
  if (options?.dateFrom || options?.dateTo) {
    // 使用 time_anchor_date 过滤
    // 当 time_anchor_date 为 null 时，通过 record_day fallback
    // 详见 date-policy.ts
  }

  return q
}
```

### P4-3 新建日期策略

**新建**: `src/lib/stats/date-policy.ts`

```ts
/**
 * 统一日期过滤策略
 *
 * 优先使用 time_anchor_date，当为 null 时 fallback 到 record_days.date
 * 这解决了当前 insights.ts 使用 record_days.date 而
 * 其他地方使用 time_anchor_date 的不一致问题
 */

export async function getRecordsInDateRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dateFrom: string,
  dateTo: string,
  selectFields: string = '*'
): Promise<any[]> {
  // 方案：查询 records，WHERE
  //   time_anchor_date BETWEEN dateFrom AND dateTo
  //   OR (time_anchor_date IS NULL AND record_day_id IN (SELECT id FROM record_days WHERE date BETWEEN dateFrom AND dateTo))
  //
  // Supabase 实现：
  //   .or(`time_anchor_date.gte.${dateFrom},time_anchor_date.is.null`)
  //   然后在应用层过滤

  // 实际实现用 record_days JOIN 或两步查询
  // 第一步：获取日期范围内的 record_day IDs
  const { data: dayIds } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo)

  // 空数组保护：dayIds 为空时，不能生成 record_day_id.in.() 非法查询
  const dayIdList = (dayIds || []).map(d => d.id)
  if (dayIdList.length === 0) {
    // 无匹配 record_day，只查有 time_anchor_date 的记录
    const { data } = await supabase
      .from('records')
      .select(selectFields)
      .eq('user_id', userId)
      .gte('time_anchor_date', dateFrom)
      .lte('time_anchor_date', dateTo)
    return data || []
  }

  // 第二步：查询 time_anchor_date 在范围内 OR record_day_id 在 dayIds 内
  const { data } = await supabase
    .from('records')
    .select(selectFields)
    .eq('user_id', userId)
    .or(
      `and(time_anchor_date.gte.${dateFrom},time_anchor_date.lte.${dateTo}),` +
      `and(time_anchor_date.is.null,record_day_id.in.(${dayIdList.join(',')}))`
    )

  return data || []
}
```

### P4-4 新建指标解释器

**新建**: `src/lib/stats/metric-explain.ts`

```ts
import { MetricDefinition } from './metric-definitions'

/**
 * 给定一个指标 ID，返回人类可读的筛选规则说明
 * 用于 diagnostics 和调试
 */
export function explainMetric(metricId: string): string {
  const m = CORE_METRICS[metricId]
  if (!m) return `未知指标: ${metricId}`

  const lines: string[] = []
  lines.push(`指标: ${m.label} (${m.id})`)
  lines.push(`说明: ${m.description}`)
  lines.push(`日期字段: ${m.dateField}`)
  lines.push(`包含类型: ${m.includeTypes.join(', ')}`)
  if (m.excludeLifecycleStatuses.length) {
    lines.push(`排除状态: ${m.excludeLifecycleStatuses.join(', ')}`)
  }
  lines.push(`数据性质: ${m.includeDataNature.join(', ')}`)
  if (m.excludePeriodRules) {
    lines.push(`排除规律记录: 是`)
  }
  if (m.excludeReviewStatuses.length) {
    lines.push(`排除审核状态: ${m.excludeReviewStatuses.join(', ')}`)
  }
  lines.push(`计算方式: ${m.computeBy}`)

  return lines.join('\n')
}

/**
 * 返回某个指标的筛选规则摘要（用于 API 响应）
 */
export function getMetricFilterSummary(metricId: string): Record<string, any> {
  const m = CORE_METRICS[metricId]
  if (!m) return { error: `未知指标: ${metricId}` }

  return {
    id: m.id,
    label: m.label,
    includeTypes: m.includeTypes,
    excludeLifecycleStatuses: m.excludeLifecycleStatuses,
    includeDataNature: m.includeDataNature,
    excludePeriodRules: m.excludePeriodRules,
    excludeReviewStatuses: m.excludeReviewStatuses,
    dateField: m.dateField,
  }
}
```

### P4-5 渐进式接入顺序

不一次性替换所有统计查询，而是按以下顺序逐个接入：

**第一批：insights.ts（洞察页）**
1. `computeActivityHeatmap` → 使用 `activity_heatmap` 指标定义
2. `computeTimeDistribution` → 使用 `time_distribution` 指标定义
3. `computePeriodChanges` → 使用 `period_comparison` 指标定义
4. `computeDayTimeline` → 使用 `activity_heatmap` 指标定义（同口径）
5. `computeItemActivity` → 使用 `item_total_effort` 指标定义

**第二批：goal-engine.ts（目标页）**
6. `sumMetricValuesInPeriod` → 使用 `goal_progress` 指标定义
7. `sumDurationInPeriod` → 使用 `goal_progress` 指标定义
8. `countRecordsInPeriod` → 使用 `goal_progress` 指标定义

**第三批：items API（事项页）**
9. `computeItemAggregation` → 使用 `item_total_effort` 指标定义
10. `computeRecentDailyStats` → 使用 `item_daily_breakdown` 指标定义

**接入方式**：在每个查询函数内部，将现有的 `supabase.from('records').select()` 替换为 `buildStatsQuery()` 构建的查询。保持函数签名和返回值不变，仅替换查询构建部分。

### P4-6 stats_exclusion 正式生效

完成 P4 后，以下规则链生效：
1. P1/P2：写入时标记 stats_exclusion（cancelled, unchecked, period_source_id 等）
2. P4：统计查询通过 MetricDefinition 的筛选规则自动排除这些记录
3. **不再需要显式读取 stats_exclusion 标记** — MetricDefinition 的 includeTypes/excludeLifecycleStatuses/includeDataNature/excludePeriodRules 已经覆盖了所有 stats_exclusion 场景

stats_exclusion 的价值：作为 warning 返回给调用方，告知"此记录因 X 原因将不参与统计"。它是一个**信息标记**，不是**执行机制**。执行机制是 MetricDefinition。

### P4 不做什么

1. 不修改前端展示逻辑
2. 不新增数据库字段或约束
3. 不重写 insights.ts / goal-engine.ts（仅替换查询构建部分）
4. 不实现缓存/预聚合（→ 后续）
5. 不修改 metrics.ts 中的 computeActivity 等纯计算函数（保持不变）
6. 不修改 ItemDataPanel.tsx 的客户端 7d/14d 对比

### P4 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/stats/metric-definitions.ts` | 9 个 MetricDefinition |
| 新建 | `src/lib/stats/record-filters.ts` | buildStatsQuery 筛选器 |
| 新建 | `src/lib/stats/date-policy.ts` | 统一日期过滤策略 |
| 新建 | `src/lib/stats/metric-explain.ts` | explainMetric / getMetricFilterSummary |
| 修改 | `src/lib/db/insights.ts` | 5 个查询函数改用 buildStatsQuery |
| 修改 | `src/lib/db/goal-engine.ts` | 3 个查询函数改用 buildStatsQuery |
| 修改 | `src/app/api/v2/items/[id]/route.ts` | 2 个聚合函数改用 buildStatsQuery |

---

## P5：多步操作事务化 — 防止部分失败导致数据不一致

### 目标

解决 deleteItem/deleteSubItem/deletePhase/promoteSubItem 等多步操作的"部分失败"问题：
1. 关键多步操作使用数据库级事务（Supabase RPC）
2. 保证原子性：要么全部成功，要么全部回滚

### 当前多步操作现状（已验证）

| 操作 | 文件 | 步骤数 | 影响表数 | 部分失败风险 |
|------|------|--------|---------|------------|
| deleteItem | items.ts:99-156 | 5 | 5 (records, goals, phases, sub_items, items) | **CRITICAL** |
| deleteSubItem | sub-items.ts:116-154 | 3 | 3 (records, goals, sub_items) | HIGH |
| deletePhase | phases.ts:175-210 | 3 | 3 (records, goals, phases) | HIGH |
| promoteSubItemToItem | sub-items.ts:168-225 | 4+ | 3 (items, records, goals) | HIGH |
| batchDeleteRecords | batch-delete/route.ts | 3 | 3 (record_links, record_tags, records) | MEDIUM |

**关键发现**：
- 当前无任何事务支持（0 个 .rpc() 调用，0 个 BEGIN/COMMIT/ROLLBACK）
- Supabase 客户端使用标准 createServerClient/createBrowserClient，无事务配置
- 所有 FK 为 nullable（不级联删除），需手动置 null

### P5-1 事务方案选择

**选择方案：Supabase RPC（PL/pgSQL 存储过程）**

理由：
- Supabase 客户端 JS SDK 不直接支持 BEGIN/COMMIT
- RPC 函数内部可用 PL/pgSQL 的 BEGIN...EXCEPTION...ROLLBACK
- 一次网络往返完成所有操作，性能更优
- 已有 record_links 的 CASCADE 删除先例

**替代方案排除**：
- 客户端补偿事务：需手动实现 undo 逻辑，复杂且不可靠
- 乐观锁 + 重试：不解决原子性问题

### P5-2 RPC 函数设计

**新建**：`sql/rpc/` 目录下（不在 sql 迁移目录中，手动部署）

#### rpc_delete_item

```sql
CREATE OR REPLACE FUNCTION rpc_delete_item(
  p_user_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_item_count INT;
  v_record_count INT;
  v_goal_count INT;
  v_phase_count INT;
BEGIN
  -- Step 1: 验证 item 归属
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  END IF;

  -- Step 2: 置空关联记录的 item_id/phase_id/sub_item_id
  UPDATE records SET item_id = NULL, phase_id = NULL, sub_item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 3: 置空关联目标的 item_id/sub_item_id
  UPDATE goals SET item_id = NULL, sub_item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 4: 置空关联阶段的 item_id
  UPDATE phases SET item_id = NULL
    WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 5: 物理删除子事项（record_links CASCADE）
  DELETE FROM sub_items WHERE item_id = p_item_id AND user_id = p_user_id;

  -- Step 6: 软删除事项
  UPDATE items SET status = '已搁置' WHERE id = p_item_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
```

#### rpc_delete_sub_item

```sql
CREATE OR REPLACE FUNCTION rpc_delete_sub_item(
  p_user_id UUID,
  p_sub_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SUB_ITEM_NOT_FOUND');
  END IF;

  UPDATE records SET sub_item_id = NULL WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;
  UPDATE goals SET sub_item_id = NULL WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;
  DELETE FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
```

#### rpc_delete_phase

```sql
CREATE OR REPLACE FUNCTION rpc_delete_phase(
  p_user_id UUID,
  p_phase_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM phases WHERE id = p_phase_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PHASE_NOT_FOUND');
  END IF;

  UPDATE records SET phase_id = NULL WHERE phase_id = p_phase_id AND user_id = p_user_id;
  UPDATE goals SET phase_id = NULL WHERE phase_id = p_phase_id AND user_id = p_user_id;
  DELETE FROM phases WHERE id = p_phase_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
```

#### rpc_promote_sub_item

```sql
CREATE OR REPLACE FUNCTION rpc_promote_sub_item(
  p_user_id UUID,
  p_sub_item_id UUID,
  p_new_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_item RECORD;
  v_new_item_id UUID;
BEGIN
  SELECT * INTO v_sub_item FROM sub_items WHERE id = p_sub_item_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SUB_ITEM_NOT_FOUND');
  END IF;

  -- 创建新 item
  INSERT INTO items (user_id, title, status, description)
  VALUES (p_user_id, COALESCE(p_new_title, v_sub_item.title), '活跃', v_sub_item.description)
  RETURNING id INTO v_new_item_id;

  -- 迁移 records
  UPDATE records SET item_id = v_new_item_id, sub_item_id = NULL
    WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;

  -- 迁移 goals
  UPDATE goals SET item_id = v_new_item_id, sub_item_id = NULL
    WHERE sub_item_id = p_sub_item_id AND user_id = p_user_id;

  -- 迁移 phases（如果有）
  UPDATE phases SET item_id = v_new_item_id
    WHERE item_id IN (SELECT item_id FROM sub_items WHERE id = p_sub_item_id)
    AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'new_item_id', v_new_item_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
```

### P5-3 新建事务服务层

**新建**: `src/lib/domain/transaction-service.ts`

```ts
interface TransactionResult {
  ok: boolean
  data?: Record<string, any>
  error?: string
}

async function callRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  functionName: string,
  params: Record<string, any>
): Promise<TransactionResult> {
  const { data, error } = await supabase.rpc(functionName, params)
  if (error) {
    return { ok: false, error: error.message }
  }
  return data as TransactionResult
}
```

### P5-4 修改现有删除/迁移函数

**修改**: `src/lib/db/items.ts` — deleteItem 改用 RPC

```ts
// 改动后：
export async function deleteItem(userId: string, id: string, supabase?: ...) {
  if (supabase && isRpcAvailable('rpc_delete_item')) {
    const result = await callRpc(supabase, 'rpc_delete_item', { p_user_id: userId, p_item_id: id })
    if (!result.ok) throw new Error(result.error)
    return
  }
  // fallback：仅当 feature flag 允许且 RPC 未部署时使用原有逻辑
  // 必须在响应或日志中明确标记：使用了非事务逻辑
  if (!isRpcAvailable('rpc_delete_item')) {
    console.warn('[TX] rpc_delete_item 未部署，使用非事务 fallback')
    // ... 原有 5 步逻辑 ...
    return
  }
  throw new Error('事务化删除不可用，请部署 RPC 或启用 fallback')
}
```

**同模式修改**：
- `src/lib/db/sub-items.ts` — deleteSubItem 改用 rpc_delete_sub_item
- `src/lib/db/sub-items.ts` — promoteSubItemToItem 改用 rpc_promote_sub_item
- `src/lib/db/phases.ts` — deletePhase 改用 rpc_delete_phase

**关键约束**：
- RPC 未部署时，不得在生产环境**静默** fallback 到旧的非事务逻辑
- 如需 fallback，必须由 feature flag 控制（如 `ENABLE_UNSAFE_DELETE_WITHOUT_TX=true`）
- fallback 时必须在响应或日志中明确标记
- P5 出问题时，禁止执行高风险删除/迁移操作

### P5-5 batch-delete 事务化

batch-delete 操作跨表删除（record_links → record_tags → records），由于已有 CASCADE 删除策略（record_links 在 records 删除时自动清理），可以简化为：

1. DELETE FROM record_tags WHERE record_id IN (ids) AND user_id = userId
2. DELETE FROM records WHERE id IN (ids) AND user_id = userId（CASCADE 自动清理 record_links）

如果 Step 1 失败，Step 2 的 CASCADE 会清理 record_links 但 record_tags 残留。风险较低，可不使用 RPC，保持当前两步操作。

### P5-6 RPC 部署策略

**P5 涉及新增 sql/rpc 文件和 Supabase RPC 手动部署，必须单独确认后执行。**

在用户未明确允许前：
- 不得新增 sql/rpc 文件
- 不得修改 sql 迁移目录
- 不得部署 RPC
- P5 仅作为设计方案保留

部署方式（仅当用户确认后）：
1. 将 RPC 函数 SQL 文件放在 `sql/rpc/` 目录下（新建目录，不影响迁移顺序）
2. 手动在 Supabase Dashboard 的 SQL Editor 中执行
3. 代码中使用 feature flag 检测 RPC 是否可用

```ts
// RPC 可用性检测（启动时检测一次，缓存结果）
const rpcAvailability: Record<string, boolean> = {}

export async function detectRpcAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  for (const fn of ['rpc_delete_item', 'rpc_delete_sub_item', 'rpc_delete_phase', 'rpc_promote_sub_item']) {
    try {
      await supabase.rpc(fn, { p_user_id: '00000000-0000-0000-0000-000000000000' })
      rpcAvailability[fn] = true
    } catch {
      rpcAvailability[fn] = false
    }
  }
}

export function isRpcAvailable(fn: string): boolean {
  return rpcAvailability[fn] === true
}
```

### P5 不做什么

1. 不修改 sql 迁移目录（RPC 放在 sql/rpc/ 下手动部署）
2. 不修改前端代码
3. 不为 batchCreateRecords 添加事务（部分成功可接受，且有逐条错误报告）
4. 不新增数据库字段或约束
5. 不修改 record_links 的 CASCADE 策略

### P5 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `sql/rpc/rpc_delete_item.sql` | deleteItem 事务化 RPC |
| 新建 | `sql/rpc/rpc_delete_sub_item.sql` | deleteSubItem 事务化 RPC |
| 新建 | `sql/rpc/rpc_delete_phase.sql` | deletePhase 事务化 RPC |
| 新建 | `sql/rpc/rpc_promote_sub_item.sql` | promoteSubItem 事务化 RPC |
| 新建 | `src/lib/domain/transaction-service.ts` | callRpc 封装 |
| 修改 | `src/lib/db/items.ts` | deleteItem 改用 RPC（带 fallback） |
| 修改 | `src/lib/db/sub-items.ts` | deleteSubItem / promoteSubItem 改用 RPC |
| 修改 | `src/lib/db/phases.ts` | deletePhase 改用 RPC |

---

## 完整验收标准

### Problem 1 验收（修 bug 不再引发新 bug）

| # | 验收项 | 对应阶段 |
|---|--------|---------|
| 1 | `npm run build` 通过 | P1 |
| 2 | `npm run lint` 通过 | P1 |
| 3 | 普通记录创建成功，行为不变 | P1 |
| 4 | 普通记录更新成功，行为不变 | P1 |
| 5 | 非法 sub_item_id / item_id 组合 → 400 + 结构化 errors | P1 |
| 6 | 非法 phase_id / item_id 组合 → 400 + 结构化 errors | P1 |
| 7 | inferred 记录无来源 → warning → P3 后升级为 blocking | P1/P3 |
| 8 | 已搁置事项的记录 → warning（不阻止写入） | P1 |
| 9 | cancelled 记录 → 标记 stats_exclusion（不阻止写入） | P1 |
| 10 | `GET /api/v2/diagnostics/integrity` 返回 IntegrityReport（含 truncated/limit 字段） | P1 |
| 11 | P1 明确声明：异步 AI 回写（enhanceRecord）绕过规则中心，P1 仅保证用户直接写入路径合法 | P1 |
| 12 | 前端现有功能不受影响 | P1 |
| 13 | complete 操作生成发生记录 + record_link + 更新 lifecycle_status | P2 |
| 14 | postpone 操作生成计划记录 + record_link + 更新 lifecycle_status | P2 |
| 15 | cancel 操作仅更新 lifecycle_status='cancelled'，不创建新记录 | P2 |
| 16 | 对已完成/推迟/取消的记录执行生命周期操作 → 400 | P2 |
| 17 | 批量导入返回 BatchDomainResult，含逐条 success/failed | P2 |
| 18 | 链接记录校验所有权和自关联 | P2 |
| 19 | AI 增强写入自动设置 review_status='unchecked' | P3 |
| 20 | AI 增强写入自动设置 data_nature='inferred' | P3 |
| 21 | AI 不可覆写 content 字段 | P3 |
| 22 | AI 不可覆写 review_status='confirmed' 的字段 | P3 |
| 23 | AiWriteResult 返回 changedFields/skippedFields | P3 |
| 24 | deleteItem 原子化：要么全部成功要么全部回滚 | P5 |
| 25 | promoteSubItemToItem 原子化 | P5 |
| 26 | RPC 未部署时 fallback 到原有逻辑 | P5 |

### Problem 3 验收（统计数字可信）

| # | 验收项 | 对应阶段 |
|---|--------|---------|
| 27 | 洞察页热力图排除 inferred/cancelled/period_rule 记录 | P4 |
| 28 | 洞察页时间分布排除 inferred/cancelled/period_rule 记录 | P4 |
| 29 | 事项页聚合排除 inferred/cancelled/period_rule 记录 | P4 |
| 30 | 目标页进度排除 inferred/cancelled/period_rule 记录 | P4 |
| 31 | 同一事项在洞察页和事项页的记录数一致 | P4 |
| 32 | explainMetric() 返回人类可读的筛选规则说明 | P4 |
| 33 | 所有统计查询使用 MetricDefinition 定义的统一口径 | P4 |
| 34 | 统一口径下的数字与手动 SQL 查询验证一致 | P4 |

---

## P1-P5 依赖关系

```
P1 (最小可用版)
 ├── P2 (全写路径集成) — 依赖 P1 的 domain-errors/record-invariants/relation-invariants
 │    └── P3 (AI 写边界) — 依赖 P2 的 record-service 框架
 │         └── P4 (统计口径层) — 依赖 P2/P3 的 stats_exclusion 标记真正生效
 └── P5 (多步操作事务) — 可与 P2-P4 并行，但建议 P2 之后实施
```

**推荐实施顺序**：P1 → P2 → P3 → P5 → P4

- P3 在 P2 之后：因为 P3 需要修改 enhance-record.ts，而 P2 的 record-service 框架是 P3 的 record-ai-service 的基础
- P5 可在 P3 之后并行：RPC 函数与业务逻辑相对独立
- P4 在最后：统计口径层需要等数据质量改善后效果才明显（P2/P3 减少了新脏数据产生）

---

## 全量文件清单汇总

### 新建文件（18 个）

| 阶段 | 文件 | 说明 |
|------|------|------|
| P1 | `src/lib/domain/domain-errors.ts` | InvariantIssue / DomainResult |
| P1 | `src/lib/domain/record-invariants.ts` | 12 条记录规则 |
| P1 | `src/lib/domain/relation-invariants.ts` | 6 条关系规则 |
| P1 | `src/lib/domain/record-service.ts` | createRecordSafely / updateRecordSafely |
| P1 | `src/lib/diagnostics/data-integrity-check.ts` | runDataIntegrityCheck |
| P1 | `src/app/api/v2/diagnostics/integrity/route.ts` | GET 端点 |
| P2 | `src/lib/domain/record-lifecycle-invariants.ts` | 5 条生命周期规则 |
| P3 | `src/lib/domain/ai-write-policy.ts` | AI 字段策略定义 |
| P3 | `src/lib/domain/field-ownership-policy.ts` | 字段所有权校验 |
| P3 | `src/lib/domain/record-ai-service.ts` | applyAiEnhancementSafely |
| P4 | `src/lib/stats/metric-definitions.ts` | 9 个 MetricDefinition |
| P4 | `src/lib/stats/record-filters.ts` | buildStatsQuery |
| P4 | `src/lib/stats/date-policy.ts` | 统一日期策略 |
| P4 | `src/lib/stats/metric-explain.ts` | explainMetric |
| P5 | `sql/rpc/rpc_delete_item.sql` | deleteItem RPC |
| P5 | `sql/rpc/rpc_delete_sub_item.sql` | deleteSubItem RPC |
| P5 | `sql/rpc/rpc_delete_phase.sql` | deletePhase RPC |
| P5 | `sql/rpc/rpc_promote_sub_item.sql` | promoteSubItem RPC |
| P5 | `src/lib/domain/transaction-service.ts` | callRpc 封装 |

### 修改文件（14 个）

| 阶段 | 文件 | 说明 |
|------|------|------|
| P1 | `src/app/api/v2/records/route.ts` | POST 改用 createRecordSafely |
| P1 | `src/app/api/v2/records/[id]/route.ts` | PUT 改用 updateRecordSafely |
| P2 | `src/lib/domain/domain-errors.ts` | 追加 BatchItemResult / BatchDomainResult |
| P2 | `src/lib/domain/record-service.ts` | 追加 6 个 Safely 函数 |
| P2 | `src/lib/diagnostics/data-integrity-check.ts` | 追加 2 项检查 |
| P2 | `src/app/api/v2/records/[id]/complete/route.ts` | 接入 completeRecordSafely |
| P2 | `src/app/api/v2/records/[id]/postpone/route.ts` | 接入 postponeRecordSafely |
| P2 | `src/app/api/v2/records/[id]/cancel/route.ts` | 接入 cancelRecordSafely |
| P2 | `src/app/api/v2/records/batch/route.ts` | 接入 batchCreateRecordsSafely |
| P2 | `src/app/api/v2/records/batch-delete/route.ts` | 接入 batchDeleteRecordsSafely |
| P2 | `src/app/api/v2/records/link/route.ts` | 接入 linkRecordsSafely |
| P3 | `src/lib/ai/enhance-record.ts` | 用 applyAiEnhancementSafely 替换直接写入 |
| P3 | `src/lib/domain/record-invariants.ts` | 规则 3 升级为 blocking |
| P4 | `src/lib/db/insights.ts` | 5 个查询函数改用 buildStatsQuery |
| P4 | `src/lib/db/goal-engine.ts` | 3 个查询函数改用 buildStatsQuery |
| P4 | `src/app/api/v2/items/[id]/route.ts` | 2 个聚合函数改用 buildStatsQuery |
| P5 | `src/lib/db/items.ts` | deleteItem 改用 RPC |
| P5 | `src/lib/db/sub-items.ts` | deleteSubItem / promoteSubItem 改用 RPC |
| P5 | `src/lib/db/phases.ts` | deletePhase 改用 RPC |

---

## 回滚策略

每个阶段必须具备最小回滚方式：

| 阶段 | 出问题时 | 回滚方式 |
|------|---------|---------|
| P1 | POST/PUT records 行为异常 | 切回旧 createRecord/updateRecord，移除 Safely 调用 |
| P2 | 生命周期/batch 路由异常 | 切回旧路由逻辑，移除 Safely 调用 |
| P3 | AI 回写行为异常 | 暂停 AI 回写或切回只读增强（enhance-record.ts 原始逻辑） |
| P4 | 统计数字异常 | 切回旧查询逻辑，移除 buildStatsQuery 调用 |
| P5 | 删除/迁移操作异常 | 禁止执行高风险删除/迁移操作，等待 RPC 部署或修复 |

**回滚原则**：
- 每个阶段的代码改动应保持可逆：新文件可直接删除，修改的 route 文件应保留旧逻辑的注释
- 不依赖数据库迁移回滚（P1-P4 不修改数据库）
- P5 的 RPC 函数可通过 `DROP FUNCTION` 回滚

## 用户体验原则

规则中心和计算中心是系统内部机制，不暴露复杂配置给普通用户。

**用户侧只应该看到**：
- 保存失败的人话原因（如"该子事项不属于此事项"）
- 可忽略或可确认的 warning（如"此事项已搁置，记录仍已保存"）
- AI 未确认标识（review_status='unchecked' 的视觉标记）
- 统计数字解释（hover 或 tooltip 显示"已排除 X 条未确认记录"）
- 被排除记录的原因（diagnostics 报告中的中文说明）

**不得**：
- 新增复杂规则配置页面
- 要求用户手动维护统计公式
- 暴露 InvariantIssue / MetricDefinition 等内部类型给前端
- 在 API 响应中返回用户无法理解的 code（如 `RECORD_SUB_ITEM_REQUIRES_ITEM`）

---

## 验证方式

1. 每个 P 阶段完成后：`npm run build` + `npm run lint` 通过
2. P1：手动测试 POST/PUT records，验证正常场景和异常场景
3. P2：手动测试 complete/postpone/cancel/batch/batch-delete/link
4. P3：创建记录后观察 AI 增强是否设置 review_status/data_nature
5. P4：对比洞察页、事项页、目标页的统计数字是否一致
6. P5：模拟 deleteItem 部分失败场景，验证回滚
7. 全程：`GET /api/v2/diagnostics/integrity` 监控数据质量改善趋势
