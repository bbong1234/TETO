# TETO 1.5 项目说明文档

> 生成日期：2026-05-03
> 基于：TETO 1.5 蓝图方案、开发清单、源码分析、SQL 迁移文件

---

## 一、项目完成情况说明

### 1.1 TETO 1.5 实现度总览

| 主线 | 目标 | 实现度 | 说明 |
|------|------|--------|------|
| 录入主线 | 低阻力输入、清分稳定、复合句拆分 | **~75%** | 核心解析引擎和增强管线已完整，模糊输入三分法部分落地 |
| 归类主线 | 记录落到正确事项结构、理由可回显、修正可学习 | **~55%** | AI 归类 + user_rules 基础已落地，规则回显面板和被动学习待完善 |
| 统计总结主线 | 数据可算、洞察可信、对比可追溯 | **~45%** | 洞察数据聚合已成型，NL 润色已实现，统计口径定义层和4主轴尚未系统化 |

**总体评估：TETO 1.5 实现度约 60%，核心管线已贯通但多处增强功能待补齐。**

### 1.2 已完成模块

#### 数据库层（SQL 迁移 001-006 全部执行）

| 迁移 | 内容 | 状态 |
|------|------|------|
| 001_drop_items_goal_id | 移除 items.goal_id，清理旧结构 | ✅ 完成 |
| 002_create_user_rules | 创建 user_rules 表（个性化归类规则） | ✅ 完成 |
| 003_period_rule_and_data_nature | 规律记录字段 + data_nature 字段 | ✅ 完成 |
| 004_record_backbone_fields | 三层九组 Phase 1：18 列主链补齐 | ✅ 完成 |
| 004b_record_alignment | 录入结构对齐（body_state, money_currency 等） | ✅ 完成 |
| 005_record_type_converge_to_four | 记录类型归一化为4种主类型 | ✅ 完成 |
| 006_goal_rule_refactor | 目标系统规则重构（3类规则替代 measure_type） | ✅ 完成 |

#### 语义解析引擎

| 模块 | 文件 | 状态 |
|------|------|------|
| 核心类型定义（三层九组） | `src/types/semantic.ts` | ✅ 完成 |
| DeepSeek LLM 解析 | `src/lib/ai/parse-semantic.ts` | ✅ 完成 |
| AI 增强 + 回写 | `src/lib/ai/enhance-record.ts` | ✅ 完成 |
| 复合句拆分（is_compound / units / relations） | 同上 | ✅ 完成 |
| 置信度分级（field_confidence） | 同上 | ✅ 完成 |
| 澄清框（ClarificationNeeded） | 同上 | ✅ 完成 |
| 模糊输入检测 | `src/app/api/v2/optimize-input/route.ts` | ✅ 完成 |
| 规则兜底层（AI 降级） | `src/lib/ai/parse-rules-fallback.ts` | ✅ 完成 |

#### 记录 CRUD + API

| 功能 | 端点 | 状态 |
|------|------|------|
| 记录列表（含日期/事项/标签/搜索过滤） | GET /api/v2/records | ✅ 完成 |
| 创建记录（含归属校验 + 异步 AI 增强） | POST /api/v2/records | ✅ 完成 |
| 更新记录（含 time_anchor_date 重归属） | PUT /api/v2/records/[id] | ✅ 完成 |
| 删除记录 | DELETE /api/v2/records/[id] | ✅ 完成 |
| 批量创建（历史导入） | POST /api/v2/records/batch | ✅ 完成 |
| 批量删除 | POST /api/v2/records/batch-delete | ✅ 完成 |
| 记录完成 | POST /api/v2/records/[id]/complete | ✅ 完成 |
| 记录推迟 | POST /api/v2/records/[id]/postpone | ✅ 完成 |
| 记录取消 | POST /api/v2/records/[id]/cancel | ✅ 完成 |
| 语义解析 | POST /api/v2/parse | ✅ 完成 |
| 记录关联（record_links） | POST/GET /api/v2/record-links | ✅ 完成 |

#### 事项 + 子项 + 阶段 + 目标

