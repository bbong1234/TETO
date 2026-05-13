# TETO 事项目标系统重构方案

## Context

当前目标系统有 3 种目标类型（达标型/量化型/重复型），用户需手动选类型、填复杂表单创建目标。这导致：

1. 用户负担重——需要理解"量化型""重复型"等概念
2. 模糊目标（如"英语变好"）也能直接创建，无法判断是否完成
3. 目标静默创建，不经确认，容易误建
4. 缺少限制型目标（如"每天刷抖音不超过30分钟"）

本次重构核心目标：​**3 类底层规则替代现有类型 + 自然语言创建 + 模糊检测 + 确认流程**。

---

## 一、3 类底层规则

### 规则 1：一次性完成

> 在某个时间前，累计完成什么，或者达成什么结果

|例子|operator|target\_min|unit|deadline|
| --------------------| ------------| ----------------| ------| ------------|
|背完 10000 个单词|\>\=|10000|个|可空|
|6 月前通过四级|complete|null|null|2026-06-30|
|年底前读完 20 本书|\>\=|20|本|2026-12-31|
|周五前写完方案|complete|null|null|2026-05-08|

### 规则 2：周期性达成

> 每天/每周/每月/每年，至少要完成多少

|例子|period|operator|target\_min|unit|
| ----------------------| --------| ------------| ----------------| ------|
|每天背 30 个单词|每天|\>\=|30|个|
|每周运动 3 次|每周|\>\=|3|次|
|每月读 2 本书|每月|\>\=|2|本|
|每天学习英语 30 分钟|每天|\>\=|30|分钟|

### 规则 3：周期性限制（全新）

> 每天/每周/每月/某段时间内，不能超过多少，或不能晚于/早于某个边界

|例子|period|operator|target\_max|unit|
| --------------------------| --------| ------------| ----------------| --------|
|每天刷抖音不超过 30 分钟|每天|\<\=|30|分钟|
|本周喝酒不超过 2 次|本周|\<\=|2|次|
|每天起床不得晚于 8 点|每天|\<\=|8:00|时间点|
|每月外卖不超过 10 次|每月|\<\=|10|次|

### 旧类型 → 新规则映射

|旧 measure\_type|旧特征|新 rule\_type|新 operator|新 period|
| ---------------------| ----------------------------------| ------------------| -------------| ---------------------------|
|boolean 达标型|—|一次性完成|complete|无|
|numeric 量化型|有 deadline|一次性完成|\>\=|无|
|numeric 量化型|有 daily\_target，无 deadline|周期性达成|\>\=|每天|
|numeric 量化型|有 daily\_target + deadline|一次性完成|\>\=|无|
|repeat 重复型|—|周期性达成|\>\=|映射 repeat\_frequency|

---

## 二、数据库设计

### 新增字段

sql

​`    ``` goal_text              TEXT              -- 用户原始目标句 rule_type              TEXT              -- 一次性完成 / 周期性达成 / 周期性限制 operator               TEXT              -- >= / <= / = / between / before / after / complete period                 TEXT              -- 无 / 每天 / 每周 / 每月 / 每年 / 本周 / 本月 target_min             NUMERIC           -- 区间下限 / 达成目标值 target_max             NUMERIC           -- 区间上限 / 限制上限 deadline               DATE              -- 截止时间（替代 deadline_date） end_date               DATE              -- 结束时间（如习惯持续30天的结束日） source                 TEXT DEFAULT '手动创建'  -- 手动创建 / 从记录生成 / 系统建议 confirmation_required  BOOLEAN DEFAULT false progress_source        TEXT DEFAULT '记录统计'  -- 记录统计 / 手动更新 / 暂无 ```    `

### 删除字段（迁移后直接删列）

sql

​`    ``` measure_type           -- 被 rule_type 替代 repeat_frequency       -- 被 period 替代 repeat_count           -- 被 target_min + period 替代 daily_target           -- 引擎从 target_min + period 推算 deadline_date          -- 被 deadline 替代 ```    `

### 保留字段

plaintext

