# TETO 1.6 完成报告

## 一、版本信息

- 项目名称：TETO
- 版本号：1.6
- 阶段类型：工程底座重构
- 报告性质：真实结项报告
- 对应思路文档：
  - 《TETO 1.6 工程底座重构蓝图 V0.4》
  - 《TETO 1.6 总执行清单》
  - 《TETO 发展规划路线图 Spec v3》
  - 《记录模块实现总结报告》
  - 《记录模块验收验证报告》

---

## 二、结项结论

TETO 1.6 已完成结项。

本阶段的核心不是叠加用户可见功能，而是完成了 **三个质变**：

1. **录入从"直接写记录"升级为"三态输入管线"**——用户输入不再直写 `records` 表，而是先进入 `inputs`（输入态）→ `input_units`（解析态），经分类/澄清/准入门后，才通过 `createRecordSafely` 写入 `records`（正式态）。每条记录携带 `input_id`、`input_unit_id`、`review_status`、`record_quality_tag`、`confidence_level` 五个来源与质量字段。

2. **系统从"无法追踪"升级为"全链路可观测"**——每次请求生成 `trace_id`，关键判断产生 `decision_id`，操作过程产生 `span`，全部持久化到 `trace_summaries` + `decision_logs` 表。诊断 API `/api/v2/diagnose?trace_id=xxx` 一次调用返回断点定位 + 关联决策 + 修复建议 + 大模型友好摘要。结构化 Logger 替代 `console.log`，12 种编号体系覆盖全链路。

3. **纠错从"改一下"升级为"纠错即测试 + 规则学习"**——用户纠错自动生成 `corrections` 记录（绑定 `decision_id`），自动触发回归测试用例写入 `eval/test-cases/from-production/`，异步触发规则学习沉淀为 `user_rules`。每次纠错不再只是修一个值，而是让系统不会再犯同样的错。

当前已确认：

- 三态输入管线已完整落地（inputs → input_units → records）
- 12 种编号体系已完整定义并接入主链路
- 可信度计算引擎 + 统计资格双口径已实现
- 纠错闭环（corrections + 回归测试 + 规则学习）已完整实现
- 诊断 API 已实现（断点定位 + 关联决策 + 修复建议 + AI 摘要）
- API 统一 Envelope + trace_id + 健康检查端点已实现
- 设计令牌系统（tokens.json + Tailwind loader）已实现
- Eval Harness 目录结构 + runner + golden 用例已建立
- 功能开关（feature_flags + 灰度分流）已实现
- 记录模块文档链已收口（实现总结报告 + 验收验证报告 + 文档收口确认）

因此，TETO 1.6 的真实结论是：

> **工程底座重构目标已落地，系统已从"结构化记录 + 声明层架构 + 规则驱动引擎"推进为"三态输入管线 + 全链路可观测 + 纠错即测试"的工程可信系统；录入有了三态生命周期，操作有了 trace + decision + span 全链路追踪，纠错有了自动回归测试 + 规则学习的自改进闭环，统计有了可信度分级 + 双口径资格判定的数据治理。**

---

## 三、1.6 的阶段定位

TETO 1.6 的定位，不是 1.5 的功能补充，而是：

> **对 1.5 稳定化系统的工程底座重构。**

1.5 解决的是"记录内部怎么分层分组、系统参数由谁说了算、目标引擎怎么统一计算"的问题，1.6 解决的是：

- 录入过程到底怎么追踪、怎么保证数据可信（三态管线 + 可信度 + 准入门）
- 出了问题到底怎么定位、怎么不犯同样的错（可观测 + 纠错即测试 + 规则学习）
- API 到底有没有契约、能不能被大模型高效诊断（Envelope + error_code + 诊断 API）
- 系统到底安不安全、功能能不能灰度上线（功能开关 + 安全审计 + 健康检查）

所以 1.6 不是把系统铺宽，而是把系统打稳到"工程可信"的程度。

---

## 四、1.6 的核心变化：三根底梁的架设

### 4.1 旧结构：直写记录 + 无法追踪 + 纠错无沉淀

1.5 及之前，录入、追踪和纠错的结构是：

- 用户输入经 LLM 解析后直接写 `records` 表，没有输入态和解析态
- 一次录入操作没有 `trace_id`，出了问题只能靠时间戳和 console.log 猜
- 用户纠错只是改一个字段值，不产生 corrections 记录，不生成回归测试
- API 响应格式不统一，没有 error_code，没有 trace_id，前端无法追踪
- 统计口径缺少可信度过滤，AI 推断的 unchecked 数据和用户确认的数据一起参与统计
- 功能上线全量推送，没有灰度分流能力