| 功能 | 文件/端点 | 状态 |
|------|-----------|------|
| 事项 CRUD（含软删除、同名归档检查） | `src/lib/db/items.ts` | ✅ 完成 |
| 子项 CRUD（含 promote 升格） | `src/lib/db/sub-items.ts` | ✅ 完成 |
| 阶段 CRUD（含 suggest AI 建议） | `src/lib/db/phases.ts` | ✅ 完成 |
| 目标 CRUD（含确认草稿、规则重构） | `src/lib/db/goals.ts` | ✅ 完成 |
| 统一目标引擎（3类规则计算） | `src/lib/db/goal-engine.ts` | ✅ 完成 |
| 目标 AI 解析 | POST /api/v2/goals/parse | ✅ 完成 |

#### 洞察系统

| 功能 | 文件 | 状态 |
|------|------|------|
| 洞察数据聚合（时间线/热力图/事项活动/目标进度/时间分布/周期对比/数据待整理） | `src/lib/db/insights.ts` | ✅ 完成 |
| NL 润色（LLM 表达层） | `src/app/api/v2/insights/polish/route.ts` | ✅ 完成 |

#### 其他

| 功能 | 文件 | 状态 |
|------|------|------|
| 标签 CRUD | `src/lib/db/tags.ts` | ✅ 完成 |
| 文件夹 CRUD | `src/lib/db/item-folders.ts` | ✅ 完成 |
| 用户规则 CRUD | `src/lib/db/user-rules.ts` | ✅ 完成 |
| 记录导出 | `src/app/api/v2/export/records/route.ts` | ✅ 完成 |
| 事项详情页（61.5KB 大页面） | `src/app/(dashboard)/items/[id]/page.tsx` | ✅ 完成 |

### 1.3 待完成项（按开发清单 P 编号）

| 编号 | 任务 | 当前状态 | 差距 |
|------|------|----------|------|
| P1 | 规则兜底层（parse-rules-fallback.ts） | ✅ 已完成 | 本地规则兜底已实现并接入 enhance-record 降级链路 |
| P2 | QuickInput 语义卡片 UI 升级 | ⚠️ 部分 | 需验证卡片结构是否已升级为主体行+上下文行+修饰行+数据行+关联行 |
| P3 | 记录卡片展示增强 | ⚠️ 部分 | 需验证 time_anchor 标记、record_links 可视化、关系人/地点标签 |
| P4 | AI 判断理由回显 | ⚠️ 部分 | parsed_semantic 中有 field_confidence，但前端回显面板待确认 |
| P5 | 计划类记录日期提醒 | ❌ 未实现 | 无提醒机制，计划记录已可创建但到达日无通知 |
| P7 | 概括性历史识别和保存 | ⚠️ 部分 | DB 字段就绪（is_period_rule 等），AI prompt 提及 period_rule，但识别准确性待验证 |
| P9 | 模糊输入3类区分 | ⚠️ 部分 | optimize-input API 存在，但 A/B/C 三分法是否完整落地待验证 |
| P10 | 确认分级逻辑 | ⚠️ 部分 | 有 ClarificationNeeded + confidence 机制，但低/中/高风险分级策略未系统化 |
| P11 | AI 降级模式完善 | ❌ 未实现 | 无 parse-rules-fallback，无降级提示 UI |
| P12 | 事项页执行+回看升级 | ✅ 已完成 | 事项详情页含完整执行区：待完成计划、行动线推进、子项Tab、数据总览+目标进度、阶段管理、章节时间线 |
| P13 | 想法→计划/事项转化 | ✅ 已完成 | RecordsClient 含 handleConvertToPlan 和 handleConvertToItem，RecordList 有转化入口 |
| P14 | 非事项数据统计区 | ❌ 未实现 | 洞察页无独立的非事项数据区 |
| P15 | 阶段与执行视图分离 | ❌ 未实现 | 阶段仍与事项档案混在页面中 |
| P16 | 统计4主轴系统化实现 | ❌ 未实现 | 洞察有聚合数据但未按"行动vs目标/时间vs计划/投入vs效果/时间分布"4轴组织 |
| P17 | 洞察固定时间对比 + 可追溯依据 | ⚠️ 部分 | 有 comparison.changes 和 facts，但可追溯性（数据来源链接）待确认 |
| P19 | 自然语言润色 | ✅ 已完成 | insights/polish API 已实现 |
| P20 | 被动规则学习 | ❌ 未实现 | user_rules 表存在，但用户修正时自动写入规则的学习逻辑未实现 |
| P21 | 轻量规则管理面板 | ❌ 未实现 | 无规则管理 UI |
| P22 | 数据导出 | ✅ 已完成 | export/records API 已实现 |
| P23 | 手动导出 + 定期提醒 | ⚠️ 部分 | 导出 API 存在，定期提醒未实现 |

