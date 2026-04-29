# TETO 1.4 量化目标引擎 (Goal BI Engine)

# TETO 1.4 量化目标引擎 (Goal BI Engine)

---

## 第一部分：现有功能与数据结构全景

### 1. 数据库表结构现状

​**records 表**（﻿sql/001﻿ + ﻿sql/007﻿ + ﻿sql/008﻿ + ﻿sql/009﻿）：

|字段|类型|说明|
| ----------------------------------------| ---------------| ----------------------------------|
|id, user\_id, record\_day\_id|UUID|基础标识|
|content, type|TEXT|内容 + 类型(发生/计划/想法/总结)|
|item\_id|UUID FK|关联事项（用户记录时选择）|
|phase\_id|UUID FK|关联阶段|
|goal\_id|UUID FK|关联目标（当前很少使用）|
|**metric\_value**|NUMERIC(12,2)|**数值（如 40、110）-- 引擎核心数据源**|
|**metric\_unit**|TEXT|**计量单位（个、分）**|
|**metric\_name**|TEXT|**统计对象名（单词、俯卧撑）**|
|duration\_minutes|INTEGER|时长(分钟)|
|cost|NUMERIC(12,2)|花费金额|
|batch\_id, lifecycle\_status||批次拆分 + 生命周期|

​**goals 表**（﻿sql/003﻿ + ﻿sql/009﻿）：

|字段|类型|说明|
| --------------------| ---------------| -----------------------------------|
|id, user\_id|UUID|基础标识|
|title, description|TEXT|目标名称与描述|
|status|TEXT|进行中/已达成/已放弃/已暂停|
|item\_id|UUID FK|归属事项（允许NULL\=全局目标）|
|phase\_id|UUID FK|归属阶段（NULL\=事项级目标）|
|measure\_type|TEXT|boolean(达标型) / numeric(量化型)|
|target\_value|NUMERIC(12,2)|目标值（如 40150）|
|current\_value|NUMERIC(12,2)|当前值（手动更新，​**引擎将替代此字段的手动更新**）|
|**缺少**||**unit, daily\_target, start\_date, deadline\_date**|

​**items 表**（﻿sql/001﻿ + ﻿sql/009﻿）：

|字段|类型|说明|
| -------------------------------------| ---------| -------------------------------------|
|id, user\_id, title, description||基础信息|
|status|TEXT|活跃/推进中/放缓/停滞/已完成/已搁置|
|is\_pinned|BOOLEAN|桌面置顶|
|goal\_id|UUID FK| **@deprecated**旧版关联，将移除|

​**phases 表**（﻿sql/003﻿）：

|字段|类型|说明|
| ---------------------------------------------| ------| ------------------------------------|
|id, user\_id, item\_id|UUID|基础标识 + 归属事项|
|title, status, start\_date, end\_date||阶段信息|
|Goal通过goals.phase\_id反向关联||单向外键（Phase不持有goal\_id）|

### 2. 现有代码层功能

**数据库操作层** ﻿src/lib/db/﻿ **：**

- ﻿﻿goals.ts﻿：getGoals, getGoalById, createGoal, updateGoal, deleteGoal, getGoalsByItemId -- 纯 CRUD，无聚合计算
- ﻿﻿records.ts﻿：createRecord, updateRecord, deleteRecord, listRecords -- 支持 metric\_value 读写，但无按 item 聚合 metric 的函数
- ﻿﻿items.ts﻿：getItemById 返回 item + recent\_records 列表；listItems 返回 phase\_count/record\_count
- ﻿﻿insights.ts﻿：全局洞察面板，统计记录总量/类型分布/tag分布/目标关联数，**不涉及 metric\_value 聚合**

**API 路由** ﻿src/app/api/v2/﻿ **：**