这导致：

- 录入出错无法复现：不知道 LLM 做了什么判断、为什么归到某个事项
- 纠错不可沉淀：用户改了 8 次"跑步归到购物"的错，系统第 9 次还会犯
- 统计口径不可信：AI 低置信度推断和用户确认数据混在一起
- 诊断全靠人工：大模型需要扫描整个项目才能定位一个 bug
- 上线无法灰度：新功能全量上线，出问题全量受影响

### 4.2 新结构：三态管线 + 全链路可观测 + 纠错即测试

1.6 将录入、追踪和纠错同时升级：

**三态输入管线：**

| 态 | 载体 | 说明 |
|----|------|------|
| 输入态 | `inputs` 表 | 一次用户提交的容器，含 `metadata`、`client_session_id`、`primary_unit_id` |
| 解析态 | `input_units` 表 | LLM 解析后的子句单元，含 `proposed_fields`、`pending_question`、`classifier_decision` |
| 正式态 | `records` 表 | 经准入门后的正式记录，含 `input_id`、`input_unit_id`、`review_status`、`record_quality_tag` |

**可信度分级体系：**

| 级别 | 含义 | 来源 |
|------|------|------|
| `trusted` | 用户输入且已确认 | `review_status=confirmed` + `input_source=manual/quick` |
| `reviewed` | 用户修正过 | `corrections > 0` 或 `review_status=corrected` |
| `unchecked` | AI 推断且未确认 | `data_nature=inferred` 或 `input_source=ai` |
| `disputed` | 有争议或过多修正 | `review_status=disputed` 或 `corrections > 5` |

**统计资格双口径：**

| 口径 | 排除规则 | 用途 |
|------|----------|------|
| `display` | `cancelled` + `period_rule` | 面向用户展示 |
| `insight` | display + `unchecked` + `inferred` + 非"发生/总结"类型 | 面向统计分析 |

**编号体系（12 种 ID）：**

| ID 类型 | 格式 | 产生时机 |
|---------|------|----------|
| trace_id | `T-YYYYMMDD-xxxxxx` | 每次用户操作入口 |
| span_id | `SPAN-NN-xxxxxx` | 每个 Pipeline Stage |
| step_id | `LNK-DOMAIN-NNN` | 流水线逻辑步骤 |
| component_id | `CMP-ABBR` | 编译时 |
| behavior_id | `B-NNN` | 函数级追踪 |
| decision_id | `DEC-TYPE-xxxxxx` | 每次关键判断 |
| tool_call_id | `TC-TOOL-xxxxxx` | 每次 Tool 调用 |
| error_code | `ERR-DOMAIN-NNN` | 错误发生时 |
| rule_id | `R-MOD-NNN` | 规则定义时 |
| computation_id | `C-TYPE-NNN` | 指标定义时 |
| input_id | `INP-timestamp-xxxxxx` | 每次用户输入 |
| unit_id | `UNIT-inputId-NN` | 解析后的子句 |

**纠错闭环：**

```
用户纠错 → corrections 记录（绑定 decision_id）
          → trust_level 重算（unchecked → reviewed）
          → 回归测试用例自动生成（eval/test-cases/from-production/）
          → 异步规则学习（3 次同类错误 → 自动沉淀 user_rule）
          → 标记衍生数据需重算（trust / goal / insight）
```

这带来的根本改变：

- 录入不再直写记录，而是经过三态管线，每条记录有明确的来源和质量标签
- 操作全链路可追踪，诊断 API 一次调用定位断点
- 纠错不再只是改值，而是自动沉淀为回归测试和规则学习
- 统计有了可信度分级，AI 低质量数据不污染统计口径
- 功能上线有了灰度分流能力

---

## 五、1.6 的实际完成情况

### 5.1 已完成三态输入管线

#### SQL 迁移层

- 迁移 023：`inputs` 表（input 容器，含 `metadata`、`client_session_id`、`primary_unit_id`）
- 迁移 024：`input_units` 表（解析单元，含 `proposed_fields`、`pending_question`、`classifier_decision`）
- 迁移 025：Schema 对齐（`corrections.user_id`、`review_status='disputed'`、`time_precision='inherited'`、`input_unit_id`、`record_quality_tag`）

#### 类型定义层

- `src/types/inputs.ts`：Input / InputUnit / PendingQuestion / ClarifyClass 完整类型
- `src/types/teto.ts`：Record 新增 `input_id`、`input_unit_id`、`review_status`、`record_quality_tag`、`confidence_level`

#### Ingest Pipeline

