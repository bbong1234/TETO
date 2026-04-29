# TETO 1.4 事项模块重构实施计划（含子项功能）

> 更新日期：2026-04-26
> 基于代码实际状态修正，与《新TETO 1.4 事项模块功能方案》对齐

## 现状总览

| 实体 | 当前状态 | 差距 |
|------|---------|------|
| items | 6种状态，有icon/color/is_pinned/folder_id，同名归档检查+重启流程已实现 ✅ | 基本完整 |
| goals | 有item_id/phase_id/sub_item_id/measure_type/量化引擎字段/重复型字段 ✅ | 需补重复型引擎前端展示、目标变更规则后端强制 |
| phases | 有item_id，支持从记录生成 ✅ | 目标达成时引导创建新阶段已实现，需补阶段数据看板 |
| sub_items | 表+CRUD+promote已实现 ✅ | 需补子项数据看板、升格确认对话框完善 |
| records | 有item_id/phase_id/sub_item_id ✅ | 基本满足 |
| 前端 | SubItemTabBar+SubItemForm+子项筛选联动+GoalForm三种类型+目标达成引导 已实现 ✅ | 需补 RepeatGoalCard、子项数据看板、升格对话框 |

---

## Task 1: 数据库迁移 — 子项+重复型目标

> 状态：**已完成** ✅

---

## Task 2: TypeScript 类型定义 — 子项+重复型目标

> 状态：**已完成** ✅

---

## Task 3: 后端 DB 层 + API 路由 — 子项 CRUD

> 状态：**已完成** ✅

---

## Task 4: 前端基础 — SubItemTabBar + SubItemForm

> 状态：**已完成** ✅

---

## Task 5: 子项 Tab 数据联动

> 状态：**已完成** ✅
>
> 验证：
> - relatedRecords 按 activeSubItemId 过滤 ✅（page.tsx L286-290）
> - filteredGoals 按 activeSubItemId 过滤 ✅（page.tsx L302-307）
> - GoalEngineDashboard 按 activeSubItemId 过滤 ✅（L16-18）
> - ItemGoalSection 接收 activeSubItemId ✅（L498-506）

---

## Task 6: GoalForm 子项归属 + 重复型目标

> 状态：**已完成** ✅
>
> 验证：
> - GoalForm 已有 3 种度量类型选择（boolean/numeric/repeat）✅
> - 量化型/重复型必须选子项 ✅（L98-101 校验）
> - 达标型子项可选 ✅
> - 重复型频率+次数配置 ✅（L380-411）
> - preselectedSubItemId 自动绑定 ✅（L43, L80, L718）
> - onGoalAchievedCreatePhase 回调 ✅（L477-489）
> - sub_item_id 写入 payload ✅（L115, L143）

---

## Task 7: 重复型目标引擎前端展示

> 状态：**待实现** 🔴
>
> 后端 `computeRepeatGoalEngine()` 已实现，但前端无展示组件

### 7.1 事项级重复目标引擎 API

**问题**：当前 `GET /api/v2/items/{id}/goal-engine` 仅返回 `GoalEngineResult[]`（量化型），
不包含重复型目标的引擎结果。

**修改**：`src/app/api/v2/items/[id]/goal-engine/route.ts`
- 增加查询事项下所有 repeat 类型目标
- 为每个重复型目标调用 `computeRepeatGoalEngine()`
- 返回结构增加 `repeatGoals: RepeatGoalEngineResult[]`

**修改**：`src/lib/hooks/useGoalEngine.ts`
- 返回类型增加 repeatGoals

### 7.2 RepeatGoalCard 组件

**新建**：`items/components/RepeatGoalCard.tsx`

展示内容（基于 RepeatGoalEngineResult）：
- 目标标题
- 当前周期进度条（actual / count）
- 周期起止日期
- 近7天/30天完成次数
- 进度颜色（达标绿/不足黄/欠债红）

### 7.3 GoalEngineDashboard 集成 RepeatGoalCard

**修改**：`items/components/GoalEngineDashboard.tsx`
- 增加 repeatGoals prop
- 在 EngineCard 列表后展示 RepeatGoalCard
- 按 activeSubItemId 过滤重复型目标

---

## Task 8: 目标变更规则（防数据回溯）

> 状态：**部分完成** 🟡
>
> 已完成：目标达成时引导创建新阶段 ✅（GoalForm L477-489）
> 待实现：后端强制已达成目标不可修改

### 8.1 后端强制：已达成目标不可修改

**规则**：目标一旦标记为「已达成」，其数据永久定格，不可修改

**修改**：`src/lib/db/goals.ts` updateGoal 函数
- 查询当前目标状态，如果为「已达成」则拒绝更新
- 返回错误：`该目标已达成，数据不可修改`

**修改**：`src/app/api/v2/goals/[id]/route.ts` PUT handler
- 处理更新被拒的情况，返回 403

### 8.2 量化型目标升级快捷操作（可选）

> 优先级低，当前手动流程可用

用户手动将旧目标标为「已达成」→ 创建新阶段 → 创建新目标。
UI 可提供快捷入口，但非必须。

---

## Task 9: 事项生命周期

> 状态：**已完成** ✅
>
> 验证：
> - 9.1 创建时同名归档检查 ✅（items.ts L16-28, ItemsClient L239-260 409处理）
> - 9.2 归档事项重启流程 ✅（ItemsClient handleRestartItem L280-304）
> - 9.3 删除保护 ✅（records.item_id FK ON DELETE SET NULL）
> - 9.4 完成事项保留数据 ✅（现有逻辑）