- ﻿﻿GET /api/v2/goals?item\_id\=xxx﻿ -- 获取事项下的目标列表
- ﻿﻿GET /api/v2/records?item\_id\=xxx﻿ -- 获取事项下的记录列表
- ﻿﻿GET /api/v2/items/{id}﻿ -- 获取事项详情（含 records）
- **无任何 metric 聚合 API**

**前端页面** ﻿src/app/(dashboard)/items/[id]/page.tsx﻿ **：**

- 事项详情页，包含：编辑区、阶段管理(PhaseForm)、时间线(ItemTimeline)、目标区(ItemGoalSection)、历史导入(HistoryImport)
- ItemGoalSection 仅显示目标列表的 CRUD 操作，**无任何量化仪表盘**
- 右栏有聚合概览(aggregation)：total\_cost, total\_duration\_minutes, metric\_summaries -- 但这只是简单汇总，不涉及目标对比和差额计算

**TypeScript 类型** ﻿src/types/teto.ts﻿ **：**

- Goal 接口已有 measure\_type + target\_value + current\_value
- ItemAggregation 接口有 metric\_summaries（按 metric\_name 分组求和）
- **无 GoalEngineResult 等引擎输出类型**

### 3. 数据流转现状 vs 目标

```
plaintext现状：Record(带metric_value) --> listRecords --> 前端原样展示
                              --> insights   --> 全局统计（不涉及metric聚合）

目标：Record(带metric_value) --> Goal Engine --> 与Goal配置碰撞 --> 差额/配速/完成率
                                             --> MVP面板展示红字差额
```

### 4. 缺口总结

|层级|现有|缺少|
| ----------| ----------------------------------------------------| --------------------------|
|数据库|records有metric\_value, goals有target\_value|goals缺benchmark配速字段|
|后端逻辑|纯CRUD，无聚合计算|需要聚合引擎函数|
|API|无metric聚合端点|需要goal-engine端点|
|前端|ItemGoalSection仅CRUD|需要数据仪表盘组件|
|类型|Goal接口不完整|需要GoalEngineResult类型|

---

## 第二部分：开发任务

### Task 1: 数据库 Schema 扩展

**文件：** ﻿sql/010\_goal\_benchmark\_fields.sql﻿ **（新建）**

在 ﻿goals﻿ 表新增 4 个 benchmark 字段：

sql

```
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

- ﻿﻿target\_value﻿ 已存在，复用为"总目标量"（如 40150）
- ﻿﻿unit﻿ 独立于 record 的 ﻿metric\_unit﻿，属于 Goal 层面的标尺定义
- 所有字段 nullable，向后兼容非量化目标（measure\_type\=boolean 的目标不需要这些字段）

---

### Task 2: TypeScript 类型扩展

**文件：** ﻿src/types/teto.ts﻿

2a. 在 ﻿Goal﻿ 接口新增字段：

```
typescriptexport interface Goal {
  // ... 现有字段
  unit: string | null;           // 新增
  daily_target: number | null;   // 新增
  start_date: string | null;     // 新增
  deadline_date: string | null;  // 新增
}
```

2b. 新增 ﻿GoalEngineResult﻿ 类型（引擎输出）：

typescript

```
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

2c. 在 ﻿CreateGoalPayload﻿ / ﻿UpdateGoalPayload﻿ 中加入对应可选字段。

---

### Task 3: 目标 CRUD 层适配

**文件：** ﻿src/lib/db/goals.ts﻿

在 ﻿createGoal﻿ 和 ﻿updateGoal﻿ 函数中加入 ﻿unit﻿, ﻿daily\_target﻿, ﻿start\_date﻿, ﻿deadline\_date﻿ 字段的读写支持。改动很小，仅在 insert/update 对象中添加字段映射。

---

### Task 4: 服务端聚合引擎

**文件：** ﻿src/lib/db/goal-engine.ts﻿ **（新建）**

核心函数 ﻿computeGoalEngine(userId, goalId)﻿：