**统计：26 项开发任务中，11 项完成、7 项部分完成、8 项未实现。**

### 1.4 技术债务

| 类别 | 描述 | 严重程度 |
|------|------|----------|
| AI 降级韧性 | parse-rules-fallback 已实现并接入 enhance-record 降级链路 | 已修复 |
| 统计口径 | 无统一定义层，各处计算可能不一致 | 高 |
| 归属校验 | POST/PUT/complete/postpone 已补齐归属校验（含实体有效性验证） | 已修复 |
| 记录类型 DB 约束 | 005 迁移已将 CHECK 收缩为4种主类型 | 已修复 |
| lint 失败 | `next lint` 报 "Invalid project directory"，无法运行 ESLint | 低 |
| items.goal_id 残留 | 已确认无残留，Item 类型和全局代码均无引用 | 已修复 |
| 客户端/服务端 AI 增强竞态 | 已有 enhance=client 和 parsed_semantic 存在检测机制，但竞态窗口仍存在 | 低 |

---

## 二、项目核心逻辑架构

### 2.1 闭环逻辑架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        TETO 1.5 闭环架构                        │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  录入主线  │───→│  归类主线  │───→│  统计主线  │───→│  洞察输出  │  │
│  │          │    │          │    │          │    │          │  │
│  │ 输入→解析 │    │ 事项归类  │    │ 目标引擎  │    │ 事实+NL  │  │
│  │ →清分→增强│    │ 子项归属  │    │ 统计聚合  │    │ 对比+追溯│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               ↑               ↑               │        │
│       │               │               │               │        │
│       └───── 用户修正 ←┘───── 规则沉淀 ←┘───── 反馈回看 ←┘        │
│                   (user_rules)                                   │
└─────────────────────────────────────────────────────────────────┘
```

**核心闭环**：记录(records) → 事项(items) → 阶段(phases) → 目标(goals) → 洞察(insights)

- **记录**是最小数据单元，承载一次发生的全部语义
- **事项**是长期主题，承载一组记录和目标的聚合
- **阶段**是事项内的时间切片，划定一组记录和目标的范围
- **目标**是量化标尺，由引擎从记录流水计算进度
- **洞察**是统计总结的输出层，将数据转为可理解的事实

### 2.2 语义解析引擎架构

```
用户输入 "昨天下午在公司和同事小明开了2小时会，因为客户改需求导致会议太长，花了35元买咖啡"
         │
         ▼
