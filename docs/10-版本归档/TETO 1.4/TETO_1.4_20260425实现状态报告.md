# TETO 1.4 实施情况报告

> 生成时间：2026-04-26
> 数据来源：SQL 迁移脚本 001-014、TypeScript 类型定义、API 路由代码、前端组件代码、1.4 全部规划文档

---

## 总览：1.4 计划做什么

TETO 1.4 的核心定位是**在 1.3「记录—事项—洞察」骨架上，补上「阶段」和「历史导入」能力，同时深化记录的语义解析**。

1.4 的工作可分为三大块：

| 板块 | 核心问题 | 对应文档 |
|------|----------|----------|
| **一、前部分相关** | 事项—阶段—目标—文件夹的完整闭环 | 《1.4 开发清单 前部分》P0-P8 |
| **二、记录相关** | 记录语义解析引擎、时间锚点、复合句拆分、AI 集成 | 《1.4 后部分清单》《人生记录语法引擎》《语义引擎底层结构》 |
| **三、实现相关** | 以上规划在代码中的实际落地状态 | SQL 迁移、TS 类型、API 路由、前端组件 |

---

## 一、前部分相关

> 对应文档：《TETO 1.4 开发清单 前部分》P0-P8
> 核心目标：事项—阶段—目标—文件夹的完整闭环

### 1.1 计划做什么

| 编号 | 任务 | 核心内容 |
|------|------|----------|
| P0 | 清理 1.3 旧代码 | 删除旧页面、旧 API、旧 DB 操作层、旧类型定义 |
| P1 | 事项核心能力增强 + 桌面图标/文件夹组织 | 事项白板化、is_pinned、folder_id、文件夹 CRUD |
| P2 | 事项—阶段闭环 | 阶段必须挂事项、创建/查看/编辑/删除阶段、阶段聚合数据 |
| P3 | 独立目标对象 | goals 表独立于 items、measure_type(boolean/numeric)、目标归属事项/阶段 |
| P4 | 历史导入能力 | 两条路径：A) 具体历史记录导入 → records；B) 历史阶段补录 → phases |
| P5 | 事项中历史+当前统一回看 | 事项详情页同时展示历史阶段和当前阶段的数据 |
| P6 | 增强洞察 | 洞察页增加阶段洞察、目标洞察、事项画像、时间分布、跨事项对比 |
| P7 | 只做网页端闭环 | 三页在 Web 端形成完整使用闭环 |
| P8 | 清理无用代码 | 清理新增功能中的临时代码 |

蓝图定义的 4 条验收链路：
1. **日常链路**：记录 → 关联事项 → 查看事项聚合
2. **阶段链路**：事项 → 创建/查看阶段 → 阶段数据看板
3. **历史链路**：事项 → 导入历史记录 → 补录历史阶段
4. **洞察链路**：洞察页 → 看到阶段存在 → 目标完成率

### 1.2 实际做了什么

| 编号 | 完成度 | 实际落地情况 |
|------|--------|--------------|
| P0 | ⚠️ 部分 | chains 表未 DROP（仅删除了 chain_id 外键）；旧 DB 操作层已替换为新操作层；旧页面已清除 |
| P1 | ✅ 完成 | items 表有 is_pinned、folder_id 字段；item_folders 表已建；ItemFolder 组件存在；事项列表支持文件夹分组；事项可置顶 |
| P2 | ✅ 完成 | phases 表有 item_id NOT NULL（阶段必须挂事项）；PhaseForm/PhaseCard/PhaseList 组件存在；阶段 CRUD API 完整；每个阶段计算 aggregation；PhaseSuggest 组件支持"从记录生成" |
| P3 | ✅ 完成 | goals 表独立；measure_type 支持 boolean/numeric/repeat；item_id/phase_id/sub_item_id 外键完整；GoalForm/GoalCard/GoalEngineDashboard/RepeatGoalCard 组件存在；量化引擎计算差额/完成率/配速/投射 |
| P4 | ✅ 完成 | HistoryImport 组件存在（28.6KB，功能完整）；支持 CSV 模板导入历史记录；支持历史阶段补录；public/templates/history-record-import-template.csv 模板文件存在 |
| P5 | ✅ 完成 | 事项详情页同时展示所有阶段（当前阶段醒目展示 + 历史阶段列表）；每个阶段都有 aggregation 数据看板；is_historical 标记区分历史补录 |
| P6 | ✅ 完成 | 洞察页包含：RecordStats、ItemPortrait（画像卡片）、TimeDistribution、CrossItemComparison、PhaseInsights、GoalInsights；后端 insights.ts 522 行完整实现 |
| P7 | ✅ 完成 | 三页闭环可用：记录页 QuickInput → 事项页关联+阶段+目标 → 洞察页全局统计 |
| P8 | ⚠️ 部分 | items.goal_id 标记为 @deprecated 但仍保留；chains 表未清理 |