- `src/lib/ingest/pipeline.ts`（2.0KB）：`ingestFull` / `ingestLightweight` 入口
- `src/lib/ingest/classifier.ts`（0.6KB）：`classifyForIngest` 转发
- `src/lib/ingest/field-mapper.ts`（2.7KB）：`mapUnitToRecordPayload` 字段映射
- `src/lib/ingest/clarification-planner.ts`（5.3KB）：`ClarificationIssue` → `PendingQuestion` 转换
- `src/lib/ingest/admission.ts`（6.9KB）：`canPromoteUnit` 准入门 + `resolveIssuesAfterField` + `applyFieldAnswerToProposed`
- `src/lib/ingest/ingest-v2.ts`（1.4KB）：Ingest V2 开关（客户端/服务端双判定）

#### 澄清流 API

| API | 功能 |
|-----|------|
| `POST /api/v2/inputs` | 创建 input + 直入库 or 返回 pending |
| `POST /api/v2/inputs/[id]/answer` | 澄清答题 + split/keep_single/defer/cancel |
| `POST /api/v2/inputs/[id]/skip` | 跳过澄清 + partial 入库 |
| `POST /api/v2/inputs/[id]/cancel` | 整单取消 |

#### 记录质量写入矩阵

| 路径 | review_status | confidence_level | record_quality_tag |
|------|---------------|------------------|---------------------|
| 直入库（无澄清） | `confirmed` | `high` | `ai_high` |
| answer 晋升 | `confirmed` | `medium` | `clarified` |
| skip | `unchecked` | `low` | `partial` |

---

### 5.2 已完成编号体系 + Agent Pipeline 类型

#### 编号体系

`src/lib/observability/id-registry.ts`（296 行）完整实现 12 种 ID：

- 运行时生成：`genTraceId`、`genSpanId`、`genStepId`、`genDecisionId`、`genToolCallId`、`genBehaviorId`、`genInputId`、`genUnitId`
- 编译时常量：`ERROR_CODES`（27 个，覆盖 13 个域）、`RULE_IDS`（8 个）、`COMPUTATION_IDS`（7 个）、`MODULE_IDS`（12 个模块）、`COMPONENT_IDS`（8 个组件）、`DECISION_TYPES`（6 种）
- 格式验证：`isValidTraceId`、`isValidSpanId`、`isValidDecisionId`

#### Agent Pipeline 类型

`src/lib/ai/agent-pipeline.ts`（175 行）完整定义：

- `PipelineStage` 枚举（0-9：OBSERVE → INTERPRET → DECOMPOSE → PLAN → VALIDATE → EXECUTE → VERIFY → COMMIT → EXPLAIN → LOG）
- `PipelineContext`、`PipelineStepResult`、`PipelineResult<T>`
- 每阶段输入/输出接口：`ObserveInput/Output`、`InterpretInput/Output`、`DecomposeOutput`、`PlanOutput`、`ValidateOutput`、`ExplainOutput`、`LogOutput`

**注意**：10 阶段 Pipeline 为类型定义 + `parse` 路由可选调用；QuickInput 主链使用 `classify-input` 精简链，不调用 `runPipeline`。

#### Tool Protocol

`src/lib/ai/tool-protocol.ts`（122 行）完整定义：

- `ToolCallInput<T>`（含 `traceId`、`idempotencyKey`、`dryRun`）
- `ToolCallOutput<T>`（含 `errorCode`、`validationResults`、`durationMs`、`spanId`）
- `ITool<TInput, TOutput>` 接口（`invoke` + `validate`）
- `toValidationResults()` 辅助函数

#### Domain Registry

`src/lib/domain/registries/index.ts`（195 行）完整注册 12 个域：

- 6 个 active 域：D-RECORD / D-ITEM / D-GOAL / D-PHASE / D-INSIGHT / D-TAG
- 6 个 reserved 域：D-FINANCE / D-SCHEDULE / D-LOCATION / D-SCORING / D-REVIEW / D-MAP

#### 行为编号注册表

`src/lib/observability/behavior-registry.ts`（92 行）：B-001 到 B-064，覆盖 AI 解析层、领域服务层、统计计算层、目标差额层、洞察层、匹配分类层。

---

### 5.3 已完成结构化 Logger

`src/lib/observability/logger.ts`（193 行）完整实现：

- 5 级日志：debug / info / warn / error / fatal
- `LogEntry` 结构化条目（含 traceId / spanId / stepId / componentId / behaviorId / decisionId / errorCode / stage / userId / inputSummary / outputSummary / durationMs / details）
- 生产环境单行 JSON 输出，开发环境可读格式
- `createComponentLogger(componentId)` 工厂函数