┌─────────────────────────────────────────┐
│  parse-semantic.ts (DeepSeek LLM)       │
│                                         │
│  1. 判定主类型 → 发生/计划/想法/总结      │
│  2. 拆解句子成分 → 核心动词/对象/情境/原因│
│  3. 填入三层九组字段                      │
│  4. 自检 (action_text ≤ 4字等)           │
│  5. 复合句检测 → is_compound=true        │
│                                         │
│  输出: ParsedResult {                    │
│    is_compound: true,                   │
│    units: [Unit0, Unit1],               │
│    relations: [{from:0, to:1, type}]    │
│    confidence: 0.9                      │
│  }                                      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  enhance-record.ts (AI 增强管线)         │
│                                         │
│  1. 读取记录现有值（用于"仅填空"逻辑）     │
│  2. 智能事项匹配 (matchItemSmart)        │
│  3. 子项归属（含歧义检测）                │
│  4. 回写 AI 解析的结构化字段（不覆盖用户值）│
│  5. 歧义检测 → ClarificationNeeded      │
│  6. parsed_semantic 写入（含复合句信号）  │
│  7. time_anchor_date 解析与回写          │
│  8. 反向推算 occurred_at_end            │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  records 表 (Supabase)                  │
│                                         │
│  L1: content, type, raw_input, note     │
│  L2-A: main_text, type_hint             │
│  L2-B: occurred_at, occurred_at_end,    │
│        time_text, time_precision        │
│  L2-D: action_text, event_text,         │
│        object_text                       │
│  L2-F: cause_text                       │
│  L2-G: outcome_type, outcome_direction, │
│        result                            │
│  L2-H: location, place_type, people,    │
│        relation_roles                    │
│  L2-I: cost, money_direction,           │
│        money_currency, metric_*          │
│  L3: mood, energy, body_state, status   │
│  L4: item_id, sub_item_id, phase_id     │
│  L5: parsed_semantic (JSONB)            │
│  规律: is_period_rule, data_nature,      │
│        period_start/end_date, ...       │
└─────────────────────────────────────────┘
```

### 2.3 三层九组模型

TETO 1.5 的记录结构化模型，将一条记录拆解为"三层九组"：

```
┌─────────────────────────────────────────────────────────────┐
│ L1 原始层                                                    │
│   L1-A 原文组: content, raw_input, input_source             │
│   L1-B 主表达: main_text, type_hint                         │
├─────────────────────────────────────────────────────────────┤
│ L2 主链层（可独立统计）                                       │
│   L2-A 时间组: occurred_at, occurred_at_end, time_text,     │
│               time_precision, time_anchor_date              │
│   L2-B 发生主干组: action_text, event_text, object_text     │
│   L2-C 状态组: status (运转状态)                             │
│   L2-D 结果组: outcome_type, outcome_direction, result      │
│   L2-E 因果组: cause_text                                   │
│   L2-F 地点组: location, place_type                         │
│   L2-G 量化组: cost, money_direction, money_currency,       │
│               metric_value/unit/name, duration_minutes      │
│   L2-H 人物组: people, relation_roles                       │
├─────────────────────────────────────────────────────────────┤
│ L3 附属属性层                                                 │
│   L3-A 情绪组: mood, energy, body_state                     │
│   L3-B 组织组: review_status, confidence_level              │
│   L3-C 关联组: item_id, sub_item_id, phase_id,              │
│               linked_record_id, record_link_hint            │
└─────────────────────────────────────────────────────────────┘
```

**设计原则**：
- L2 是可独立统计的核心，AI 解析重点填充 L2
- L3 是主观/附属信息，不做统计口径底座
- 字段边界严格（如 action_text ≤ 4字，mood ≠ cause_text，location 不含状态）
- DB 存英文枚举，前端通过 `*_LABELS` 映射中文

### 2.4 目标引擎架构

```
┌────────────────────────────────────────────────────────────┐
│                    统一目标引擎 (goal-engine.ts)             │
│                                                            │
│  输入: Goal 配置（标尺） + Records 流水（事实）               │
│  输出: GoalEngineResult（进度、配速、差额、超限预警）         │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 一次性完成    │  │ 周期性达成    │  │ 周期性限制    │      │
│  │              │  │              │  │              │      │
│  │ operator:    │  │ period:      │  │ period:      │      │
│  │  >=/<=/=/   │  │  每天/每周/  │  │  每天/每周/  │      │
│  │  between/   │  │  每月        │  │  每月        │      │
│  │  complete   │  │              │  │              │      │
│  │              │  │ 每周期:      │  │ 每周期上限:  │      │
│  │ 累计达到     │  │  达到目标值  │  │  不超target_ │      │
│  │ target_min  │  │  即完成      │  │  max         │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                            │
│  防串库: sub_item_id 精准过滤 + metric_name 辅助校验        │
│  草稿目标: 不参与引擎计算                                    │
│  已完成目标: 数据锁定，仅允许回退状态                         │
└────────────────────────────────────────────────────────────┘
```

**GoalEngineResult 核心字段**：

| 维度 | 字段 | 说明 |
|------|------|------|
| 时间 | total_passed_days, remaining_days | 到 deadline 的剩余天数 |
| 当前周期 | current_period_actual/target/progress | 周期性目标的当期进度 |
| 累计 | total_actual, total_target, deficit | 一次性目标的累计情况 |
| 完成率 | completion_rate, completion_rate_7d/30d | 多窗口完成率 |
| 日均 | daily_average, avg_7d, avg_30d | 多窗口日均 |
| 配速 | dynamic_daily_pacer | 剩余天数需维持的日均 |
| 超限 | is_over_limit, remaining_budget, projected_period_total | 周期性限制专用 |
| 投射 | weekly/monthly_target, weekly/monthly_projection | 周/月预估 |

### 2.5 数据库 Schema 关系图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ record_days │     │    items    │     │item_folders │
│─────────────│     │─────────────│     │─────────────│
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │
│ user_id (FK)│     │ user_id     │     │ user_id     │
│ date        │     │ title       │     │ name        │
│ summary     │     │ status      │     │ color       │
└──────┬──────┘     │ folder_id ──┼────→│ sort_order  │
       │            │ is_pinned   │     └─────────────┘
       │ 1:N        └──┬──┬──┬────┘
       │               │  │  │
       ▼               │  │  │
┌─────────────┐        │  │  │        ┌─────────────┐
│   records   │        │  │  │        │   phases    │
│─────────────│        │  │  │        │─────────────│
│ id (PK)     │        │  │  │        │ id (PK)     │
│ user_id     │        │  │  │        │ user_id     │
│ record_day_id┼───────┘  │  │        │ item_id ────┤──┐
│ content     │           │  │        │ title       │  │
│ type        │◄──────────┘  │        │ status      │  │
│ item_id ────┤              │        │ is_historical│  │
│ sub_item_id │──┐           │        └─────────────┘  │
│ phase_id    │  │           │                         │
│ occurred_at │  │           │        ┌─────────────┐  │
│ action_text │  │           │        │  sub_items  │  │
│ event_text  │  │           │        │─────────────│  │
│ object_text │  │           │        │ id (PK)     │  │
│ outcome_*   │  │           └───────→│ item_id     │  │
│ cause_text  │  │                    │ title       │  │
│ cost        │  └───────────────────→│ sort_order  │  │
│ metric_*    │                       └─────────────┘  │
│ duration_*  │                                        │
│ mood/energy │        ┌─────────────┐                 │
│ location    │        │    goals    │                 │
│ people      │        │─────────────│                 │
│ parsed_     │        │ id (PK)     │                 │
│  semantic   │        │ user_id     │                 │
│ time_anchor │        │ item_id ────┤─────────────────┘
│ data_nature │        │ phase_id    │
│ is_period_* │        │ sub_item_id │──┐
│ batch_id    │        │ title       │  │
│ lifecycle_* │        │ goal_text   │  │
│ review_*    │        │ rule_type   │  │
└──────┬──────┘        │ operator    │  │
       │               │ period      │  │
       │               │ target_min  │  │
       │               │ target_max  │  │
       │               │ deadline    │  │
       │               │ source      │  │
       │               │ status      │  │
       │               └─────────────┘  │
       │                                │
       │ N:M          ┌─────────────┐   │
       ├─────────────→│record_links │   │
       │              │─────────────│   │
       │              │ source_id   │   │
       │              │ target_id   │   │
       │              │ link_type   │   │
       │              └─────────────┘   │
       │                                │
       │ N:M          ┌─────────────┐   │
       ├─────────────→│ record_tags │   │
       │              │─────────────│   │
       │              │ record_id   │   │
       │              │ tag_id ─────┼──→│ tags
       │              └─────────────┘
       │
       │              ┌─────────────┐
       └─────────────→│ user_rules  │
                      │─────────────│
                      │ rule_type   │
                      │ trigger_    │
                      │  pattern    │
                      │ target_id   │
                      │ source      │
                      └─────────────┘
```

