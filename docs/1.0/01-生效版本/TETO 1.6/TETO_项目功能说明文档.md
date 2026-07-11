# TETO 项目功能说明文档

> 基于 TETO 1.6 代码库完整扫描编写，反映当前实际实现状态。
> 对应版本：TETO 1.6

---

## 一、核心功能模块概述

TETO 是以记录为入口、事项为长期容器、洞察为分析层的个人现实管理系统，核心解决「接住 → 组织 → 理解」现实的问题。系统由四大功能模块构成：

### 1.1 记录管理（Records）

记录是 TETO 的核心数据实体，承载用户对现实的所有感知与行动。通过三态输入管线实现从自然语言到结构化数据的完整转化。

- **自然语言录入**：用户输入一句话（如"今天跑步5公里花了20元"），AI 自动解析为结构化记录
- **复合句拆分**：多事件输入自动拆分为多条独立记录（如"学了英语还健身了"→ 2 条记录）
- **渐进式澄清**：低置信度字段触发单题澄清，用户可 answer/skip/defer/cancel
- **记录生命周期**：active → completed / postponed / cancelled
- **质量标签**：`ai_high`（直入库）/ `clarified`（经澄清）/ `partial`（跳过澄清）
- **记录编辑**：RecordEditDrawer 支持修改所有三层九组字段

### 1.2 项目管理（Items）

事项是长期容器，将记录组织到有意义的主题下。

- **四维事项结构**：事项（Item）→ 子项（Sub-item）→ 阶段（Phase）→ 目标（Goal）
- **事项状态**：活跃 / 推进中 / 放缓 / 停滞 / 已搁置 / 已完成
- **事项文件夹**：分组管理事项
- **时间线视图**：事项下的记录按时间线展示
- **数据面板**：事项级别的聚合统计（投入量、记录频率、目标进度）
- **历史导入**：从外部数据批量导入

### 1.3 统计分析（Insights）

洞察层提供可对比、可追溯的规则+LLM 双层分析能力。

- **活跃度热力图**：180 天记录密度可视化
- **时间分布**：早/午/晚/夜四时段分布
- **周期对比**：7 天/30 天同比环比
- **事项活跃度**：各事项的投入与频率
- **事实溯源**：FactSourcePanel 展示统计依据，可追溯到单条记录
- **LLM 润色**：AI 生成洞察摘要文本
- **纠错趋势**：CorrectionsTrendsPanel 展示用户纠错模式
- **今日/昨日时间线**：记录按时间段分布

### 1.4 目标跟踪（Goals）

目标引擎提供三种规则类型的统一计算能力。

- **三种规则类型**：一次性完成 / 周期性达成 / 周期性限制
- **统一引擎**：rule_type + operator + period 描述，goal-engine 统一计算
- **进度指标**：完成率、日均、配速、差额、超限预警、投射
- **目标状态**：draft / active / paused / abandoned / completed
- **自然语言创建**：AI 解析自然语言生成目标配置
- **目标仪表盘**：GoalEngineDashboard 展示完整计算结果

---

## 二、技术架构说明

### 2.1 三态输入管线

TETO 1.6 的录入不再直写 `records` 表，而是经过三态管线：

```
用户输入（自然语言）
  ↓
QuickInput.tsx（前端录入 UI）
  ↓ POST /api/v2/inputs
inputs 表（输入态）— 一次提交的容器
  ↓ ingestFull → classifyInput（LLM 清分）
input_units 表（解析态）— 子句单元 + proposed_fields + pending_question
  ↓ 准入门 canPromoteUnit()
  ↓ 无需澄清 → createRecordSafely
  ↓ 需澄清 → 返回 pending → answer/skip/defer/cancel
records 表（正式态）— 带来源/质量标签的结构化记录
```

**输入态（inputs）**：
- `client_session_id`：前端会话卡标识
- `metadata`：含 `date`（所选日历日）、`primary_unit_id`
- `status`：pending / clarifying / completed / partial / cancelled

**解析态（input_units）**：
- `proposed_fields`：LLM 解析后的字段提案
- `pending_question`：待澄清问题（PendingQuestion）
- `classifier_decision`：分类决策（含 decisions、confidence）
- `status`：pending_clarify / ready / promoted / partial / cancelled