---

### 5.4 已完成 API 契约体系

#### API Envelope

`src/lib/api/types.ts`（122 行）完整定义：

- `ApiSuccess<T>`：`{ ok: true, data: T, meta: ApiMeta, warnings? }`
- `ApiError`：`{ ok: false, error: { errorCode, message, details? }, meta: ApiMeta }`
- `ApiMeta`：`{ traceId, apiVersion, serverTimestamp, ruleVersion?, computationVersion?, spanId? }`

#### Handler Wrapper

`src/lib/api/handler-wrapper.ts`（92 行）完整实现：

- `withTrace(req)`：从请求提取或生成 `trace_id`
- `apiSuccess<T>(data, traceId)` + `apiError(errorCode, message, traceId)` + `apiDomainError(errors, traceId)`
- 响应头自动添加 `X-Trace-ID`

#### 前端统一 API 调用

`src/lib/api/client.ts`（4.7KB）：统一 `api.get<T>()` / `api.post<T>()` / `api.put<T>()`

#### Error Code 体系

`src/lib/observability/error-codes.ts`（266 行）：

- 27 个 error_code，覆盖 13 个域
- `ERROR_CODE_REGISTRY`：每个 error_code 含 severity / message / suggestedFix
- `getErrorInfo(code)` + `getErrorsByDomain(domain)` 查询辅助

#### 健康检查端点

`GET /api/health`（225 行）：

- 总体状态：healthy / degraded / unhealthy
- 检查项：database 连接 + migrations 执行状态
- 速率限制：每分钟 60 次
- 不暴露内部配置

---

### 5.5 已完成数据可信体系

#### 可信度计算

`src/lib/trust/compute-trust.ts`（80 行）：4 级可信度判定，输入 `review_status` + `data_nature` + `input_source` + `confidence_level` + `correctionCount`

#### 统计资格双口径

`src/lib/stats/stats-eligibility.ts`（93 行）：`isEligible(record, caliber)` 双口径判定，含 `DISPLAY_EXCLUSIONS` + `INSIGHT_EXCLUSIONS` 常量

#### 纠错 API

`POST /api/v2/records/[id]/correct`（216 行）完整闭环：

1. `updateRecordSafely` 更新字段
2. `corrections` 记录创建（绑定 `decision_id` + `trace_id` + `input_id`）
3. `generateRegressionTest` + `writeTestCaseToDisk`（纠错即测试）
4. `scheduleRuleLearning`（异步规则学习）
5. `logDecision` + `persistDecisionLog`（决策日志）
6. `markRecordDerivedDataDirty`（标记衍生数据需重算）
7. `persistTraceSummary`（trace 持久化）

---

### 5.6 已完成可观测性体系

#### Trace-Span 构建器

`src/lib/observability/trace.ts`（301 行）：

- `startSpan(traceId, stage, inputSummary)` → `SpanContext`
- `endSpan(context, status, outputSummary, errorCode?)` → `SpanResult`
- `getTraceSummary(traceId)` → `TraceSummary`
- `persistTraceSummary(params)` → 写入 `trace_summaries` 表

#### 决策日志

`src/lib/observability/decision-logger.ts`（261 行）：

- `logDecision(traceId, detail, extra?)`：结构化日志
- `logClassification` / `logItemMatch` / `logFieldChanges`：便捷函数
- `persistDecisionLog(params)`：写入 `decision_logs` 表
- `markRecordDerivedDataDirty(params)`：标记需重算

#### 诊断 API

`GET /api/v2/diagnose?trace_id=T-xxx`（268 行）：

- `DiagnosisResult`：`breakPoint` + `spans` + `relatedDecisions` + `relatedRules` + `suggestedFixes` + `aiPromptSummary`
- 断点定位：找到第一个 failed span
- 关联决策：从 `decision_logs` 表查询
- 修复建议：`ERROR_TO_FIX_MAP` 映射 + 通用兜底
- AI 友好摘要：一行可读文本

#### 错误聚类 API

`GET /api/v2/diagnose/trends`（11.2KB）：按 error_code 聚类统计

#### SQL 表

- 迁移 017：`trace_summaries` 表
- 迁移 018：`decision_logs` 表

---

### 5.7 已完成纠错即测试 + 规则学习

#### 回归测试生成器

`src/lib/correction/regression-test-generator.ts`（103 行）：

- `generateRegressionTest(ctx)` → `GeneratedTestCase`（含 `testCaseId`、`expected`、`actualProduction`、`status='auto_verified'`）
- `writeTestCaseToDisk(testCase)` → 写入 `eval/test-cases/from-production/`