**核心关系说明**：
- `records.item_id` → `items.id`（记录归属事项）
- `records.sub_item_id` → `sub_items.id`（记录归属子项，子项必须属于事项）
- `records.phase_id` → `phases.id`（记录归属阶段）
- `records.record_day_id` → `record_days.id`（记录归属日期，time_anchor_date 可跨日期）
- `goals.item_id` → `items.id`（目标归属事项）
- `goals.phase_id` → `phases.id`（目标归属阶段）
- `goals.sub_item_id` → `sub_items.id`（目标归属子项，用于防串库精准过滤）
- `items.folder_id` → `item_folders.id`（事项归属文件夹）
- `record_links`：记录间微关联（completes/derived_from/postponed_from/related_to）

---

## 三、业务流转流程

### 3.1 用户录入流程

```
用户在 QuickInput 输入文本
        │
        ▼
┌───────────────────────────────┐
│  客户端预处理                   │
│  - 是否走 AI 增强？             │
│    enhance=client → 客户端调AI  │
│    enhance≠client → 服务端增强  │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  POST /api/v2/records          │
│  1. 校验 payload               │
│     - content 必填             │
│     - date 必填 (YYYY-MM-DD)  │
│     - type 归一化 (4种主类型)   │
│  2. 校验 item_id 归属          │
│  3. 校验 sub_item_id 归属      │
│     (必须属于 item_id)         │
│  4. 校验 phase_id 归属         │
│     (必须属于 item_id)         │
│  5. createRecord()             │
│     - 自动 upsert record_day   │
│     - time_anchor_date 决定    │
│       record_day 归属          │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  异步 AI 增强                   │
│  enhanceRecord() (catch 静默)  │
│  1. 检查 parsed_semantic 是否  │
│     已存在（避免竞态）          │
│  2. 获取事项列表（活跃/推进中） │
│  3. 获取子项列表               │
│  4. 获取近期记录（3天内30条）   │
│  5. 调用 parseSemantic()       │
│     → DeepSeek API            │
│  6. 智能事项匹配               │
│     matchItemSmart() →         │
│     high confidence 才自动归类  │
│  7. 子项归属（歧义检测）       │
│  8. "仅填空"回写               │
│     - 不覆盖用户手动值          │
│     - 复合句信号存入            │
│       parsed_semantic          │
│  9. 歧义检测 →                 │
│     ClarificationNeeded       │
└───────────────────────────────┘
```