**额外实现（文档中未明确列入 P0-P8 但已落地）：**
- 子项(SubItem)系统：sub_items 表（014 迁移）、records.sub_item_id/goals.sub_item_id 外键、SubItemForm/SubItemTabBar/SubItemPromoteDialog 组件、子项升格为独立事项功能
- 重复型目标(repeat)：goals.measure_type 扩展为含 'repeat'、repeat_frequency/repeat_count 字段、RepeatGoalCard 组件
- 记录生命周期：lifecycle_status 字段(active/completed/postponed/cancelled)、完成/推迟/取消 API 端点
- 记录微关联：record_links 表、completes/derived_from/postponed_from/related_to 四种关联类型

### 1.3 还有哪些不完善

| 问题 | 影响 | 优先级 |
|------|------|--------|
| chains 表未 DROP | 废弃表占用空间，可能造成新开发者困惑 | 低 |
| items.goal_id (@deprecated) 未移除 | 旧模型残留，API 仍返回旧 goal 字段 | 中 |
| 013 迁移（语义字段）需确认是否已在 Supabase 执行 | parsed_semantic/linked_record_id/location/people 在 TS 中有定义，013 SQL 已写好，但若未执行则数据无法持久化 | **高** |
| 014 迁移（子项+重复目标）需确认是否已在 Supabase 执行 | sub_items 表和 goals 扩展字段若未执行则子项功能不可用 | **高** |

---

## 二、记录相关

> 对应文档：《1.4 后部分清单》《人生记录语法引擎》《语义引擎底层结构》《1.4 接入 AI 功能》
> 核心目标：从"贴标签"思维升级为"语义解析与关联图谱"思维，定义人生记录的语法（Grammar of Life）

### 2.1 计划做什么

1.4 后部分规划了从"推断发生/计划"到"时间锚点与记录关联"的升级，核心任务：

| 任务 | 内容 | 状态（计划时） |
|------|------|----------------|
| Task A | 发生/计划推断优化 → 时间锚点(Time Anchor)与记录关联 | 待开发 |
| Task B | 心情/能量/状态自动提取 → 记录的语法解构（主谓宾定状补） | 待开发 |
| Task C | 复合句拆分建议 → LLM 按动作主体和时间锚点切分 | 待开发 |
| Task D | 计划类记录日期提醒 → time_anchor.direction=future 时触发提醒 | 搁置 |
| Task G | 洞察增强 | 搁置 |
| Task H | 事项目标字段新增 | 已在 P3 实现 |

**语义引擎五层架构规划**：

| 层 | 内容 | 依赖 |
|----|------|------|
| 第一层：语义模型定义 | ParsedSemantic / ParsedResult TypeScript 类型 | 无 |
| 第二层：解析引擎 | LLM 语义解析 + 规则兜底的双轨管道 | 第一层 + LLM API Key |
| 第三层：数据模型扩展 | records 表新增 parsed_semantic/time_anchor_date/linked_record_id/location/people | 第一层 |
| 第四层：前端交互升级 | QuickInput 语义卡片、记录卡片增强、歧义澄清框 | 第二层 + 第三层 |
| 第五层：API 新增 | /api/v2/parse（已有）、/api/v2/records/link | 第三层 |