#### 规则学习器

`src/lib/correction/rule-learner.ts`（252 行）：

- `learnRulesFromCorrections(userId)`：分组统计同类错误 → 3 次阈值 → 创建/更新 `user_rule`
- 字段→规则类型映射：`item_id→item_mapping`、`sub_item_id→sub_item_mapping`、`type→type_routing`、其他→`fuzzy_resolution`
- 置信度递增：3-4 次 low → 5-7 次 medium → 8+ 次 high
- `scheduleRuleLearning(userId)`：异步触发，不阻塞主流程

---

### 5.8 已完成设计令牌系统

`src/design/tokens.json`（170 行）：完整设计变量源

- **color**：brand / status(6) / confidence(3) / trust(4) / semantic(4) / neutral(10)
- **font**：family(2) / size(7) / weight(4)
- **spacing**（8）、**radius**（5）、**shadow**（3）、**opacity**（3）、**motion**（3 duration + 3 easing）
- **zIndex**（7）、**breakpoint**（5）、**icon**（5）、**chart**（6+3）、**surface**（4+3）

`src/design/loader.ts`（141 行）：

- `tailwindExtend()`：转换为 Tailwind CSS `extend` 兼容格式
- `token(path)`：便捷访问单个令牌值
- 导出 `tokens` 对象供运行时使用

---

### 5.9 已完成 Eval Harness

`eval/` 目录结构：

```
eval/
├── README.md
├── harness.config.ts（25 行）
├── runners/
│   ├── api-runner.ts（97 行）— API 契约测试（3 endpoint）
│   └── ingest-runner.ts（163 行）— Ingest golden 用例回放
├── test-cases/
│   ├── from-production/（纠错自动生成）
│   ├── golden/（4 个手工 golden 用例）
│   └── regression/（空，待补充）
└── scenarios/scenario-templates/
```

---

### 5.10 已完成功能开关

#### SQL 表

- 迁移 019：`feature_flags` 表（`flag_name`、`enabled`、`description`、`rollout_percentage`），RLS 保护

#### 实现

`src/lib/feature-flags.ts`（90 行）：

- `isFeatureEnabled(flagName, userId?)`：30s 缓存 + 哈希灰度分流
- 首批开关：`new_parse_engine`(false)、`debug_trace_page`(false)、`computation_v2`(false)

---

### 5.11 已完成 SQL 迁移（016-026）

| 迁移 | 内容 |
|------|------|
| 016 | `corrections` 表 |
| 017 | `trace_summaries` 表 |
| 018 | `decision_logs` 表 |
| 019 | `feature_flags` 表 |
| 020 | `input_id` 字段（records + decision_logs） |
| 021 | `corrections.input_id` |
| 022 | `corrections.rule_id` + `decision_type` |
| 023 | `inputs` 表 |
| 024 | `input_units` 表 |
| 025 | Schema 对齐（corrections.user_id、review_status='disputed'、time_precision='inherited'、input_unit_id、record_quality_tag） |
| 026 | `errors` 表 |

---

### 5.12 已完成记录模块文档链

| 文档 | 定位 | 状态 |
|------|------|------|
| 记录模块.md | 产品白话说明 | 保留 |
| 记录模块流程图.md | 理想流程/目标蓝图 | 保留 |
| 记录模块实现总结报告.md | 当前代码实现事实 | 已完成，静态对齐源码 |
| 记录模块验收验证报告.md | 基于实现总结报告的静态验收 | 已完成（3 通过 / 6 部分通过 / 0 未通过） |
| 记录模块文档收口确认.md | 文档链收口说明 | 已完成 |

---

## 六、1.6 阶段完成的核心价值

### 6.1 给录入建了三态管线

1.5 的录入直写 `records` 表。1.6 给它建了三态：`inputs`（输入态）→ `input_units`（解析态）→ `records`（正式态）。每条记录有 `input_id` 追溯来源，有 `review_status`/`confidence_level`/`record_quality_tag` 标记质量，有 `pending_question` 驱动渐进式澄清。录入不再是"一锤子买卖"，而是有生命周期、可追踪、可回溯的结构化过程。

### 6.2 给操作建了全链路追踪

1.5 的操作无法追踪。1.6 的 12 种编号体系让每个操作环节都有 ID：请求有 `trace_id`，阶段有 `span_id`，判断有 `decision_id`，错误有 `error_code`，规则有 `rule_id`，计算有 `computation_id`。诊断 API 一次调用返回断点 + 关联决策 + 修复建议 + AI 摘要。大模型从"全项目扫描"降到"几百 token 定位"。

### 6.3 给纠错建了自改进闭环