**正式态（records）**：
- `input_id` / `input_unit_id`：追溯到输入态
- `review_status`：confirmed / unchecked / corrected / disputed
- `confidence_level`：high / medium / low
- `record_quality_tag`：ai_high / clarified / partial / corrected
- 三层九组字段结构（L1 原始层 / L2 主链层 / L3 附属层）

**澄清分类（clarify_class）**：

| 分类 | 含义 | UI 交互 |
|------|------|---------|
| `compound_confirm` | 复合句确认 | 四按钮：split / keep_single / cancel / defer |
| `field_clarify` | 字段澄清 | 选项列表 / 输入框 + confirm/rewrite |
| `boundary_confirm` | 边界确认 | 二选一：confirm / rewrite |
| `low_confidence_confirm` | 低置信度确认 | 二选一：confirm / rewrite |

### 2.2 全链路可观测性

12 种编号体系覆盖从请求入口到日志记录的全链路：

| ID 类型 | 格式 | 作用 |
|---------|------|------|
| trace_id | `T-YYYYMMDD-xxxxxx` | 请求级追踪 |
| span_id | `SPAN-NN-xxxxxx` | Pipeline 阶段级追踪 |
| decision_id | `DEC-TYPE-xxxxxx` | 关键判断追踪 |
| error_code | `ERR-DOMAIN-NNN` | 错误分类 |
| rule_id | `R-MOD-NNN` | 规则标识 |
| computation_id | `C-TYPE-NNN` | 计算指标标识 |
| behavior_id | `B-NNN` | 函数级追踪 |
| input_id | `INP-timestamp-xxxxxx` | 输入标识 |
| unit_id | `UNIT-inputId-NN` | 解析单元标识 |

**可观测性数据流**：

```
请求入口 → genTraceId()
  → startSpan(traceId, stage) → ... → endSpan()
  → logDecision() → persistDecisionLog()
  → persistTraceSummary()
  → 诊断 API: GET /api/v2/diagnose?trace_id=T-xxx
    → breakPoint + relatedDecisions + relatedRules + suggestedFixes + aiPromptSummary
```

**持久化表**：
- `trace_summaries`：每次操作的 trace 摘要
- `decision_logs`：每次关键判断的详细记录
- `corrections`：用户纠错记录

### 2.3 纠错即测试闭环

```
用户纠错 → POST /api/v2/records/[id]/correct
  ├─ updateRecordSafely（Domain 校验后更新字段）
  ├─ corrections 记录（绑定 decision_id + trace_id）
  ├─ generateRegressionTest → writeTestCaseToDisk
  │   → eval/test-cases/from-production/TCASE-xxx.json
  ├─ scheduleRuleLearning（异步）
  │   → 3 次同类错误 → 自动创建 user_rule
  ├─ logDecision + persistDecisionLog
  ├─ markRecordDerivedDataDirty（trust / goal / insight）
  └─ persistTraceSummary
```

### 2.4 可信度分级体系

| 级别 | 判定规则 | 含义 |
|------|----------|------|
| `trusted` | `review_status=confirmed` + `input_source=manual/quick` | 用户输入且已确认 |
| `reviewed` | `corrections > 0` 或 `review_status=corrected` | 用户修正过 |
| `unchecked` | `data_nature=inferred` 或 `input_source=ai` | AI 推断且未确认 |
| `disputed` | `review_status=disputed` 或 `corrections > 5` | 有争议 |

**统计资格双口径**：

| 口径 | 排除规则 | 用途 |
|------|----------|------|
| `display` | cancelled + period_rule | 面向用户展示 |
| `insight` | display + unchecked + inferred + 非"发生/总结"类型 | 面向统计分析 |

### 2.5 规则中心与计算中心

**规则中心（RULES）** — 5 大模块声明层：

| 模块 | 管辖范围 |
|------|---------|
| record_type | 记录类型枚举 + 旧类型映射 |
| parsing | 时间锚点、情绪/能量/体态、量化模式、类型关键词 |
| classification | 自动归类阈值（0.85） |
| lifecycle | 终态列表、data_nature 枚举、period 频率 |
| fallback | 降级参数（低置信度 0.7、降级置信度 0.3） |