**核心原则**：目标与洞察在语义解析稳定前搁置。先打磨"单张照片的要素解析"，再推"相册归类"和"图库洞察"。

### 2.2 实际做了什么

| 规划层 | 完成度 | 落地情况 |
|--------|--------|----------|
| 第一层：语义类型 | ✅ 完成 | `src/types/semantic.ts` 完整实现：ParsedSemantic(含 subject/action/object/time_anchor/location/people/mood/energy/manner/cost/duration/metric/record_link_hint/item_hint/sub_item_hint/shared_context/field_confidence/confidence)、ParsedResult(含 is_compound/units/relations/confidence)、TimeAnchor、SemanticMetric、ClauseRelation、ClarificationNeeded、ClarificationIssue、SharedContextItem、RecordLinkHint。比原始规划更丰富 |
| 第二层：解析引擎 | ✅ 完成 | `src/lib/ai/parse-semantic.ts`(341行)：DeepSeek LLM 语义解析引擎，含完整 System Prompt、复合句拆分、时间锚点识别、关系人/地点/心情/能量提取、置信度分级、record_link_hint/item_hint/sub_item_hint。`src/lib/ai/enhance-record.ts`(378行)：异步 AI 增强管线，自动匹配事项/子项、回写 AI 解析字段、歧义检测与 ClarificationNeeded 返回 |
| 第三层：数据模型 | ⚠️ 代码完成，DB待确认 | 013 迁移 SQL 已写好(parsed_semantic/linked_record_id/location/people + 索引)；011 迁移(time_anchor_date)已写好；TS 类型 Record 接口已包含全部字段；CreateRecordPayload/UpdateRecordPayload 已同步。**关键问题：013 迁移是否已在 Supabase 执行？** |
| 第四层：前端交互 | ✅ 大部分完成 | QuickInput 已集成 enhanceWithAi()；复合句拆分提交模式(splitMode)已实现；AI 歧义澄清框(ClarificationNeeded)已实现；AI 低置信度提示已实现（事项详情页记录弹窗中显示 guessedFields）；记录创建时 fire-and-forget 调用 AI 增强 |
| 第五层：API | ✅ 大部分完成 | `/api/v2/parse` 存在，调用 DeepSeek；`/api/v2/record-links` 存在，CRUD 关联；但"/api/v2/records/link"（按关键词搜索历史记录做匹配）未实现 |

**额外实现（超出原始后部分规划）：**
- sub_item_hint：AI 解析时可推荐子项关联
- shared_context：复合句中无法分配到单一 unit 的修饰语单独存储
- field_confidence：AI 对每个字段的置信度分级（certain/guess），前端可展示红绿灯
- ClarificationNeeded + ClarificationIssue：歧义检测框架，包含 shared_duration/sub_item_ambiguous/low_confidence/item_missing 四种类型
- 记录生命周期闭环：计划→完成(complete)、推迟(postpone)、取消(cancel) 三个端点

### 2.3 还有哪些不完善

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 013 迁移未确认执行 | parsed_semantic/linked_record_id/location/people 数据写入后会被 Supabase 静默丢弃 | **最高** |
| 011 迁移未确认执行 | time_anchor_date 无法持久化 | **最高** |
| 规则兜底层未实现 | LLM 不可用时应 fallback 到增强版 parseNaturalInput，目前无此兜底 | 中 |
| QuickInput 语义卡片 UI 未升级 | 原规划将芯片区升级为"主体行+上下文行+修饰行+数据行+关联行"的语义卡片区，目前仍使用原有芯片式 UI | 中 |
| 记录卡片展示增强未实现 | 原规划在 RecordItem 中展示时间锚点标记、关联链接、关系人标签、地点标签，目前未展示 | 中 |
| /api/v2/records/link（按关键词搜索历史记录）未实现 | record_link_hint 搜索关联记录需前端自行处理 | 低 |
| Task D（计划类记录日期提醒）搁置 | time_anchor.direction=future 时的提醒机制未实现 | 低 |
| 人生维度/方向/属性 | 后部分逻辑文档中提到"后续要加人生维度、方向、属性"，尚未规划 | 低 |