​`    ``` target_value           -- 一次性完成的总目标值（与 target_min 同义，过渡期保留） current_value          -- 手动更新的当前值 metric_name            -- 防串库核心字段 unit                   -- 防串库 + 显示 start_date             -- 引擎起算日 sub_item_id            -- 防串库首要字段 item_id, phase_id      -- 归属关系 title, description     -- 标题和描述 ```    `

### 状态变更

|旧 status|新 status|
| -----------| --------------|
|进行中|进行中|
|已达成|已完成|
|已放弃|已放弃|
|已暂停|已暂停|
|—|​**草稿**（新增）|

完整状态集：`草稿 / 进行中 / 已完成 / 暂停 / 放弃`

### 数据迁移逻辑

sql

​`    ``` -- 1. boolean → 一次性完成 UPDATE goals SET   rule_type = '一次性完成', operator = 'complete', period = '无',   target_min = target_value, target_max = target_value,   goal_text = title, source = '手动创建',   progress_source = '手动更新', confirmation_required = false WHERE measure_type = 'boolean';  -- 2. numeric(有deadline) → 一次性完成 UPDATE goals SET   rule_type = '一次性完成', operator = '>=', period = '无',   target_min = target_value,   goal_text = title, source = '手动创建',   progress_source = '记录统计', deadline = deadline_date WHERE measure_type = 'numeric' AND deadline_date IS NOT NULL;  -- 3. numeric(有daily_target, 无deadline) → 周期性达成 UPDATE goals SET   rule_type = '周期性达成', operator = '>=', period = '每天',   target_min = daily_target,   goal_text = title, source = '手动创建',   progress_source = '记录统计' WHERE measure_type = 'numeric' AND daily_target IS NOT NULL AND deadline_date IS NULL;  -- 4. repeat → 周期性达成 UPDATE goals SET   rule_type = '周期性达成', operator = '>=',   period = CASE repeat_frequency WHEN 'daily' THEN '每天' WHEN 'weekly' THEN '每周' WHEN 'monthly' THEN '每月' END,   target_min = repeat_count, unit = COALESCE(unit, '次'),   goal_text = title, source = '手动创建',   progress_source = '记录统计' WHERE measure_type = 'repeat';  -- 5. 状态映射 UPDATE goals SET status = '已完成' WHERE status = '已达成';  -- 6. 删旧列 ALTER TABLE goals DROP COLUMN measure_type; ALTER TABLE goals DROP COLUMN repeat_frequency; ALTER TABLE goals DROP COLUMN repeat_count; ALTER TABLE goals DROP COLUMN daily_target; ALTER TABLE goals DROP COLUMN deadline_date; ```    `

---

## 三、类型系统（`src/types/teto.ts`）

### 新增枚举

typescript

​`    ``` export const GOAL_RULE_TYPES = ['一次性完成', '周期性达成', '周期性限制'] as const; export type GoalRuleType = typeof GOAL_RULE_TYPES[number];  export const GOAL_OPERATORS = ['>=', '<=', '=', 'between', 'before', 'after', 'complete'] as const; export type GoalOperator = typeof GOAL_OPERATORS[number];  export const GOAL_PERIODS = ['无', '每天', '每周', '每月', '每年', '本周', '本月'] as const; export type GoalPeriod = typeof GOAL_PERIODS[number];  export const GOAL_SOURCES = ['手动创建', '从记录生成', '系统建议'] as const; export type GoalSource = typeof GOAL_SOURCES[number];  export const GOAL_STATUSES = ['草稿', '进行中', '已完成', '暂停', '放弃'] as const; export type GoalStatus = typeof GOAL_STATUSES[number];  export const GOAL_PROGRESS_SOURCES = ['记录统计', '手动更新', '暂无'] as const; export type GoalProgressSource = typeof GOAL_PROGRESS_SOURCES[number]; ```    `

### Goal 接口

typescript