**计算中心（COMPUTATION）** — 4 大子模块声明层：

| 子模块 | 管辖范围 |
|--------|---------|
| metrics | 活跃度权重、停滞阈值 |
| time_windows | 热力图 180 天、对比 7/30 天 |
| data_scope | 活跃事项状态、停滞 14 天 |
| comparison | 时间分布区间（早/午/晚/夜） |

---

## 三、API 接口说明

### 3.1 录入管线 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/inputs` | POST | 创建 input + LLM 清分 + 直入库或返回 pending |
| `/api/v2/inputs/[id]/answer` | POST | 澄清答题（split/keep_single/defer/cancel/confirm/rewrite） |
| `/api/v2/inputs/[id]/skip` | POST | 跳过澄清 + partial 入库 |
| `/api/v2/inputs/[id]/cancel` | POST | 整单取消 |
| `/api/v2/inputs/[id]/reparse` | POST | 重新解析 |
| `/api/v2/inputs/import` | POST | 批量导入 |

### 3.2 记录 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/records` | GET | 查询记录列表 |
| `/api/v2/records` | POST | 创建记录 |
| `/api/v2/records/[id]` | GET | 获取记录详情 |
| `/api/v2/records/[id]` | PUT | 更新记录 |
| `/api/v2/records/[id]` | DELETE | 删除记录 |
| `/api/v2/records/[id]/correct` | POST | 纠错（触发回归测试+规则学习） |
| `/api/v2/records/[id]/explain` | GET | 记录溯源/统计资格说明 |
| `/api/v2/records/[id]/complete` | POST | 完成记录 |
| `/api/v2/records/[id]/postpone` | POST | 推迟记录 |
| `/api/v2/records/[id]/cancel` | POST | 取消记录 |
| `/api/v2/records/batch` | POST | 批量创建 |
| `/api/v2/records/batch-delete` | POST | 批量删除 |
| `/api/v2/records/confirm` | POST | 确认记录 |
| `/api/v2/records/link` | POST | 关联记录 |

### 3.3 事项/子项/阶段 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/items` | GET/POST | 事项列表/创建 |
| `/api/v2/items/[id]` | GET/PATCH/DELETE | 事项详情/更新/删除 |
| `/api/v2/items/[id]/goal-engine` | GET | 事项级目标引擎 |
| `/api/v2/sub-items` | GET/POST | 子项列表/创建 |
| `/api/v2/sub-items/[id]` | GET/PATCH/DELETE | 子项详情/更新/删除 |
| `/api/v2/sub-items/[id]/promote` | POST | 子项晋升 |
| `/api/v2/phases` | GET/POST | 阶段列表/创建 |
| `/api/v2/phases/[id]` | GET/PATCH/DELETE | 阶段详情/更新/删除 |
| `/api/v2/phases/suggest` | GET | AI 阶段建议 |
| `/api/v2/item-folders` | GET/POST | 文件夹列表/创建 |
| `/api/v2/item-folders/[id]` | GET/PUT/DELETE | 文件夹详情/更新/删除 |

### 3.4 目标 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/goals` | GET/POST | 目标列表/创建 |
| `/api/v2/goals/[id]` | GET/PATCH/DELETE | 目标详情/更新/删除 |
| `/api/v2/goals/[id]/confirm` | POST | 确认目标（draft → active） |
| `/api/v2/goals/[id]/engine` | GET | 目标引擎计算结果 |
| `/api/v2/goals/parse` | POST | AI 解析自然语言生成目标 |

### 3.5 洞察与统计 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/insights` | GET | 洞察数据查询 |
| `/api/v2/insights/polish` | POST | LLM 润色洞察摘要 |

### 3.6 AI 解析 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/parse` | POST | 语义解析（含 10 阶段 Pipeline 可选） |
| `/api/v2/optimize-input` | POST | 模糊输入优化 |