1.5 的纠错只是改值。1.6 的纠错闭环让每次纠错自动生成回归测试、异步触发规则学习。3 次同类错误自动沉淀为 `user_rule`，下次同类输入系统不再犯错。纠错不再只是修一个值，而是让系统不可逆地变聪明。

### 6.4 给统计建了可信度过滤

1.5 的统计不过滤数据质量。1.6 的 `computeTrustLevel` + `stats-eligibility` 双口径让统计有门槛：`display` 口径排除取消和规律概括，`insight` 口径额外排除 unchecked/inferred/非发生类型。AI 低质量推断不污染统计口径。

### 6.5 给 API 建了契约层

1.5 的 API 返回格式不统一。1.6 的 `ApiSuccess<T>/ApiError` + `ApiMeta` 统一所有响应，`error_code` 覆盖 13 个域，`handler-wrapper` 自动注入 `trace_id`，前端通过 `api/client.ts` 统一消费。API 终于有了契约。

### 6.6 给系统建了灰度能力

1.5 的功能全量上线。1.6 的 `feature_flags` + `isFeatureEnabled` 让新功能可以按百分比灰度推送，基于 userId 哈希的确定性分流保证同一用户始终走同一条链路。Ingest V2 就是通过功能开关控制的第一个灰度功能。

---

## 七、1.6 从构思到落地的关键演进

### 7.1 三态管线：从直写记录到生命周期管理

1.5 的录入链是 `QuickInput → POST /api/v2/parse → records`。1.6 将其重构为 `QuickInput → POST /api/v2/inputs → inputs/input_units → (澄清) → createRecordSafely → records`。

关键设计决策：
- `inputs` 是一次提交的容器，`input_units` 是 LLM 解析后的子句单元
- 澄清机制由 `PendingQuestion` + `clarify_class` 驱动，不是"确认稿"面板
- 准入门 `canPromoteUnit()` 检查 open issues + 动作模糊度 + 置信度阈值
- 成功入库后会话卡**移除**，而非变为 `saved` 状态

### 7.2 编号体系：从 console.log 到全链路可追踪

1.5 的日志是 `console.log("xxx")`。1.6 的 12 种编号体系让每个操作环节都有机器可解析的 ID。`trace_id` 从客户端生成，随请求传播到服务端，贯穿 span → decision → error_code → rule_id 全链路。诊断 API 聚合这些 ID，让大模型一次调用就能定位问题。

关键设计决策：
- ID 格式固定且 `grep` 友好（`T-20260517-a1b2c3`）
- 编号一旦分配不可修改，只能新增
- `behavior_id`（B-001~B-064）提供函数级追踪，配合 `trace_id` 定位具体调用

### 7.3 纠错闭环：从改值到自改进飞轮

1.5 的纠错只是 `PUT /api/v2/records/[id]`。1.6 的 `POST /api/v2/records/[id]/correct` 触发完整闭环：corrections 记录 → trust 重算 → 回归测试生成 → 规则学习 → 衍生数据标记重算。

关键设计决策：
- `corrections` 表绑定 `decision_id`，建立纠错与原始判断的可追溯链路
- 回归测试 `status='auto_verified'`，因为用户已经人工验证了正确行为
- 规则学习阈值 3 次，置信度随次数递增（3→low, 5→medium, 8→high）
- `scheduleRuleLearning()` 异步执行，不阻塞纠错主流程

### 7.4 功能开关：从全量推送到灰度分流

1.5 的功能要么全开要么全关。1.6 的 `feature_flags` 让新功能按百分比灰度上线，`rollout_percentage=10` 时只有 10% 的用户体验到新功能，`rollout_percentage=100` 时全量推送。

关键设计决策：
- `feature_flags` 表启用 RLS 但禁止客户端直接访问
- 基于 userId 哈希的确定性分流：同一用户始终走同一条链路
- 30s 缓存避免每次请求查 DB
- DB 不可用时所有开关默认关闭（安全降级）

---

## 八、1.6 的局限

### 8.1 10 阶段 Pipeline 未接入 QuickInput 主链（P0-32 部分完成）

10 阶段 `PipelineStage` 枚举和类型定义完整，但 QuickInput 主链使用 `classify-input` 精简链，不调用 `runPipeline`。当前 ingest 链仅在 `createRecordSafely` 使用 `EXECUTE` 阶段的 span。完整的 10 阶段 trace 仅在 `/api/v2/parse` 路由可选触发。

### 8.2 Debug Trace 页面未实现（P0-31）

`/debug/trace` 目录存在但无页面实现。诊断 API 返回的 span 树目前只能通过 API 调用查看，无 Web UI。

