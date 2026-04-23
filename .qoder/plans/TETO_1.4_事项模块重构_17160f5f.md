# TETO 1.4 事项（Topic）模块重构实施计划

## 现状分析

| 实体 | 当前状态 | 差距 |
|------|---------|------|
| items | 6种状态，有icon/color，无is_pinned | 需加 is_pinned |
| goals | 独立实体，无归属外键，无度量字段 | 需加 item_id, phase_id, measure_type, target_value, current_value |
| phases | 已完善，有item_id, goal_id | 基本满足 |
| records | 有item_id, goal_id，无phase_id | 需加 phase_id |
| 前端 | 白板+文件夹列表 | 需重构为桌面图标+微型工作台 |

---

## Task 1: 数据库迁移脚本

新建 `sql/009_teto_1_4_topic_module_upgrade.sql`，包含以下变更：

### 1.1 items 表升级
```sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_items_pinned ON items(user_id, is_pinned) WHERE is_pinned = true;
```
- 不改 status 枚举，保留6种
- 前端通过 `is_pinned=true` + 状态非(已完成/已搁置) 筛选"桌面图标"

### 1.2 goals 表升级
```sql
-- 归属外键
ALTER TABLE goals ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;
-- 度量字段
ALTER TABLE goals ADD COLUMN IF NOT EXISTS measure_type TEXT DEFAULT 'boolean' CHECK(measure_type IN ('boolean','numeric'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_value NUMERIC(12,2) NULL;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS current_value NUMERIC(12,2) NULL;
-- 索引
CREATE INDEX IF NOT EXISTS idx_goals_item ON goals(item_id);
CREATE INDEX IF NOT EXISTS idx_goals_phase ON goals(phase_id);
```
- `item_id` 允许 NULL（向后兼容已有的全局目标）
- `phase_id` 为 NULL 时 = 事项级目标；非 NULL = 阶段目标
- `measure_type`: boolean(达标/未达标) 或 numeric(量化型)
- current_value 由用户手动更新，不做自动触发器

### 1.3 records 表升级
```sql
ALTER TABLE records ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_records_phase ON records(phase_id);
```

### 1.4 安全保障
- 所有新字段均为 NULL 默认值或有合理默认
- 不删除任何旧字段/数据
- items.goal_id 保留不动（代码中标记 @deprecated）

---

## Task 2: TypeScript 类型定义更新

文件：`src/types/teto.ts`

### 2.1 Item 接口
- 新增 `is_pinned: boolean`
- CreateItemPayload/UpdateItemPayload 加 `is_pinned?: boolean`

### 2.2 Goal 接口
- 新增 `item_id: string | null`, `phase_id: string | null`
- 新增 `measure_type: 'boolean' | 'numeric'`, `target_value: number | null`, `current_value: number | null`
- CreateGoalPayload 加对应可选字段
- UpdateGoalPayload 加对应可选字段
- GoalsQuery 加 `item_id?: string`, `phase_id?: string`

### 2.3 Record 接口
- 新增 `phase_id: string | null`
- CreateRecordPayload/UpdateRecordPayload 加 `phase_id?: string | null`

### 2.4 新增辅助类型
```ts
export const GOAL_MEASURE_TYPES = ['boolean', 'numeric'] as const;
export type GoalMeasureType = typeof GOAL_MEASURE_TYPES[number];
```

---

## Task 3: 后端 DB 层适配

### 3.1 `src/lib/db/items.ts`
- createItem: 支持写入 is_pinned
- updateItem: 支持更新 is_pinned
- listItems: 支持 `is_pinned` 查询筛选

### 3.2 `src/lib/db/goals.ts`
- createGoal: 支持写入 item_id, phase_id, measure_type, target_value, current_value
- updateGoal: 支持更新上述字段
- getGoals: 支持 item_id, phase_id 查询筛选
- 新增 `getGoalsByItemId(userId, itemId)` 函数

### 3.3 `src/lib/db/records.ts`（或对应文件）
- 创建/更新记录时支持 phase_id 字段读写

---

## Task 4: API 路由层适配

### 4.1 `GET /api/v2/items`
- 新增查询参数 `is_pinned=true|false`

### 4.2 `GET /api/v2/items/[id]`
- 返回数据中新增 `goals[]` 数组（该事项下所有目标），替代原来的单个 `goal`
- 每个 phase 附带其下的阶段目标列表

### 4.3 `GET /api/v2/goals`
- 新增查询参数 `item_id`, `phase_id`

### 4.4 `POST /api/v2/goals`
- 请求体支持 item_id, phase_id, measure_type, target_value, current_value