---

## Task 10: 子项升格确认对话框完善

> 状态：**待实现** 🔴
>
> 当前：SubItemTabBar 的 onPromote 只有一个简单 confirm（page.tsx L466）
>
> 根据功能方案：
> - 用户手动触发「升格为独立事项」
> - 系统基于子项信息创建新事项（标题、描述继承）
> - 历史记录默认迁移到新事项（用户可选不迁移）
> - 原子项保留在原事项下

### 10.1 SubItemPromoteDialog 组件

**新建**：`items/components/SubItemPromoteDialog.tsx`

内容：
- 标题：将子项「{名称}」升格为独立事项
- 预览：新事项名称 = 子项名称
- 选项：「迁移历史记录到新事项」（复选框，默认勾选）
- 提示：原子项将保留在原事项下（它是原事项历史的一部分，不能被删除）
- 按钮：「确认升格」/「取消」

### 10.2 替换 confirm 逻辑

**修改**：`items/[id]/page.tsx`
- 将 L466 的简单 confirm 替换为 SubItemPromoteDialog
- 传递 `migrateRecords` 参数给 promote API

### 10.3 后端 promote API 支持记录迁移选项

**修改**：`src/lib/db/sub-items.ts` promoteSubItemToItem
- 增加 `migrateRecords` 参数（默认 true）
- 为 false 时不迁移记录

---

## Task 11: 子项数据看板

> 状态：**待实现** 🔴
>
> 根据功能方案，切换子项 Tab 时，数据总览区域应展示该子项的聚合数据

### 11.1 前端子项级聚合计算

**方案**：基于已有的 records 数据，在前端按 sub_item_id 聚合计算

**修改**：`items/[id]/page.tsx`
- 当 activeSubItemId 非空时，基于 relatedRecords 重新计算聚合数据
- 聚合内容：记录数、总时长、总成本、指标汇总
- 传递给 ItemDataPanel

### 11.2 ItemDataPanel 支持子项模式

**修改**：`items/components/ItemDataPanel.tsx`
- 接收可选的 subItemTitle prop
- 当处于子项模式时，标题显示「{子项名称} 数据」
- 数据来源于过滤后的 records

---

## Task 12: 阶段数据看板

> 状态：**待实现** 🔴
>
> 根据功能方案第七节：「阶段数据看板（该时期内的记录数、指标合计）」
> 当前阶段区域只显示标题、时间范围、描述，无聚合数据

### 12.1 阶段级聚合展示

**方案**：阶段已有 `aggregation` 字段（PhaseAggregation），需在前端展示

**修改**：`items/[id]/page.tsx` 阶段区域
- 当前阶段卡片增加聚合数据条（记录数、时长、指标汇总）
- 历史阶段列表项增加简要数据

**修改**：`src/app/api/v2/items/[id]/route.ts`（或 phases 查询）
- 确保返回阶段时附带 aggregation 数据

---

## 验证标准

### 数据库
- [x] 迁移脚本可重复执行（IF NOT EXISTS）
- [x] 现有数据零丢失，新字段全部 nullable 或有默认值
- [x] RLS 策略覆盖 sub_items 表
- [ ] 014 迁移已在生产环境执行

### API
- [x] `GET /api/v2/sub-items?item_id=xxx` 正确返回子项列表
- [x] `POST /api/v2/sub-items` 创建子项
- [x] `PUT /api/v2/sub-items/[id]` 更新子项
- [x] `DELETE /api/v2/sub-items/[id]` 删除子项
- [x] `POST /api/v2/sub-items/[id]/promote` 升格子项
- [x] `GET /api/v2/records?sub_item_id=xxx` 按子项筛选记录
- [x] `GET /api/v2/goals?sub_item_id=xxx` 按子项筛选目标
- [x] GoalForm 提交包含 sub_item_id
- [x] 目标达成时引导创建新阶段
- [ ] 重复型目标引擎 API（事项级批量）
- [ ] 后端强制已达成目标不可修改

### 前端
- [x] SubItemTabBar 显示和切换
- [x] SubItemForm 创建/编辑子项
- [x] 子项升格基础流程
- [x] 子项 Tab 切换后，记录列表、目标列表、数据看板联动筛选
- [x] GoalForm 支持子项归属选择
- [x] GoalForm 支持重复型目标
- [x] 目标达成时引导创建新阶段
- [x] 创建事项时检查同名归档
- [x] 归档事项重启流程
- [ ] RepeatGoalCard 重复型目标引擎展示
- [ ] 子项升格确认对话框完善
- [ ] 子项数据看板
- [ ] 阶段数据看板

### 业务规则
- [x] 量化型/重复型目标必须挂在子项下
- [x] 达标型目标可灵活选择事项级或子项级
- [ ] 目标一旦标记「已达成」，数据不可修改
- [x] 子项升格后原子项保留在原事项下
- [x] 事项删除时记录不被级联删除

---

## 执行顺序

1. **Task 1-6** (已完成) ✅
2. **Task 7** (重复型目标引擎前端展示) ✅ 已完成
3. **Task 8** (目标变更规则 - 后端强制已达成不可修改) ✅ 已完成
4. **Task 9** (事项生命周期) ✅ 已完成
5. **Task 10** (子项升格确认对话框) ✅ 已完成
6. **Task 11** (子项数据看板) ✅ 已完成
7. **Task 12** (阶段数据看板) ✅ 已完成

所有任务已完成！ ✅