### 8.3 ViewModel/DTO 层未定义（P0-11）

`src/lib/api/presentation/` 目录为空。前端仍直接使用 DB Row 类型，未通过 ViewModel 层隔离。API 响应中的 `data` 部分直接返回数据库查询结果。

### 8.4 API 日期版版本化未实现（P0-14）

`apiVersion` 当前使用服务器启动日期作为默认值，未实现 Stripe 式日期版版本路由。`docs/api/CHANGELOG.md` 存在但版本路由逻辑未实现。

### 8.5 前端统一 API 调用未全面迁移（P0-12/P0-13）

`src/lib/api/client.ts` 已实现，但前端组件尚未全面迁移到通过 `api/client.ts` 调用。部分组件仍使用 `fetch()` 直接调用 API。

### 8.6 selectedDate 与 classify 日期不一致（已知 gap）

QuickInput 传 `metadata.date = selectedDate`，但未传 `body.date`。`inputs/route.ts` 使用 `body.date || server today` 传入 `ingestFull`。当用户在非今天日期提交含相对时间表达（"昨天/今天下午"）的输入时，AI 清分锚点可能按服务器当天，与 UI 所选日不一致。

### 8.7 `saved` 生命周期状态未赋值

`SessionLifecycle` 类型含 `saved` 枚举值，但代码中无 `lifecycle: 'saved'` 赋值路径。成功入库后会话卡从 `pendingInputs` 移除，时间轴展示真实 record。

### 8.8 Input/InputUnit `failed` 状态主链不写入

`Input.status` 和 `InputUnit.status` 的类型定义含 `failed`，但 QuickInput 主链无写入 `status: 'failed'` 的代码路径。`failed` 仅在前端会话卡中使用。

### 8.9 `ai_failed` record_quality_tag 定义但未赋值

`RecordQualityTag` 类型含 `ai_failed`，但主链从未赋值。当前只有 `ai_high`、`clarified`、`partial` 三种实际写入值。

### 8.10 WebSocket 模拟器未实现（P1-10）

`src/lib/eval/simulator-server.ts` 未创建。Eval 飞轮的 API 层自动验证能力缺失。

### 8.11 npm 测试命令未集成（P0-34）

`package.json` 中未新增 `test:contract`、`test:eval`、`test:replay`、`diagnose` 等命令。Eval runner 脚本存在但需手动 `npx ts-node` 调用。

### 8.12 端到端运行验收未完成

记录模块验收验证报告的 9 个场景中，3 项代码路径通过、6 项部分通过（缺运行时/UI/DB/LLM 实测），0 项未通过。静态验收通过，但端到端实测未完成。

---

## 九、1.6 完成标准应如何理解

按照 TETO 1.6 总执行清单的 6 条最小可用闭环，1.6 的完成应落在以下事实上：

### 最小闭环 1：前端不再自算聚合指标 ⚠️ 部分

- `stats-eligibility` 双口径已在服务端实现 ✓
- `compute-trust` 可信度计算已在服务端实现 ✓
- 但前端组件尚未全面迁移到 `api/client.ts`，部分仍使用直接 `fetch()` ✗

### 最小闭环 2：API 返回有统一 envelope + trace_id ✓

- `ApiSuccess<T>/ApiError` 类型完整 ✓
- `withTrace()` 自动注入/提取 trace_id ✓
- 新路由（inputs、correct、diagnose、health）已使用 envelope ✓
- 响应头含 `X-Trace-ID` ✓

### 最小闭环 3：一次录入产生完整 trace ✓

- QuickInput 提交时客户端 `genTraceId()` + `jsonHeadersWithTrace` ✓
- `inputs/answer/skip/cancel` 路由均调用 `persistTraceSummary` ✓
- `POST inputs` 批量插入 `decision_logs` ✓
- 但 ingest 链仅 `EXECUTE` 阶段产生 span，非完整 10 阶段 ⚠️

### 最小闭环 4：一个统计指标可 explain ✓

- `explainComputation()` 支持 none/summary/full 三种模式 ✓
- `GET /api/v2/records/[id]/explain` API 已实现 ✓
- 返回 computation_id + 公式摘要 + 排除原因 ✓

### 最小闭环 5：诊断 API 返回结构化根因分析 ✓

- `GET /api/v2/diagnose?trace_id=xxx` 返回 `DiagnosisResult` ✓
- 含 breakPoint + relatedDecisions + relatedRules + suggestedFixes + aiPromptSummary ✓

### 最小闭环 6：一次用户纠错自动生成一个回归测试用例 ✓