### 4.5 记录相关 API
- 创建/更新记录时透传 phase_id

---

## Task 5: 前端重构 - 事项首屏桌面化

### 5.1 新组件：ItemDesktop（替代现有 ItemsClient）

**布局逻辑**：
- 顶部工具栏：搜索 + "新建事项" + "历史库"入口
- 主区域：网格铺开所有 `is_pinned=true` 且非归档状态的事项，每个显示为"App图标"卡片：
  - 圆角矩形图标（item.icon 或首字母）
  - 下方事项名（单行截断）
  - 右上角小徽章显示当前阶段名
- "历史库"弹窗/抽屉：展示 `已完成`/`已搁置` 状态的事项列表
- 未固定（is_pinned=false）但活跃的事项放在"更多事项"折叠区

### 5.2 保留文件夹逻辑
- 现有 ItemFolder 组件保留，作为桌面上的"分组框"
- 文件夹内的事项同样以图标形式展示

---

## Task 6: 前端重构 - 事项详情页微型工作台

文件：`src/app/(dashboard)/items/[id]/page.tsx`

### 6.1 顶部面板（Hero Section）
- 事项标题 + 状态标签 + 编辑/归档按钮
- 全局目标进度条（如有）：显示 current_value / target_value
- 当前阶段标签（status=进行中 的 phase）

### 6.2 中部看板（Dashboard Section）
- 当前阶段卡片：标题、时间范围、阶段目标进度
- 聚合统计卡片组：总成本、总时长、指标汇总（复用现有 aggregation 逻辑）
- 阶段目标列表：该阶段下的 goals，展示度量进度

### 6.3 底部记录流
- 筛选器：全部 / 当前阶段 / 按目标筛选
- 记录列表（复用现有 ItemTimeline 组件，增加 phase_id 筛选能力）

### 6.4 右侧管理面板
- 目标管理：创建/编辑目标，区分全局目标 vs 阶段目标
- 阶段管理：保留现有阶段列表 + 新建/编辑功能
- GoalForm 组件升级：新增 measure_type、target_value、current_value 输入

---

## Task 7: 目标组件升级

### 7.1 GoalCard 组件
- 显示目标标题、状态、度量进度
- boolean 型：显示"已达标/未达标"开关
- numeric 型：显示进度条 current_value / target_value
- current_value 支持手动编辑更新

### 7.2 GoalForm 组件
- 新增字段：度量类型选择、目标值输入
- 新增：归属选择（事项级 / 某个阶段）

---

## Task 8: 侧边栏版本号更新

文件：`src/components/layout/app-sidebar.tsx`
- 将 "TETO 1.3" 更新为 "TETO 1.4"

---

## 验证标准

### 数据库
- [ ] 迁移脚本可重复执行（IF NOT EXISTS）
- [ ] 现有数据零丢失，新字段全部 nullable 或有默认值
- [ ] RLS 策略覆盖新字段（goals 的 item_id/phase_id 不需要独立 RLS，已由 user_id 保护）

### API
- [ ] `GET /api/v2/items?is_pinned=true` 正确返回置顶事项
- [ ] `GET /api/v2/items/[id]` 返回包含 goals 数组、phases 带阶段目标
- [ ] `POST /api/v2/goals` 支持 item_id + phase_id + 度量字段
- [ ] 创建/更新记录支持 phase_id 透传
- [ ] 所有现有 API 调用不因新字段而报错

### 前端
- [ ] 事项首屏以桌面图标形式展示 pinned 事项
- [ ] 归档事项（已完成/已搁置）从桌面隐藏，可在历史库中查看
- [ ] 事项详情页顶部显示全局目标进度+当前阶段
- [ ] 目标支持 boolean/numeric 两种度量，current_value 可手动编辑
- [ ] 记录流可按阶段筛选
- [ ] 禁止 Topic 嵌套 Topic 的操作入口

### 技术红线
- [ ] 无自动触发器计算目标值或自动完结阶段
- [ ] 层级严格 Topic -> Phase -> Record，无子事项能力
- [ ] current_value 仅支持用户手动更新

---

## 执行顺序

1. **Task 1** (数据库迁移) -- 独立可执行
2. **Task 2** (类型定义) -- 依赖 Task 1 的设计
3. **Task 3** (DB层) -- 依赖 Task 2
4. **Task 4** (API层) -- 依赖 Task 3
5. **Task 5** (首屏桌面化) -- 依赖 Task 4
6. **Task 6** (详情页工作台) -- 依赖 Task 4
7. **Task 7** (目标组件) -- 与 Task 6 并行
8. **Task 8** (版本号) -- 最后收尾