### 3.7 可观测性/工程 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/diagnose?trace_id=xxx` | GET | 诊断 API（断点+决策+修复建议+AI摘要） |
| `/api/v2/diagnose/trends` | GET | 错误聚类趋势 |
| `/api/v2/corrections/trends` | GET | 纠错趋势统计 |
| `/api/v2/debug/lookup` | GET | 调试查找 |
| `/api/v2/errors` | GET/POST | 错误上报与查询 |
| `/api/v2/diagnostics/integrity` | GET | 数据完整性诊断（13 项检查） |
| `/api/health` | GET | 健康检查（DB + migrations + 速率限制） |

### 3.8 其他 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v2/tags` | GET/POST | 标签列表/创建 |
| `/api/v2/tags/[id]` | GET/PATCH/DELETE | 标签详情/更新/删除 |
| `/api/v2/user-rules` | GET/POST/PUT/DELETE | 用户规则完整 CRUD |
| `/api/v2/record-days` | GET/POST | 记录日列表/创建 |
| `/api/v2/record-days/[id]` | GET/PUT/DELETE | 记录日详情/更新/删除 |
| `/api/v2/record-links` | POST | 记录关联 |
| `/api/v2/export/records` | GET | 记录导出 |

### 3.9 API 契约

所有 V2 API 遵循统一 Envelope 格式：

```typescript
// 成功
{ ok: true, data: T, meta: { traceId, apiVersion, serverTimestamp, ruleVersion?, computationVersion? }, warnings? }

// 夙误
{ ok: false, error: { errorCode, message, details? }, meta: { traceId, apiVersion, serverTimestamp } }
```

响应头含 `X-Trace-ID`，error_code 遵循 `ERR-DOMAIN-NNN` 格式（27 个，覆盖 13 个域）。

---

## 四、数据模型

### 4.1 核心数据表

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   inputs     │────→│   input_units     │────→│   records    │
│  (输入态)    │ 1:N │   (解析态)        │ 1:1 │  (正式态)    │
└─────────────┘     └──────────────────┘     └──────┬──────┘
       │                                             │
       │                                             │ 1:N
       │                                     ┌───────▼───────┐
       │                                     │  corrections   │
       │                                     └───────────────┘
       │
       │                                     ┌───────────────┐
       │                                     │  record_links  │
       │                                     └───────────────┘
       │
       │                                     ┌───────────────┐
       │                                     │  record_days   │
       │                                     └───────────────┘
```

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│  items   │────→│  sub_items    │     │   phases     │     │  goals  │
│          │ 1:N │              │     │              │     │         │
└────┬─────┘     └──────────────┘     └─────────────┘     └─────────┘
     │
     ▼
┌──────────────┐
│ item_folders │
└──────────────┘
```

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  trace_summaries  │     │  decision_logs    │     │  feature_flags  │
└──────────────────┘     └──────────────────┘     └─────────────────┘