1. 查询 Goal 配置（含 benchmark 字段）
2. 验证 measure\_type\=numeric 且 daily\_target/start\_date 存在
3. 查询该 Goal 关联的 item\_id 下所有 records 的 metric\_value（按 item\_id 聚合，而非 goal\_id，因为用户日常记录挂 item 不挂 goal）
4. 计算并返回 ﻿GoalEngineResult﻿

关键查询逻辑：

```
plaintext﻿﻿records WHERE item_id = goal.item_id AND metric_value IS NOT NULL﻿
```

- 今日数据：额外按 record\_day.date \= today 过滤
- 近7天/近30天：按日期窗口过滤后求均值
- 总计：全部求和

批量版本 ﻿computeGoalEngineForItem(userId, itemId)﻿ 返回该事项下所有 numeric Goal 的引擎结果数组。

---

### Task 5: API 端点

**文件：** ﻿src/app/api/v2/goals/[id]/engine/route.ts﻿ **（新建）**

```
plaintext﻿﻿GET /api/v2/goals/{goalId}/engine﻿
```

返回单个 Goal 的 ﻿GoalEngineResult﻿。

**文件：** ﻿src/app/api/v2/items/[id]/goal-engine/route.ts﻿ **（新建）**

```
plaintext﻿﻿GET /api/v2/items/{itemId}/goal-engine﻿
```

返回该事项下所有量化目标的引擎结果数组。（这是 MVP UI 实际调用的端点）

---

### Task 6: 客户端 Hook

**文件：** ﻿src/lib/hooks/useGoalEngine.ts﻿ **（新建）**

```
typescriptfunction useGoalEngine(itemId: string) {
  // fetch /api/v2/items/{itemId}/goal-engine
  // 返回 { data: GoalEngineResult[], loading, error, refetch }
}
```

纯数据获取 Hook，不涉及 UI 逻辑。

---

### Task 7: MVP 数据面板 UI

**文件：** ﻿src/app/(dashboard)/items/components/GoalEngineDashboard.tsx﻿ **（新建）**

在事项详情页（﻿items/[id]/page.tsx﻿）中嵌入，展示方式参照用户 Excel 仪表盘：

|字段|展示|对应Excel行|
| --------------------| ------------------------------------------------| -------------------------|
|坚持天数|total\_passed\_days 天|"坚持 第 486 天"|
|今日进度|today\_actual / daily\_target|--|
|每日平均|daily\_average|"每日平均"|
|近7日均 / 近30日均|avg\_7d / avg\_30d|"近7日均" / "近30日均"|
|总完成率|completion\_rate (%)|"总完成率" (红/黄/绿)|
|合计应当|total\_expected|"合计应当"|
|完成总值|total\_actual|"完成总值"|
|**合计差值**|**deficit（负数红色高亮）**| **"合计差值 -26325"**|
|动态配速|dynamic\_daily\_pacer（如有）|"26剩余 253天" 隐含|
|剩余天数|remaining\_days|"26剩余"|
|周/月目标|weekly\_target / monthly\_target|"每周目标" / "每月目标"|
|周/月预计|weekly\_projection / monthly\_projection|"周预计" / "月预计"|

UI 要求：

- Grid 布局，紧凑排列
- deficit \< 0 时，数字用红色 ﻿text-red-500﻿ + 粗体
- completion\_rate \< 50% 红色，50-80% 黄色，\>80% 绿色
- 不涉及图表，纯数字面板
- 每个量化目标独立一个面板卡片

**文件：** ﻿src/app/(dashboard)/items/[id]/page.tsx﻿

在现有页面结构中合适位置（目标区域下方或右栏）插入 ﻿\<GoalEngineDashboard itemId\={itemId} /\>﻿。

---

## 开发顺序

严格按 Task 1 -\> 2 -\> 3 -\> 4 -\> 5 -\> 6 -\> 7 顺序执行，每个 Task 完成后验证再进入下一个。Task 1-3 是数据基建，Task 4-5 是核心引擎，Task 6-7 是前端展示。