---

## 三、实现相关

> 1.4 全部规划在代码中的实际落地状态总览

### 3.1 数据库层

**SQL 迁移清单（001-014）：**

| 迁移 | 内容 | 关键变更 | 执行状态 |
|------|------|----------|----------|
| 001 | 1.3 核心表 | record_days, items, chains, records, tags, record_tags | ✅ 已执行 |
| 002 | 废弃 chain 结构 | 删除 chain_id 外键 | ✅ 已执行 |
| 003 | 阶段与目标 | phases, goals 表 | ✅ 已执行 |
| 004 | 记录类型收敛 | type CHECK → '发生/计划/想法/总结'，新增 cost | ✅ 已执行 |
| 005 | 中文化迁移 | status/字段值中文化 | ✅ 已执行 |
| 006 | 事项文件夹 | item_folders 表 | ✅ 已执行 |
| 007 | 记录量化字段 | metric_value/metric_unit/metric_name/duration_minutes | ✅ 已执行 |
| 008 | 记录关联与批次 | record_links 表, raw_input, batch_id, lifecycle_status | ✅ 已执行 |
| 009 | 事项模块升级 | items.is_pinned/goals.item_id/phases.goal_id反转/records.phase_id/goals.measure_type+target_value | ✅ 已执行 |
| 010 | 目标引擎字段 | goals.metric_name/unit/daily_target/start_date/deadline_date | ✅ 已执行 |
| 011 | 时间锚点日期 | records.time_anchor_date | ⚠️ 需确认 |
| 012 | 修复 goals 约束 | goals_measure_type_check 修复 | ✅ 已执行 |
| 013 | 语义解析字段 | records.parsed_semantic/linked_record_id/location/people + 索引 | ⚠️ 需确认 |
| 014 | 子项+重复目标 | sub_items 表, records.sub_item_id, goals.sub_item_id/repeat_frequency/repeat_count, measure_type扩展含repeat, records.item_id FK改ON DELETE SET NULL | ⚠️ 需确认 |

**当前所有表（10 张有效 + 1 张废弃）：**

| 表名 | 状态 | 用途 |
|------|------|------|
| record_days | ✅ 有效 | 按天容器 |
| items | ✅ 有效 | 事项/主题容器 |
| chains | ❌ 废弃 | 事件链（未 DROP） |
| records | ✅ 有效 | 记录（最小单位） |
| tags | ✅ 有效 | 标签 |
| record_tags | ✅ 有效 | 记录-标签关联 |
| goals | ✅ 有效 | 目标 |
| phases | ✅ 有效 | 阶段 |
| record_links | ✅ 有效 | 记录微关联 |
| item_folders | ✅ 有效 | 事项文件夹 |
| sub_items | ✅ 有效(014) | 子项（行动线） |

**records 表关键字段达标检查：**

| 字段 | DB列存在 | TS类型定义 | 说明 |
|------|-----------|-------------|------|
| item_id | ✅ | ✅ | 1.3 原生 |
| phase_id | ✅ | ✅ | 009 迁移 |
| goal_id | ✅ | ✅ | 003 迁移 |
| sub_item_id | ✅(014) | ✅ | 014 迁移 |
| raw_input | ✅ | ✅ | 008 迁移 |
| lifecycle_status | ✅ | ✅ | 008 迁移 |
| time_anchor_date | ⚠️(011) | ✅ | 需确认执行 |
| parsed_semantic | ⚠️(013) | ✅ | 需确认执行 |
| linked_record_id | ⚠️(013) | ✅ | 需确认执行 |
| location | ⚠️(013) | ✅ | 需确认执行 |
| people | ⚠️(013) | ✅ | 需确认执行 |
| metric_value/unit/name | ✅ | ✅ | 007 迁移 |
| duration_minutes | ✅ | ✅ | 007 迁移 |
| cost | ✅ | ✅ | 004 迁移 |
| batch_id | ✅ | ✅ | 008 迁移 |