### 3.2 记录生命周期（4 种主类型）

```
                        ┌─────────┐
                        │  发生   │ ← 已发生的事情/状态/体验
                        │ (默认)  │
                        └────┬────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
  ┌──────────┐        ┌──────────┐         ┌──────────┐
  │  计划    │        │  想法    │         │  总结    │
  │ 未来待做  │        │ 念头/观点 │         │ 回顾/归纳 │
  └────┬─────┘        └────┬─────┘         └──────────┘
       │                   │
       │ time_anchor_date  │ 可转计划/事项
       │ direction=future  │ (P13 待实现)
       │                   │
       ▼                   ▼
  ┌──────────┐       ┌──────────┐
  │ 到期提醒  │       │ 转化入口  │
  │ (P5待实现)│       │ (P13待实现)│
  └──────────┘       └──────────┘

lifecycle_status:
  active → completed / postponed / cancelled

type 归一化规则:
  情绪/花费/结果 → 发生 (normalizeRecordType)
```

### 3.3 复合句拆分流程

```
输入: "昨天下午在公司开了2小时会，花了35元买咖啡"

        │
        ▼
┌───────────────────────────────┐
│  parse-semantic.ts            │
│  DeepSeek 判定 is_compound    │
│                               │
│  拆分规则:                     │
│  - 不同动作 → 拆              │
│  - 不同事项 → 拆              │
│  - 不同时间段 → 拆            │
│  - 不同统计对象 → 拆          │
│  - 同一行为补充说明 → 不拆     │
│  - 附属花费 → 不拆            │
│  - "花了X元买Y" → 拆         │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  ParsedResult                 │
│  is_compound: true            │
│  units: [                     │
│    Unit0: 开会 (120min)       │
│    Unit1: 买咖啡 (35元)       │
│  ]                            │
│  relations: [                 │
│    {from:0, to:1,             │
│     type: "parallel"}         │
│  ]                            │
└───────────────────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  客户端/服务端处理              │
│  - 每单元创建一条独立记录       │
│  - 共享属性 (mood/energy/     │
│    body_state) 各 unit 携带   │
│  - 专属属性 (cost/duration/   │
│    metric) 只归属对应 unit     │
│  - batch_id 标记同源拆分       │
│  - parsed_semantic 中记录     │
│    compound_detected 信号     │
└───────────────────────────────┘
```

### 3.4 事项与目标管理流程

