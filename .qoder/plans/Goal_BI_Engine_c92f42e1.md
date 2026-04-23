# TETO 1.4 量化目标引擎 (Goal BI Engine)

## 现状分析

**已具备的基础设施：**
- `records` 表已有 `metric_value`, `metric_unit`, `metric_name`, `item_id` 字段
- `goals` 表已有 `item_id`, `phase_id`, `measure_type`(boolean/numeric), `target_value`(总目标量), `current_value`
- 完整的 CRUD 层：`src/lib/db/goals.ts`, `src/lib/db/records.ts`
- API 路由：`/api/v2/goals/`, `/api/v2/records/`

**需要新增：**
- goals 表缺少 benchmark 配速字段（`unit`, `daily_target`, `start_date`, `deadline_date`）
- 无聚合计算引擎
- 无前端展示面板

---

## Task 1: 数据库 Schema 扩展

**文件：`sql/010_goal_benchmark_fields.sql`（新建）**

在 `goals` 表新增 4 个 benchmark 字段：

```sql
-- unit: 计量单位（个/分/次/页/公里...）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS unit TEXT NULL;

-- daily_target: 日均期望值（如 110）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS daily_target NUMERIC(12,2) NULL;

-- start_date: 起算日（如 2024-12-23）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE NULL;

-- deadline_date: 截止日（可选，如 2026-12-31）
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline_date DATE NULL;
```

设计理由：
- `target_value` 已存在，复用为"总目标量"（如 40150）
- `unit` 独立于 record 的 `metric_unit`，属于 Goal 层面的标尺定义
- 所有字段 nullable，向后兼容非量化目标（measure_type=boolean 的目标不需要这些字段）

---

## Task 2: TypeScript 类型扩展

**文件：`src/types/teto.ts`**

2a. 在 `Goal` 接口新增字段：
```typescript
export interface Goal {
  // ... 现有字段
  unit: string | null;           // 新增
  daily_target: number | null;   // 新增
  start_date: string | null;     // 新增
  deadline_date: string | null;  // 新增
}
```

2b. 新增 `GoalEngineResult` 类型（引擎输出）：
```typescript
export interface GoalEngineResult {
  goal_id: string;
  goal_title: string;
  unit: string;
  daily_target: number;
  start_date: string;

  // 时间维度
  total_passed_days: number;       // 从 start_date 到今天的天数
  remaining_days: number | null;   // 到 deadline_date 的剩余天数（无 deadline 则 null）

  // 今日
  today_actual: number;            // 今日 metric_value 合计

  // 累计
  total_expected: number;          // total_passed_days * daily_target
  total_actual: number;            // 历史全部 metric_value 求和
  deficit: number;                 // total_actual - total_expected（负数=欠债）

  // 比率
  completion_rate: number;         // total_actual / total_expected（如 0.5076）

  // 均值
  daily_average: number;           // total_actual / total_passed_days
  avg_7d: number;                  // 近7天日均
  avg_30d: number;                 // 近30天日均

  // 配速器（仅当 target_value + deadline_date 存在时有值）
  total_target: number | null;
  dynamic_daily_pacer: number | null;  // (total_target - total_actual) / remaining_days

  // 周/月投射
  weekly_target: number;           // daily_target * 7
  monthly_target: number;          // daily_target * 30
  weekly_projection: number;       // daily_average * 7
  monthly_projection: number;      // daily_average * 30
}
```

2c. 在 `CreateGoalPayload` / `UpdateGoalPayload` 中加入对应可选字段。

---

## Task 3: 目标 CRUD 层适配

**文件：`src/lib/db/goals.ts`**

在 `createGoal` 和 `updateGoal` 函数中加入 `unit`, `daily_target`, `start_date`, `deadline_date` 字段的读写支持。改动很小，仅在 insert/update 对象中添加字段映射。

---

## Task 4: 服务端聚合引擎

**文件：`src/lib/db/goal-engine.ts`（新建）**

核心函数 `computeGoalEngine(userId, goalId)`：

1. 查询 Goal 配置（含 benchmark 字段）
2. 验证 measure_type=numeric 且 daily_target/start_date 存在
3. 查询该 Goal 关联的 item_id 下所有 records 的 metric_value（按 item_id 聚合，而非 goal_id，因为用户日常记录挂 item 不挂 goal）
4. 计算并返回 `GoalEngineResult`

关键查询逻辑：
```
records WHERE item_id = goal.item_id AND metric_value IS NOT NULL
```
- 今日数据：额外按 record_day.date = today 过滤
- 近7天/近30天：按日期窗口过滤后求均值
- 总计：全部求和

批量版本 `computeGoalEngineForItem(userId, itemId)` 返回该事项下所有 numeric Goal 的引擎结果数组。

---

## Task 5: API 端点

**文件：`src/app/api/v2/goals/[id]/engine/route.ts`（新建）**

```
GET /api/v2/goals/{goalId}/engine
```
返回单个 Goal 的 `GoalEngineResult`。

**文件：`src/app/api/v2/items/[id]/goal-engine/route.ts`（新建）**

```
GET /api/v2/items/{itemId}/goal-engine
```
返回该事项下所有量化目标的引擎结果数组。（这是 MVP UI 实际调用的端点）

---

## Task 6: 客户端 Hook

**文件：`src/lib/hooks/useGoalEngine.ts`（新建）**

```typescript
function useGoalEngine(itemId: string) {
  // fetch /api/v2/items/{itemId}/goal-engine
  // 返回 { data: GoalEngineResult[], loading, error, refetch }
}
```

纯数据获取 Hook，不涉及 UI 逻辑。

---

## Task 7: MVP 数据面板 UI

**文件：`src/app/(dashboard)/items/components/GoalEngineDashboard.tsx`（新建）**

在事项详情页（`items/[id]/page.tsx`）中嵌入，展示方式参照用户 Excel 仪表盘：

| 字段 | 展示 |
|---|---|
| 坚持天数 | total_passed_days 天 |
| 今日进度 | today_actual / daily_target |
| 每日平均 | daily_average |
| 近7日均 / 近30日均 | avg_7d / avg_30d |
| 总完成率 | completion_rate (%) |
| 合计应当 | total_expected |
| 完成总值 | total_actual |
| **合计差值** | **deficit（负数红色高亮）** |
| 动态配速 | dynamic_daily_pacer（如有） |
| 剩余天数 | remaining_days |

UI 要求：
- Grid 布局，紧凑排列
- deficit < 0 时，数字用红色 `text-red-500` + 粗体
- completion_rate < 50% 红色，50-80% 黄色，>80% 绿色
- 不涉及图表，纯数字面板
- 每个量化目标独立一个面板卡片

**文件：`src/app/(dashboard)/items/[id]/page.tsx`**

在现有页面结构中合适位置（目标区域下方或右栏）插入 `<GoalEngineDashboard itemId={itemId} />`。

---

## 开发顺序

严格按 Task 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 顺序执行，每个 Task 完成后验证再进入下一个。Task 1-3 是数据基建，Task 4-5 是核心引擎，Task 6-7 是前端展示。