### 3.2 API 层

**已实现的 /api/v2/ 路由：**

| 模块 | 路由 | 方法 | 说明 |
|------|------|------|------|
| **记录** | /records | GET/POST | CRUD + 筛选(item_id/type/tag_id/date/search) |
| | /records/[id] | GET/PUT/DELETE | 单条操作 |
| | /records/[id]/complete | POST | 完成→生成发生记录+completes关联 |
| | /records/[id]/postpone | POST | 推迟到新日期+postponed_from关联 |
| | /records/[id]/cancel | POST | 取消计划 |
| | /records/batch-delete | POST | 批量删除 |
| **事项** | /items | GET/POST | CRUD + 筛选(status/is_pinned/folder_id) |
| | /items/[id] | GET/PUT/DELETE | 详情含 phases/goals/aggregation/sub_items |
| | /items/[id]/goal-engine | GET | 事项级量化引擎计算 |
| **阶段** | /phases | GET/POST | CRUD |
| | /phases/[id] | PUT/DELETE | 编辑/删除 |
| **目标** | /goals | GET/POST | CRUD + 筛选(status/item_id/phase_id) |
| | /goals/[id] | GET/PUT/DELETE | 单条操作 |
| | /goals/[id]/engine | GET | 单目标量化引擎计算 |
| **子项** | /sub-items | GET/POST | CRUD |
| | /sub-items/[id] | PUT/DELETE | 编辑/删除 |
| | /sub-items/[id]/promote | POST | 升格为独立事项 |
| **解析** | /parse | POST | DeepSeek LLM 语义解析 |
| **洞察** | /insights | GET | 全局洞察数据 |
| **其他** | /tags | GET/POST | 标签 |
| | /record-days | GET/POST | 按天容器 |
| | /record-links | POST | 记录微关联 |
| | /item-folders | GET/POST/PUT/DELETE | 文件夹 |

**事项详情 GET /items/[id] 返回的完整数据结构：**
- Item 基本信息含 is_pinned/folder_id/icon
- phases[]：每个含 aggregation + goals[]
- goals[]：事项级全部目标
- sub_items[]：子项列表
- aggregation：{ total_cost, total_duration_minutes, metric_summaries[], record_count }
- recent_daily_stats[]：近期每日统计
- goal (deprecated)：旧模型向后兼容

### 3.3 前端层

**页面路由：**

| 页面 | 入口组件 | 说明 |
|------|----------|------|
| /records | RecordsClient.tsx | 记录页（单日/多天模式、QuickInput） |
| /items | ItemsClient.tsx | 事项列表页（白板+文件夹） |
| /items/[id] | page.tsx(877行) | 事项详情页（5大区域+弹窗层） |
| /insights | InsightsClient.tsx | 洞察分析页（8个区块） |

**事项详情页 5 大区域：**
1. Header：事项名称/状态/描述 + 数据条(时长/花费/记录数/阶段数/指标) + 操作按钮(记一笔/目标/阶段/历史导入/编辑/删除)
2. 数据总览：基础趋势(ItemDataPanel) + 子项标签页(SubItemTabBar) + 目标进度(GoalEngineDashboard + ItemGoalSection)
3. 阶段管理：当前阶段醒目展示 + 历史阶段列表 + "从记录生成"入口(PhaseSuggest) + "新建阶段"入口
4. 时间线：ItemTimeline 组件（阶段标记行 + 记录行交错展示）
5. 弹窗层：记录详情/PhaseForm/GoalForm/SubItemForm/SubItemPromoteDialog/HistoryImport/PhaseSuggest