​`    ``` export interface Goal {   id: string;   user_id: string;   item_id: string | null;   phase_id: string | null;   sub_item_id: string | null;    goal_text: string;               // 用户原始目标句   rule_type: GoalRuleType;         // 3类规则   operator: GoalOperator;          // 比较操作符    metric_name: string | null;      // 防串库指标名   target_value: number | null;     // 兼容旧字段，等同于 target_min   target_min: number | null;       // 达成目标值 / 区间下限   target_max: number | null;       // 限制上限 / 区间上限   unit: string | null;             // 计量单位   period: GoalPeriod | null;       // 周期    start_date: string | null;       // 起算日   end_date: string | null;         // 结束日（如习惯持续30天）   deadline: string | null;         // 截止日    source: GoalSource;              // 来源   status: GoalStatus;              // 状态（含草稿）   confirmation_required: boolean;  // 是否需要确认   progress_source: GoalProgressSource;  // 进度来源   current_value: number | null;    // 当前值（手动更新型）    created_at: string;   updated_at: string; } ```    `

### 统一引擎结果

typescript

​`    ``` export interface GoalEngineResult {   goal_id: string;   goal_title: string;   rule_type: GoalRuleType;   unit: string;    // ── 通用时间维度 ──   start_date: string | null;   total_passed_days: number;   remaining_days: number | null;    // ── 当前周期（周期性目标） ──   current_period_start: string | null;   current_period_end: string | null;   current_period_actual: number;     // 当前周期实际值   current_period_target: number;     // 当前周期目标值   current_period_progress: number;   // 0~1    // ── 累计维度（一次性完成） ──   total_actual: number;              // 累计实际值   total_target: number | null;       // 累计目标值   total_expected: number | null;     // 基于日均累计应达   deficit: number | null;            // total_actual - total_expected    // ── 通用指标 ──   completion_rate: number | null;   daily_average: number | null;   avg_7d: number | null;   avg_30d: number | null;   dynamic_daily_pacer: number | null;    // ── 超限预警（周期性限制专用） ──   is_over_limit: boolean | null;       // 是否已超限   remaining_budget: number | null;     // 剩余预算（target_max - actual）   projected_period_total: number | null; // 预计本期总量    // ── 周/月投射 ──   weekly_target: number | null;   monthly_target: number | null;   weekly_projection: number | null;   monthly_projection: number | null; } ```    `

### AI 解析输出类型

typescript

​`    ``` export interface ParsedGoalSuggestion {   goal_text: string;   rule_type: GoalRuleType;   operator: GoalOperator;   period: GoalPeriod | null;   target_min: number | null;   target_max: number | null;   metric_name: string | null;   unit: string | null;   deadline: string | null; }  export interface ParsedGoal {   is_fuzzy: boolean;                    // 是否模糊   fuzzy_reason: string | null;          // 模糊原因   suggestions: ParsedGoalSuggestion[];  // 建议列表   parsed: ParsedGoalSuggestion | null;  // 清晰时的解析结果   suggested_item_name: string | null;   // 推荐关联事项   confidence: number;                   // 0~1 } ```    `

### 删除的旧类型

- ​`GoalMeasureType`​, `GOAL_MEASURE_TYPES`
- ​`RepeatFrequency`​, `REPEAT_FREQUENCIES`
- ​`RepeatGoalEngineResult`​（合并到统一 `GoalEngineResult`）

---

## 四、目标引擎重写（`src/lib/db/goal-engine.ts`）

### 架构：统一入口 → 三子引擎

plaintext

​`    ``` computeUnifiedGoalEngineForItem(userId, itemId)   ├─ fetchGoalsForItem() WHERE status != '草稿'   └─ 按 rule_type 分流：      ├─ rule_type = '一次性完成' → computeOneTimeEngine()      ├─ rule_type = '周期性达成' → computePeriodicAchieveEngine()      └─ rule_type = '周期性限制' → computePeriodicLimitEngine() ```    `

### 4.1 一次性完成引擎

逻辑与当前量化型引擎基本一致：

- ​`operator = 'complete'`​：`current_value >= target_min` 即完成
- ​`operator = '>='`​：累计 metric\_value \>\= target\_min
- ​`operator = 'between'`​：target\_min \<\= 累计值 \<\= target\_max
- 有 deadline 时算配速器

关键变化：`daily_target`​ 从 Goal 字段移除 → 引擎从 `target_min + period`​ 推算日均。对于一次性完成且无 period 的目标，日均 \= `total_actual / total_passed_days`（与当前逻辑一致）。

### 4.2 周期性达成引擎

逻辑与当前重复型引擎类似，但增加 metric\_value 求和：

- 有 `metric_name`​ 时：求当前周期内 `sum(metric_value)`​ vs `target_min`
- 无 `metric_name`​ 时：求当前周期内记录条数 vs `target_min`（与当前 repeat 逻辑一致）

周期起止计算：

- ​`每天`​：today \~ today
- ​`每周`​：本周一 \~ 本周日
- ​`每月`​：本月1日 \~ 本月末
- ​`每年`​：本年1月1日 \~ 本年12月31日
- ​`本周`​：本周一 \~ 本周日（语义是"截止本周的一次性任务"）
- ​`本月`​：本月1日 \~ 本月末（同上）

### 4.3 周期性限制引擎（全新）

核心逻辑：当前周期内实际值 vs target\_max

plaintext

​`    ``` 当前周期实际值 = sum(metric_value) WHERE 日期在周期内 AND 防串库匹配  is_over_limit = actual > target_max remaining_budget = target_max - actual projected_period_total = daily_average × 周期剩余天数 + actual ```    `

**预警等级：**

|条件|等级|UI 色值|
| ----------------------------------------| ------| ---------|
|actual / target\_max \< 0.5|安全|绿色|
|actual / target\_max \< 0.8|注意|黄色|
|actual / target\_max \< 1.0|警告|橙色|
|actual / target\_max \>\= 1.0|超限|红色|

### 4.4 草稿目标排除

所有引擎查询增加 `status != '草稿'` 过滤。草稿目标不参与任何计算。

### 4.5 防串库机制保留

不变：`sub_item_id`​ \> `metric_name + unit`​ \> `metric_name`

---

## 五、AI 目标解析器（新建 `src/lib/ai/parse-goal.ts`）

### 5.1 Prompt 核心逻辑

**Step 1：模糊检测**

判断标准：

- 无量化指标（如"英语变好""情绪更稳定"）→ 模糊
- 有量化但无时间约束（如"背单词"）→ 偏模糊
- 有量化 + 有周期/截止日 → 清晰

**Step 2：规则分类**

|用户输入|rule\_type|operator|period|
| ------------------------| ---------------| ------------| --------|
|6月前背完10000个单词|一次性完成|\>\=|无|
|每天背30个单词|周期性达成|\>\=|每天|
|每周运动3次|周期性达成|\>\=|每周|
|每天刷抖音不超过30分钟|周期性限制|\<\=|每天|
|本周喝酒不超过2次|周期性限制|\<\=|本周|
|每天起床不得晚于8点|周期性限制|\<\=|每天|
|通过四级|一次性完成|complete|无|

**Step 3：参数提取**

从自然语言中提取：metric\_name、target\_min/max、unit、period、deadline、operator

**Step 4：建议生成（仅模糊时）**

AI 生成 3-5 个具体化建议，每个建议都是完整的 ParsedGoalSuggestion。

### 5.2 输出格式

json

​`    ``` {   "is_fuzzy": false,   "fuzzy_reason": null,   "suggestions": [],   "parsed": {     "goal_text": "每天背30个单词",     "rule_type": "周期性达成",     "operator": ">=",     "period": "每天",     "target_min": 30,     "target_max": null,     "metric_name": "背单词",     "unit": "个",     "deadline": null   },   "suggested_item_name": "英语",   "confidence": 0.95 } ```    `

模糊时：

json

​`    ``` {   "is_fuzzy": true,   "fuzzy_reason": "没有具体量化指标，无法判断是否完成",   "suggestions": [     {       "goal_text": "每天背30个单词",       "rule_type": "周期性达成",       "operator": ">=",       "period": "每天",       "target_min": 30,       "target_max": null,       "metric_name": "背单词",       "unit": "个",       "deadline": null     },     {       "goal_text": "每周听力3次",       "rule_type": "周期性达成",       "operator": ">=",       "period": "每周",       "target_min": 3,       "target_max": null,       "metric_name": "听力",       "unit": "次",       "deadline": null     }   ],   "parsed": null,   "suggested_item_name": "英语",   "confidence": 0.4 } ```    `

### 5.3 上下文增强

调用时传入事项信息：

- 事项标题和描述
- 子项列表
- 已有的 metric\_name/unit 组合
- 已有目标（避免重复）

---

## 六、API 层变更

### 新增端点

|端点|方法|功能|
| ------| ------| ------------------------|
|​`/api/v2/goals/parse`|POST|自然语言解析为目标草稿|
|​`/api/v2/goals/[id]/confirm`|POST|确认草稿目标 → 进行中|

**POST /api/v2/goals/parse**

plaintext

​`    ``` 请求：{ goal_text: string, item_id?: string } 响应：{ data: ParsedGoal } ```    `

**POST /api/v2/goals/[id]/confirm**

plaintext

​`    ``` 请求：{ rule_type, operator, period, target_min, target_max, metric_name, unit, ... } 响应：{ data: Goal }  // status 已变为 进行中 ```    `

### 改造端点

|端点|变化|
| ------| -------------------------------------------------------------------|
|​`POST /api/v2/goals`|适配新字段；confirmation\_required\=true 时 status\=草稿|
|​`PUT /api/v2/goals/[id]`|适配新字段|
|​`GET /api/v2/goals/[id]/engine`|调用统一引擎|
|​`GET /api/v2/items/[id]/goal-engine`|返回`GoalEngineResult[]`（不再分 numeric/repeat）|
|​`GET /api/v2/goals`|新增 rule\_type/source 查询参数|

---

## 七、前端 UI — 用户操作流程

### 7.1 目标创建流程（核心）

plaintext

​`    ``` 用户在事项详情页点击"设置目标"          │          ▼ ┌──────────────────────────────────┐ │  目标输入对话框                    │ │                                    │ │  ┌──────────────────────────────┐ │ │  │ 输入你的目标                   │ │ │  │ "6月前背完1万单词"             │ │ │  └──────────────────────────────┘ │ │                                    │ │  [解析目标]  或  Enter 触发        │ └──────────────┬───────────────────┘                │          ┌─────┴─────┐          │           │       清晰目标     模糊目标          │           │          ▼           ▼  【清晰目标】                【模糊目标】  ┌─────────────────┐    ┌──────────────────────────┐ │ 📋 目标规则卡片   │    │ ⚠️ 这是一个模糊方向         │ │                  │    │ 不适合作为正式目标          │ │ "6月前背完1万单词"│    │                            │ │                  │    │ 💡 你可以选择：             │ │ 规则：一次性完成  │    │                            │ │ 达成：≥ 10,000 个 │    │ ┌────────────────────┐    │ │ 截止：2026-06-30 │    │ │ 1. 每天背30个单词   │    │ │ 指标：单词 · 个   │    │ │    周期性达成       │    │ │                  │    │ └────────────────────┘    │ │ [修改规则]       │    │ ┌────────────────────┐    │ │ [确认创建]       │    │ │ 2. 6月前背完1万单词 │    │ │ [取消]           │    │ │    一次性完成       │    │ └─────────────────┘    │ └────────────────────┘    │                        │ ┌────────────────────┐    │                        │ │ 3. 每周背200个单词  │    │                        │ │    周期性达成       │    │                        │ └────────────────────┘    │                        │                            │                        │ ┌────────────────────┐    │                        │ │ 5. 自定义目标...    │    │                        │ └────────────────────┘    │                        │                            │                        │ [重新描述]                  │                        └──────────────────────────┘                               │                      选择建议后                      进入规则卡片                               │                               ▼                        同左侧规则卡片  两个分支最终都汇聚到：   用户确认 → POST /api/v2/goals → status=进行中   用户关闭 → 保存为草稿 → status=草稿 ```    `

### 7.2 规则卡片 UI

三种 rule\_type 的规则卡片：

**一次性完成：**

plaintext

​`    ``` ┌─────────────────────────────────┐ │ 🎯 一次性完成                    │ │                                  │ │ "6月前背完1万单词"               │  ← 用户原句 │                                  │ │ 达成条件：≥ 10,000 个            │ │ 截止日期：2026-06-30             │ │ 起算日期：2026-05-02             │ │ 关联指标：单词 · 个              │ │ 绑定子项：背单词                  │ │                                  │ │ [修改规则]  [确认创建]  [取消]   │ └─────────────────────────────────┘ ```    `

**周期性达成：**

plaintext

​`    ``` ┌─────────────────────────────────┐ │ 🔄 周期性达成                    │ │                                  │ │ "每天背30个单词"                 │ │                                  │ │ 周期目标：每天 ≥ 30 个           │ │ 关联指标：背单词 · 个            │ │ 绑定子项：背单词                  │ │                                  │ │ [修改规则]  [确认创建]  [取消]   │ └─────────────────────────────────┘ ```    `

**周期性限制：**

plaintext

​`    ``` ┌─────────────────────────────────┐ │ 🚫 周期性限制                    │ │                                  │ │ "每天刷抖音不超过30分钟"          │ │                                  │ │ 限制规则：每天 ≤ 30 分钟         │ │ 关联指标：刷抖音时长 · 分钟       │ │                                  │ │ [修改规则]  [确认创建]  [取消]   │ └─────────────────────────────────┘ ```    `

​**修改规则**​：展开 inline 编辑面板，可调整 target\_min/max、period、operator、deadline 等参数。

### 7.3 事项详情页目标列表改造

plaintext

​`    ``` ┌──────────────────────────────────────┐ │ 目标                                  │ │                                        │ │ ── 待确认 ──                           │  ← 草稿目标分组 │ ┌ · · · · · · · · · · · · · · · · ┐ │  ← 虚线边框 │ │ 📝 "每天背单词"                    │ │ │ │ 草稿 · 周期性达成 · 待确认          │ │ │ │ [确认] [编辑] [删除]               │ │ │ └ · · · · · · · · · · · · · · · · ┘ │ │                                        │ │ ── 进行中 ──                           │  ← 正式目标分组 │ ┌──────────────────────────────────┐ │ │ │ 🔄 每天背30个单词                 │ │ │ │ 周期性达成 · 每天 ≥ 30 个          │ │ │ │ 今日：40/30 已达成 ✓               │ │ │ │ [编辑] [删除]                      │ │ │ └──────────────────────────────────┘ │ │ ┌──────────────────────────────────┐ │ │ │ 🚫 每天刷抖音不超过30分钟          │ │ │ │ 周期性限制 · 每天 ≤ 30 分钟        │ │ │ │ 今日：25/30 🟡注意                 │ │ │ │ [编辑] [删除]                      │ │ │ └──────────────────────────────────┘ │ │                                        │ │ [+ 设置目标]                           │  ← 自然语言输入入口 └──────────────────────────────────────┘ ```    `

### 7.4 引擎仪表盘改造

​**统一仪表盘**，不再分"量化仪表盘"和"重复型目标"两个区域：

- 一次性完成 → 蓝色系 EngineCard（复用现有风格）
- 周期性达成 → 绿色系 PeriodicCard（复用 RepeatGoalCard 风格）
- 周期性限制 → 红/橙色系 LimitCard（新增）

**LimitCard 设计：**

plaintext

​`    ``` ┌─────────────────────────────────┐ │ 🚫 每天刷抖音 ≤ 30分钟          │ │                                  │ │ 今日用量：25 / 30 分钟           │ │ ████████████████████░░░░ 83%    │  ← 橙色进度条 │                                  │ │ 预计今日：32 分钟 ⚠️              │  ← 投射超限预警 │ 剩余预算：5 分钟                  │ │                                  │ │ 本周统计：                        │ │ 4天安全 · 2天注意 · 1天超限       │ └─────────────────────────────────┘ ```    `

---

## 八、涉及文件清单

|文件|操作|说明|
| --------| ------| -----------------------------|
|​`sql/006_goal_rule_refactor.sql`|**新建**|数据库迁移|
|​`src/types/teto.ts`|修改|新接口、新枚举、删旧类型|
|​`src/types/semantic.ts`|修改|新增 ParsedGoal 相关类型|
|​`src/lib/db/goal-engine.ts`|重写|三子引擎 + 统一入口|
|​`src/lib/db/goals.ts`|修改|适配新字段 + 草稿确认|
|​`src/lib/ai/parse-goal.ts`|**新建**|AI 目标解析器|
|​`src/app/api/v2/goals/route.ts`|修改|适配新字段|
|​`src/app/api/v2/goals/[id]/route.ts`|修改|适配新字段|
|​`src/app/api/v2/goals/[id]/engine/route.ts`|修改|调用统一引擎|
|​`src/app/api/v2/goals/parse/route.ts`|**新建**|AI 解析端点|
|​`src/app/api/v2/goals/[id]/confirm/route.ts`|**新建**|草稿确认端点|
|​`src/app/(dashboard)/items/components/GoalForm.tsx`|重写|自然语言输入 + 规则卡片|
|​`src/app/(dashboard)/items/components/ItemGoalSection.tsx`|重写|新分组 + 草稿区|
|​`src/app/(dashboard)/items/components/GoalEngineDashboard.tsx`|重写|统一仪表盘|
|​`src/app/(dashboard)/items/components/RepeatGoalCard.tsx`|删除|被统一卡片替代|
|​`src/app/(dashboard)/items/components/GoalCard.tsx`|重写|通用卡片|
|​`src/app/(dashboard)/items/components/GoalSection.tsx`|修改|适配新状态|
|​`src/app/(dashboard)/items/components/GoalPicker.tsx`|修改|适配新字段|
|​`src/app/(dashboard)/insights/components/GoalInsights.tsx`|修改|适配新状态|
|​`src/lib/hooks/useGoalEngine.ts`|重写|统一返回 GoalEngineResult[]|
|新建`GoalRuleCard.tsx`|**新建**|规则预览卡片|
|新建`GoalSuggestionList.tsx`|**新建**|模糊目标建议列表|
|新建`LimitEngineCard.tsx`|**新建**|周期性限制引擎卡片|

---

## 九、实施顺序

plaintext

​`    ``` Phase 0：准备   1. 编写 SQL 迁移脚本，测试环境验证  Phase 1：后端数据层   2. 类型系统重构（teto.ts 新枚举 + 新接口，旧类型标记 @deprecated）   3. SQL 迁移阶段一+二（新增字段 + 数据迁移），旧字段暂不删   4. 目标引擎重写（三子引擎 + 统一入口，旧函数标记 @deprecated 但保留）   5. DB 层适配（goals.ts 支持新字段，双写过渡）   6. AI 目标解析器（parse-goal.ts）  Phase 2：API 层   7. 新增 /api/v2/goals/parse   8. 新增 /api/v2/goals/[id]/confirm   9. 改造现有 goals 端点   10. 改造 goal-engine 端点  Phase 3：前端 UI   11. useGoalEngine hook 适配   12. 新建 GoalRuleCard / GoalSuggestionList / LimitEngineCard   13. 重写 GoalForm → 自然语言输入流程   14. 重写 ItemGoalSection   15. 重写 GoalEngineDashboard   16. 适配 GoalInsights  Phase 4：清理   17. SQL 迁移阶段四（删除旧列）   18. 删除旧类型定义和旧引擎函数   19. 删除 RepeatGoalCard.tsx   20. 清理 @deprecated 标记  Phase 5：验证   21. 端到端测试：自然语言 → AI 解析 → 确认 → 引擎计算   22. 模糊目标建议流程测试   23. 周期性限制超限预警测试   24. 旧数据迁移完整性验证   25. npm run build + npm run lint 通过 ```    `

---

## 十、验证方式

1. ​**SQL 迁移验证**：在测试环境执行迁移脚本，检查数据映射正确性
2. ​**引擎计算验证**：对比迁移前后同一目标的引擎输出（量化型→一次性完成、重复型→周期性达成）
3. ​**AI 解析验证**：输入"每天背30个单词""英语变好""每天刷抖音不超过30分钟"等典型用例，检查解析结果
4. ​**模糊检测验证**​：输入模糊表达（"英语变好""生活更规律"），确认返回 is\_fuzzy\=true + suggestions
5. ​**超限预警验证**​：创建限制型目标，手动添加超限记录，检查 is\_over\_limit 和预警色
6. ​**草稿确认验证**：创建目标后关闭不确认，检查保存为草稿；确认后检查状态变为进行中
7. ​**构建验证**​：`npm run build`​ + `npm run lint` 无错误