```
┌──────────────────────────────────────────────────────────────┐
│                      事项生命周期                              │
│                                                              │
│  创建事项 ──→ 活跃 ──→ 推进中 ──→ 放缓 ──→ 停滞              │
│    │                    │          │         │        │       │
│    │                    │          │         │        │       │
│    │              添加阶段     添加子项    添加目标   │       │
│    │              (phases)   (sub_items)  (goals)    │       │
│    │                    │          │         │        │       │
│    │                    │          │         │        │       │
│    │                    ▼          ▼         ▼        │       │
│    │              ┌──────────────────────────────┐    │       │
│    │              │       事项工作台               │    │       │
│    │              │  - 执行区 (待P12升级)          │    │       │
│    │              │  - 档案区 (记录回看)           │    │       │
│    │              │  - 阶段时间线                  │    │       │
│    │              │  - 目标进度                    │    │       │
│    │              │  - 子项行动线                  │    │       │
│    │              └──────────────────────────────┘    │       │
│    │                                                  │       │
│    └──────────────────→ 已完成 / 已搁置 (软删除)      │       │
│                           - 置空关联记录 item_id       │       │
│                           - 置空关联目标 item_id       │       │
│                           - 置空关联阶段 item_id       │       │
│                           - 物理删除关联子项           │       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      目标引擎流程                              │
│                                                              │
│  Goal (标尺/配置)                                             │
│    │  rule_type: 一次性完成 / 周期性达成 / 周期性限制          │
│    │  operator: >= / <= / = / between / complete             │
│    │  period: 无 / 每天 / 每周 / 每月 / 本周 / 本月          │
│    │  target_min / target_max / deadline                     │
│    │                                                          │
│    +  Records (流水/事实)                                     │
│    │  通过 sub_item_id 精准过滤 + metric_name 辅助校验        │
│    │  草稿目标不参与计算                                       │
│    │                                                          │
│    =  GoalEngineResult                                        │
│       - 完成率 (7d/30d/全期)                                  │
│       - 日均 (7d/30d/全期)                                    │
│       - 配速器 (dynamic_daily_pacer)                          │
│       - 差额 (deficit)                                       │
│       - 超限预警 (周期性限制专用)                               │
│       - 周/月投射                                             │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 AI 语义解析完整流程

```
用户输入
    │
    ├──→ [客户端增强] enhance=client
    │    POST /api/v2/parse → parseSemantic()
    │    获取 ParsedResult → 前端展示解析结果
    │    用户确认/修正 → POST /api/v2/records (带 parsed_semantic)
    │    服务端跳过 AI 增强（alreadyParsed 检测）
    │
    └──→ [服务端增强] (默认路径)
         POST /api/v2/records (不带 parsed_semantic)
         → createRecord() 同步保存
         → enhanceRecord() 异步调用
            │
            ├── 1. 读取记录现有值
            ├── 2. parsed_semantic 已存在？→ 跳过（防竞态）
            ├── 3. 获取事项/子项/近期记录上下文
            ├── 4. parseSemantic(content, date, recentRecords, items, subItems)
            │       │
            │       ├── 构建用户消息（输入 + 近期记忆 + 事项列表 + 子项列表）
            │       ├── 调用 DeepSeek API (model=deepseek-chat, temp=0.1)
            │       ├── 解析 JSON 响应
            │       ├── validateAndFixSemantic() 校验+修正
            │       └── 返回 ParseSemanticResult
            │
            ├── 5. 智能事项匹配
            │       matchItemSmart(hint, items, content)
            │       → confidence=high → 自动归类
            │       → confidence=medium → 跳过（客户端处理）
            │
            ├── 6. 子项归属（含歧义检测）
            │       → 唯一匹配 → 自动赋值
            │       → 多个匹配 → 标记歧义 → ClarificationNeeded
            │       → 0匹配但有子项 → 全部列为候选
            │
            ├── 7. "仅填空"回写
            │       - 每个字段只在原值为空时才覆盖
            │       - 结构化字段: metric, cost, duration, mood, energy,
            │         location, people, action_text, event_text, etc.
            │       - 发生时间推算: duration + occurred_at → occurred_at_end
            │
            ├── 8. parsed_semantic 写入
            │       - 完整 AI 解析结果
            │       - 复合句信号: compound_detected, compound_units_count
            │       - 歧义信号: needs_clarification, clarification_issues
            │
            ├── 9. time_anchor_date 解析
            │       resolveTimeAnchorDate() →
            │       - 前天/昨天/今天/明天/后天...
            │       - X月Y号/日 格式
            │       - 上周/下周/上个月/下个月
            │
            └── 10. 歧义检测优先级
                    1. 共享时长 (shared_duration)
                    2. 子项归属歧义 (sub_item_ambiguous)
                    3. [事项归属已移除，改为手选]
                    4. 低置信度 (confidence < 0.7)