**洞察页 8 个区块组件：**
RecordStats、ItemPortrait、TimeDistribution、CrossItemComparison、PhaseInsights、GoalInsights、DateRangeSelector、ItemStats

**QuickInput AI 集成：**
- 用户输入 → 解析数值型数据(金额/时长/指标) → 提交记录
- 提交后异步 enhanceWithAi() → enhanceRecord() → DeepSeek API
- AI 回写：item_id/sub_item_id 自动匹配、metric/cost/duration/location/people/parsed_semantic/time_anchor_date/mood/energy 回填（仅填空，不覆盖手动值）
- 复合句拆分：splitMode + splitPreview + 逐条/全部提交
- 歧义澄清框：ClarificationNeeded → shared_duration/sub_item_ambiguous/low_confidence/item_missing

### 3.4 AI 引擎实现

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/lib/ai/parse-semantic.ts` | 341 | DeepSeek LLM 语义解析引擎：System Prompt + 复合句拆分 + 时间锚点 + 关系人/地点/心情/能量 + 置信度分级 + item_hint/sub_item_hint |
| `src/lib/ai/enhance-record.ts` | 378 | 异步 AI 增强：自动匹配事项/子项 + 回写解析字段 + 歧义检测(ClarificationNeeded) |
| `src/types/semantic.ts` | 106 | 语义引擎类型：ParsedSemantic/ParsedResult/TimeAnchor/SemanticMetric/ClarificationNeeded/RecordLinkHint |

---

## 四、综合评估

### 4.1 完成度总览

| 板块 | 完成度 | 评价 |
|------|--------|------|
| 一、前部分相关(P0-P8) | **90%** | P1-P7 全部落地；P0/P8 部分完成（chains未DROP、goal_id未移除）；额外实现子项系统和重复型目标 |
| 二、记录相关(语义引擎) | **75%** | 核心引擎和AI集成已完成；前端展示增强和规则兜底未实现；DB迁移待确认执行 |
| 三、实现相关(代码落地) | **85%** | DB/API/前端三层基本完整；011/013/014迁移待确认执行是最大风险 |

### 4.2 最紧急待办事项

| # | 事项 | 影响 | 行动 |
|---|------|------|------|
| 1 | **确认 011/013/014 迁移在 Supabase 中是否已执行** | 若未执行，语义解析数据、子项功能、时间锚点数据全部无法持久化 | 在 Supabase SQL Editor 中逐个执行，或检查 information_schema.columns 确认 |
| 2 | **清理 chains 表** | 废弃表占用空间 | DROP TABLE chains |
| 3 | **移除 items.goal_id (@deprecated)** | 旧模型残留 | 确认无前端引用后 ALTER TABLE items DROP COLUMN goal_id |

### 4.3 中期待办事项

| # | 事项 | 说明 |
|---|------|------|
| 1 | 规则兜底层实现 | LLM 不可用时 fallback 到增强版 parseNaturalInput |
| 2 | QuickInput 语义卡片 UI 升级 | 芯片区升级为主体行+上下文行+修饰行+数据行+关联行 |
| 3 | 记录卡片展示增强 | 时间锚点标记、关联链接、关系人/地点标签 |
| 4 | /api/v2/records/link 实现 | 按关键词搜索历史记录做匹配 |
| 5 | 事项详情页直接返回关联记录列表 | 当前仅返回 aggregation，查看具体记录需跳转记录页 |

### 4.4 长期搁置事项

| 事项 | 说明 |
|------|------|
| 目标归属自动碰撞 | 记录自动归属目标池（第三阶段） |
| 因果图谱洞察 | 从词云图升级为因果图谱（第四阶段） |
| 人生维度/方向/属性 | 后部分逻辑中提到的全局环境标签 |
| 计划类记录日期提醒 | Task D：time_anchor.direction=future 时的提醒 |
| 移动端适配 | 1.4 明确只做网页端闭环 |