┌──────────────────┐     ┌──────────────────┐
│     errors        │     │    user_rules     │
└──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│      tags         │     │  corrections     │
└──────────────────┘     └──────────────────┘
```

### 4.2 核心表字段说明

**records 表** — 正式记录，三层九组结构：

| 层 | 组 | 关键字段 |
|----|-----|---------|
| L1-A 原文组 | 这是什么？ | content, raw_input, input_source |
| L1-B 主表达组 | 说了什么？ | main_text, type_hint |
| L2-A 时间组 | 什么时候？ | occurred_at, occurred_at_end, time_text, time_precision, time_anchor_date |
| L2-B 发生主干组 | 做了什么？ | action_text, event_text, object_text |
| L2-C 状态组 | 运转如何？ | status |
| L2-D 结果组 | 结果怎样？ | outcome_type, outcome_direction, result |
| L2-E 因果组 | 因为什么？ | cause_text |
| L2-F 地点组 | 在哪里？ | location, place_type |
| L2-G 量化组 | 多少？ | cost, money_direction, money_currency, metric_value/unit/name, duration_minutes |
| L2-H 人物组 | 和谁？ | people, relation_roles |
| L3-A 情绪组 | 感受如何？ | mood, energy, body_state |
| L3-B 组织组 | 管理状态？ | review_status, confidence_level, data_nature, input_id, input_unit_id, record_quality_tag, trust_level |
| L3-C 关联组 | 属于哪里？ | item_id, sub_item_id, phase_id, linked_record_id, batch_id |

**inputs 表** — 输入态容器：

| 字段 | 说明 |
|------|------|
| client_session_id | 前端会话卡标识 |
| metadata | 含 date、primary_unit_id |
| status | pending / clarifying / completed / partial / cancelled |
| raw_input | 用户原始输入文本 |

**input_units 表** — 解析态单元：

| 字段 | 说明 |
|------|------|
| input_id | 所属 input |
| unit_index | 子句序号 |
| proposed_fields | LLM 解析后的字段提案（JSON） |
| pending_question | 待澄清问题（JSON） |
| classifier_decision | 分类决策（含 decisions、confidence） |
| status | pending_clarify / ready / promoted / partial / cancelled |

**corrections 表** — 纠错记录：

| 字段 | 说明 |
|------|------|
| record_id | 被纠错的记录 |
| decision_id | 绑定的原始决策 ID |
| decision_type | 决策类型 |
| rule_id | 关联的规则 ID（学习后回填） |
| field_corrected | 纠错字段名 |
| old_value / new_value | 旧值/新值 |
| input_id | 关联的输入 ID |
| trace_id | 追踪 ID |

**trace_summaries 表** — 操作追踪摘要：

| 字段 | 说明 |
|------|------|
| trace_id | 追踪 ID（格式 T-YYYYMMDD-xxxxxx） |
| operation | 操作类型 |
| status | ok / failed / partial |
| total_duration_ms | 总耗时 |
| span_count | span 数量 |
| error_code | 错误码 |

**decision_logs 表** — 决策日志：

| 字段 | 说明 |
|------|------|
| decision_id | 决策 ID（格式 DEC-TYPE-xxxxxx） |
| decision_type | 决策类型 |
| trace_id / span_id | 关联追踪 |
| input_summary / output_summary | 输入输出摘要 |
| confidence | 置信度 |
| rule_ids | 关联规则 ID 列表 |

### 4.3 SQL 迁移历史

| 版本 | 迁移范围 |
|------|---------|
| 1.0 | 001-003：基础表结构 |
| 1.1-1.4 | 004-015：三层九组字段 + 规则/计算中心 + 目标引擎重构 + RLS 索引 |
| 1.6 | 016-026：corrections + trace_summaries + decision_logs + feature_flags + inputs + input_units + schema 对齐 + errors |

---

## 五、用户界面功能

### 5.1 记录页（/records）

**QuickInput**（54.4KB 主组件）：

- 自然语言输入框，支持日历日期选择和手动事项选择
- 提交后显示 `parsing` 会话卡（AI 解析中脉冲动画）
- 解析完成后：
  - 无需澄清：会话卡移除，时间轴显示正式记录
  - 需要澄清：显示澄清面板，支持 answer/skip/defer/cancel
- 复合句：SplitPreviewPanel 展示拆分结果，逐条预览
- 澄清面板：ClarificationDialog，按 clarify_class 分支显示不同 UI
- 语义芯片：ParsedChip 组件，支持点击编辑、回车确认、Esc 取消

**RecordList**（11.6KB）：

- 时间轴视图，按日分组展示记录（DayRecordGroup）
- 会话卡状态：parsing / awaiting_confirmation / deferred / cancelled / failed
- 筛选栏：FilterBar 支持按事项、类型、日期范围过滤

**RecordEditDrawer**（60.0KB）：

- 侧边抽屉，支持编辑所有三层九组字段
- 分类选择、时间选择、事项关联、量化编辑等

**RecordItem**（16.6KB）：

- 单条记录的展示卡片
- L2/L3 字段以胶囊标签形式展示
- 失败记录红底 + "失败"徽章

### 5.2 事项页（/items）

**ItemsClient**（36.9KB）：

- 事项列表，支持文件夹分组展示
- 事项状态色标识（活跃/推进中/放缓/停滞/已搁置/已完成）
- 事项创建和编辑

**事项详情页**（63.4KB）：

- 子项管理（SubItemTabBar / SubItemForm / SubItemPromoteDialog）
- 阶段管理（PhaseList / PhaseCard / PhaseForm / PhaseSuggest）
- 目标管理（UnifiedGoalPanel / GoalSection / GoalCard / GoalForm / GoalPicker）
- 时间线视图（ItemTimeline）
- 数据面板（ItemDataPanel）
- 目标引擎仪表盘（GoalEngineDashboard）
- 历史导入（HistoryImport）

### 5.3 洞察页（/insights）

**InsightsClient**（6.6KB）：

- 日期范围选择器（DateRangeSelector）
- 活跃度热力图（ActivityHeatmapPanel）
- 时间分布图（TimeDistributionPanel）
- 周期对比（PeriodComparisonPanel）
- 事项活跃度（ItemActivityPanel）
- 事实溯源（FactSourcePanel）
- 洞察摘要（InsightSummaryPanel）
- 目标进度（GoalProgressPanel）
- 纠错趋势（CorrectionsTrendsPanel）
- 数据审核（DataReviewPanel）
- 今日/昨日时间线（TodayTimelinePanel / YesterdayTimelinePanel）

### 5.4 调试页（/debug）

目录存在但页面未实现（TETO 1.6 局限）。

---

## 六、工程特性

### 6.1 设计令牌系统

**tokens.json** — 唯一设计变量来源：

- **color**：brand(3) + status(6) + confidence(3) + trust(4) + semantic(4) + neutral(10)
- **font**：family(2) + size(7) + weight(4)
- **spacing**(8) + **radius**(5) + **shadow**(3) + **opacity**(3) + **motion**(3+3)
- **zIndex**(7) + **breakpoint**(5) + **icon**(5) + **chart**(6+3) + **surface**(4+3)

**loader.ts** — Tailwind CSS extend 转换器：

- `tailwindExtend()`：自动生成 Tailwind 配置
- `token(path)`：便捷访问单个令牌值
- 前缀 `teto-`：如 `teto-trust-trusted`、`teto-confidence-high`

### 6.2 功能开关

**feature_flags 表 + isFeatureEnabled()**：

- 30s 缓存避免每次查 DB
- 基于 userId 哈希的确定性灰度分流
- DB 不可用时所有开关默认关闭（安全降级）
- 首批开关：`new_parse_engine`(false)、`debug_trace_page`(false)、`computation_v2`(false)

**Ingest V2 开关**（ingest-v2.ts）：

- 环境变量 `INGEST_V2` / `NEXT_PUBLIC_INGEST_V2` 控制
- 开发模式默认开启
- 生产环境查 `feature_flags.ingest_v2`
- 关闭时前端阻断 + 服务端返回 403

### 6.3 诊断 API

**GET /api/v2/diagnose?trace_id=T-xxx**：

- `DiagnosisResult` 结构：
  - `breakPoint`：断点定位（Stage + span_id + error_code + input/output 摘要）
  - `spans`：完整 span 树
  - `relatedDecisions`：关联决策（从 decision_logs 表查询）
  - `relatedRules`：关联规则
  - `suggestedFixes`：修复建议（error_code → 目标文件/函数映射）
  - `aiPromptSummary`：大模型友好一行摘要

**GET /api/v2/diagnose/trends**：

- 按 error_code 聚类统计
- 显示趋势（rising/falling/stable）

### 6.4 健康检查

**GET /api/health**：

- 总体状态：healthy / degraded / unhealthy
- 检查项：database 连接延迟 + migrations 执行状态
- 速率限制：每分钟 60 次
- 不暴露内部配置（连接串、API key）

### 6.5 Eval Harness

```
eval/
├── harness.config.ts — 配置（baseUrl、timeout、目录路径）
├── runners/
│   ├── api-runner.ts — API 契约测试（3 endpoint）
│   └── ingest-runner.ts — Ingest golden 用例回放
├── test-cases/
│   ├── from-production/ — 纠错自动生成
│   ├── golden/ — 4 个手工 golden 用例
│   └── regression/ — 手动回归测试
└── scenarios/scenario-templates/
```

### 6.6 AI 降级模式

当 LLM 不可用时，系统通过 `parse-rules-fallback.ts` 提供本地规则解析：

- 4 种降级触发：ai_timeout / ai_error / ai_unavailable / api_key_missing
- 覆盖：时间锚点、情绪推断、体态检测、记录类型推断、花费/时长/指标模式
- 降级置信度 0.3（vs 正常 0.7+）

### 6.7 数据完整性诊断

**GET /api/v2/diagnostics/integrity**：

- 13 项检查：记录类型验证、生命周期状态、引用完整性、周期规则、数据性质、时间精度等

### 6.8 Domain 不变量体系

9 个 Domain 层文件实现完整的记录安全网：

| 模块 | 功能 |
|------|------|
| record-service.ts | createRecordSafely / updateRecordSafely |
| record-invariants.ts | 记录字段约束验证 |
| record-lifecycle-invariants.ts | 生命周期状态转换验证 |
| relation-invariants.ts | 关联关系完整性验证 |
| ai-write-policy.ts | AI 字段所有权策略（80+ 字段规则） |
| field-ownership-policy.ts | 应用所有权规则过滤 AI 更新 |
| record-ai-service.ts | 安全 AI 增强包装 |

---

## 七、当前版本状态

### 7.1 TETO 1.6 已实现功能

**核心功能**：

- [x] 三态输入管线（inputs → input_units → records）
- [x] 自然语言 AI 解析 + 复合句拆分 + 渐进式澄清
- [x] 四维事项结构（事项 → 子项 → 阶段 → 目标）
- [x] 目标引擎（3 种规则类型 + 统一计算）
- [x] 洞察统计（热力图 + 时间分布 + 周期对比 + 事实溯源）
- [x] 三层九组记录数据模型
- [x] 规则中心 + 计算中心声明层

**1.6 工程特性**：

- [x] 12 种编号体系（trace_id / span_id / decision_id / error_code / rule_id 等）
- [x] 结构化 Logger（替代 console.log）
- [x] API 统一 Envelope（ApiSuccess/ApiError + trace_id）
- [x] 诊断 API（断点 + 关联决策 + 修复建议 + AI 摘要）
- [x] 可信度分级（4 级） + 统计资格双口径
- [x] 纠错闭环（corrections + 回归测试 + 规则学习）
- [x] 功能开关（feature_flags + 灰度分流）
- [x] 设计令牌（tokens.json + Tailwind loader）
- [x] Eval Harness（目录 + runner + golden 用例）
- [x] 健康检查端点
- [x] AI 降级模式
- [x] 数据完整性诊断
- [x] Domain 不变量体系
- [x] 行为编号注册表（B-001 ~ B-064）
- [x] Error Code 注册表（27 个，覆盖 13 域）
- [x] 10 阶段 Agent Pipeline 类型定义
- [x] Tool Protocol 类型定义
- [x] Domain Registry（6 active + 6 reserved）

### 7.2 TETO 1.6 未完成功能

**1.6 计划但未实现**：

- [ ] 10 阶段 Pipeline 接入 QuickInput 主链（当前仅 classify-input 精简链）
- [ ] Debug Trace 页面（/debug/trace 目录存在但无页面）
- [ ] ViewModel/DTO 层（presentation/ 目录为空）
- [ ] API 日期版版本化（Stripe 式 version-router 未实现）
- [ ] 前端全面迁移到 api/client.ts（部分组件仍用 fetch）
- [ ] WebSocket 模拟器
- [ ] npm 测试命令集成（test:contract / test:eval 等）
- [ ] 前端规则管理面板
- [ ] 被动规则学习阈值真实数据验证
- [ ] 端到端运行验收

**已知 gap**：

- [ ] selectedDate 与 classify 日期不一致（用户选非今天时 AI 锚点可能按服务器当天）
- [ ] `saved` 生命周期状态仅类型存在，代码无赋值路径
- [ ] Input/InputUnit `failed` 状态类型存在但主链不写入
- [ ] `ai_failed` record_quality_tag 类型存在但从未赋值
- [ ] `rewrite` 与 `cancel` 后端等价，前端提示可能误导
- [ ] Ingest V2 关闭时无 fallback 到 /api/v2/parse 机制