```

### 3.6 洞察生成流程

```
┌──────────────────────────────────────────────────────────────┐
│  GET /api/v2/insights?date_from=...&date_to=...              │
│                                                              │
│  1. 近期时间线 (today + yesterday)                            │
│     - 按 occurred_at 排序的记录时间线                          │
│     - 显示 start_time, end_time, text (action+event)        │
│                                                              │
│  2. 活跃热力图 (180天)                                        │
│     - 每日记录数 → 5级热力 (0-4)                              │
│                                                              │
│  3. 本期摘要 (3-5条核心事实)                                   │
│     - headline_facts: 规则化事实总结                           │
│                                                              │
│  4. 事项活动                                                   │
│     - active_items: 活跃事项记录数/时长                        │
│     - time_ranking: 时间占比排名                               │
│     - stagnant_items: 停滞事项及天数                           │
│                                                              │
│  5. 目标进度                                                   │
│     - 调用 computeGoalEngine() 计算每个目标                   │
│     - GoalProgress: 当期值/目标值/完成率                       │
│                                                              │
│  6. 时间分布                                                   │
│     - morning/afternoon/evening/night 四段                   │
│                                                              │
│  7. 周期对比                                                   │
│     - changes: 与上周/上月的指标变化                           │
│                                                              │
│  8. 数据待整理                                                 │
│     - unassigned/inferred/missing_time/                      │
│       pending_goal_draft 计数                                 │
│                                                              │
│  9. 事实来源 (facts)                                          │
│     - 供 NL 润色用的完整事实列表                               │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  POST /api/v2/insights/polish (可选)                         │
│                                                              │
│  输入: 结构化事实总结 (第一层)                                  │
│  输出: NL 润色后的事实表达 (第二层)                             │
│                                                              │
│  原则: LLM 只负责表达层，不直接充当统计结论生成底座              │
│  风格: 像事实报告，不像聊天；不做建议，只做总结和观察             │
└──────────────────────────────────────────────────────────────┘
```

---

## 附录：技术栈与关键目录

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16.2.0 (App Router, Turbopack) |
| 语言 | TypeScript |
| 数据库 | Supabase (PostgreSQL + RLS) |
| AI | DeepSeek (deepseek-chat, 兼容 OpenAI 格式) |
| 认证 | Supabase Magic Link (DEV_MODE 跳过认证) |
| UI | Tailwind CSS v4, Recharts, @dnd-kit |
| 运行时 | Node.js |

**关键目录结构**：

```
src/
├── app/
│   ├── (dashboard)/          # 受保护页面
│   │   ├── records/          # 记录页
│   │   ├── items/            # 事项页 (含 [id] 详情)
│   │   └── insights/         # 洞察页
│   └── api/v2/               # REST API 端点
│       ├── records/          # 记录 CRUD + complete/postpone/cancel
│       ├── items/            # 事项 CRUD + goal-engine
│       ├── goals/            # 目标 CRUD + parse/confirm/engine
│       ├── phases/           # 阶段 CRUD + suggest
│       ├── sub-items/        # 子项 CRUD + promote
│       ├── parse/            # 语义解析
│       ├── optimize-input/   # 模糊输入检测
│       ├── insights/         # 洞察 + polish
│       ├── export/           # 数据导出
│       ├── user-rules/       # 用户规则
│       └── ...               # tags, record-links, item-folders 等
├── lib/
│   ├── ai/
│   │   ├── parse-semantic.ts # DeepSeek 语义解析引擎
│   │   └── enhance-record.ts # AI 增强管线
│   ├── db/
│   │   ├── records.ts        # 记录 DB 操作
│   │   ├── items.ts          # 事项 DB 操作
│   │   ├── goals.ts          # 目标 DB 操作
│   │   ├── goal-engine.ts    # 统一目标引擎
│   │   ├── phases.ts         # 阶段 DB 操作
│   │   ├── sub-items.ts      # 子项 DB 操作
│   │   ├── insights.ts       # 洞察数据聚合
│   │   ├── user-rules.ts     # 用户规则 DB 操作
│   │   └── ...               # tags, record-days, record-links 等
│   └── supabase/
│       ├── client.ts         # 浏览器端 Supabase 客户端
│       └── server.ts         # 服务端 Supabase 客户端
└── types/
    ├── teto.ts               # 核心域类型定义
    └── semantic.ts           # 语义解析引擎类型定义
```