- `POST /api/v2/records/[id]/correct` 调用 `generateRegressionTest` + `writeTestCaseToDisk` ✓
- 测试用例写入 `eval/test-cases/from-production/` ✓
- 同时触发 `scheduleRuleLearning` ✓

---

## 十、与 1.5 完成报告的核心对比

| 维度 | 1.5 | 1.6 |
|------|-----|-----|
| 核心任务 | 录入清分与统计口径稳定化 | 工程底座重构 |
| 录入模型 | 直写 records | 三态管线（inputs → input_units → records） |
| 追踪能力 | 无 trace_id，靠 console.log | 12 种编号体系 + 诊断 API + trace/decision 持久化 |
| 纠错 | 仅改字段值 | corrections + 回归测试 + 规则学习闭环 |
| 可信度 | 无分级 | 4 级 trust_level + 双口径 stats-eligibility |
| API 契约 | 格式不统一 | ApiSuccess/ApiError envelope + error_code + trace_id |
| 功能上线 | 全量推送 | feature_flags 灰度分流 |
| 日志 | console.log | 结构化 Logger（JSON + 5 级 + componentId） |
| 设计系统 | 硬编码颜色/字号 | tokens.json + Tailwind loader |
| 测试 | 无系统化 eval | eval/ 目录 + runner + golden 用例 |
| 诊断 | 人工排查 | /api/v2/diagnose + /api/v2/diagnose/trends |
| 健康检查 | 无 | /api/health（DB + migrations + 速率限制） |
| SQL 迁移 | 007-015 | 016-026（11 个新迁移） |
| 变更性质 | 口径稳定化 | 工程底座重构 |

---

## 十一、1.6 之后不应继续做的事

1.6 完成了工程底座重构，但后续不应：

- 在 10 阶段 Pipeline 未接入 QuickInput 前给 Agent 更多自主决策权——精简链和完整链的 gap 需要先闭合
- 在端到端验收未完成前继续叠加新模块——当前 6 个场景仍为"部分通过"
- 在 `presentation/` ViewModel 层空缺时让前端直接消费更多 DB Row——View 层隔离比功能堆砌重要
- 在灰度开关只有 3 个时认为灰度体系已完成——每个新功能都应走 feature flag
- 在规则学习阈值（3 次）未经真实数据验证前调低阈值——过低的阈值会产生噪音规则
- 把三态管线从录入扩展到其他操作（编辑、删除）——当前管线仅服务录入场景
- 在 Debug Trace 页面未实现前诊断 API 只当"数据接口"——UI 化对日常开发效率至关重要

---

## 十二、1.6 之后可以开始做的事

1.6 已把工程底座打稳，后续可以在稳定地基上：

- **1.7 维度分析 + 全链路闭合**：
  - QuickInput 接入完整 10 阶段 Pipeline（闭合 P0-32 gap）
  - Debug Trace 最小页面实现
  - ViewModel/DTO 层建设（`presentation/` 目录填充）
  - 前端全面迁移到 `api/client.ts`
  - selectedDate 日期 gap 修复（前端传 `body.date`）
  - API 日期版版本化实现
  - 统计 4 主轴系统化实现
  - 规则管理面板 UI

- **1.8 规则引擎深化**：
  - 被动规则学习阈值基于真实数据调优
  - WebSocket 模拟器实现
  - npm 测试命令集成
  - Eval 飞轮自动化（定时触发）
  - D-FINANCE / D-LOCATION 域拆分

- **修复已确认 gap**：
  - `saved` 生命周期状态赋值或从类型中移除
  - `Input/InputUnit.failed` 状态写入路径
  - `ai_failed` record_quality_tag 赋值场景
  - `rewrite` 与 `cancel` 后端等价的前端提示改进
  - `Ingest V2` 关闭时的前端 fallback 机制

---

## 十三、最终结论

TETO 1.6 的真实结论：

> **TETO 已从"语法化记录 + 声明层架构 + 规则驱动引擎"推进为"三态输入管线 + 全链路可观测 + 纠错即测试"的工程可信系统。录入有了三态生命周期（inputs → input_units → records），不再是直写记录；操作有了 trace + decision + span 全链路追踪，不再是 console.log 猜谜；纠错有了自动回归测试 + 规则学习的自改进闭环，不再是改一个值就完事；统计有了可信度分级 + 双口径资格判定的数据治理，不再是 AI 低质量数据污染统计口径；API 有了统一契约 + error_code + 诊断 API 的工程规范，不再是格式随意返回；功能上线有了灰度分流的能力，不再是全量推送。工程底座重构目标已落地，核心链路真实可追踪，数据闭环可信可靠。**
