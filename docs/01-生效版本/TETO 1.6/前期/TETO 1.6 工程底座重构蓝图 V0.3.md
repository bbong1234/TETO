# TETO 1.6 工程底座重构蓝图 V0.4

---

## 版本说明

V0.4 在 V0.3 基础上，新增 **D-MAP 域**（地图/LBS 预留注册）、新增**第十八章可观测性增强与自改进自动化工作流**（诊断 API、test_case 自动生成、WebSocket 模拟器、纠错增强、错误聚类 API）、新增 **Anthropic/OpenAI 最佳实践映射附录**、新增 **API 日期版版本化**（Stripe 式）、**健康检查端点** `/api/health`、**数据库 PITR 备份策略**、**功能开关机制**（Feature Flags）。

V0.3 在 V0.2 的 7 个 Block 基础上，新增**顶层架构原则**作为前置宪法，新增**DDD领域边界与编排器**、**Agent计划与执行流水线**、**Eval Harness与自改进飞轮**三个新模块，同时对现有 Block 进行原则对齐修正。

核心变化（V0.4）：
- 新增 D-MAP 域注册（地图/位置服务/地理编码）
- 新增第十八章：可观测性增强与自改进自动化工作流（含诊断 API、test_case 自动生成器、WebSocket 模拟器、纠错增强三个机制、错误聚类 API）
- 新增附录 18.A：Anthropic/OpenAI 业界最佳实践映射表
- 新增第五章：API 日期版版本化设计（Stripe 式 `api_version: "2026-05-04"`）
- 新增第五章：健康检查端点 `GET /api/health`
- 新增第十二章：数据库 PITR 备份与恢复策略
- 新增第十二章：功能开关机制（Feature Flags）

核心变化（V0.3）：
- 新增第零章：10条顶层架构原则（不可违反的约束）
- 新增第一章：架构分层与DDD领域边界
- 新增第二章：Agent编排流水线与Dumb Tools
- 新增第十一章：Eval Harness与自改进飞轮
- 所有现有 Block 增加了"原则对齐"子章节

---

# 第零章：顶层架构原则

> **原则层是写在所有 Block 之上的宪法。它不描述"怎么做"，而是定义"什么绝对不能做"和"什么样的做法才算合格"。违反原则的代码不得合并。**

---

## 原则 1：薄客户端原则（Thin Client）

**陈述**：前端（Web/iOS/任何未来端）是"传菜员"而非"厨师"。客户端唯一职责：展示、交互、收集输入。

**客户端负责**：
- 展示 ViewModel/DTO 数据
- 收集用户输入并传递给 API
- 展示 loading / error / trace / explanation 状态
- 承载端特有交互体验（动画、手势）

**客户端不负责**：
- 自算聚合指标（活跃度、目标进度、投入量等）
- 判断业务规则（置信度阈值、统计资格、字段可信度）
- 执行跨域编排（组合多个 API 的数据）
- 存储业务状态（localStorage 中的业务判断）

**1.6 必须做**：
- 审计所有 React 组件，识别前端自算逻辑并迁移到 Computation Center
- 定义 ViewModel/DTO 规范，API 返回预计算好的展示数据
- 建立 `src/lib/api/presentation/` 承载 ViewModel 转换

---

## 原则 2：Web/iOS 与业务逻辑完全剥离（Platform-Logic Decoupling）

**陈述**：业务逻辑不能写死在 React 组件、React State、React Hook 或任何前端框架中。`src/lib/` 下所有模块必须完全不依赖 React、Next.js、浏览器 API。

**架构要求**：
```
Clients (Web / iOS / Future)
  → Client Adapter（端适配层，只做端特有逻辑）
    → BFF / API Layer
      → Orchestrator
        → Domain Services
          → Rules / Computation / Trust / Trace
            → DB
```

**禁止**：
- React 组件中写 `if (record.confidence > 0.85)` 的业务判断
- React Hook 中做聚合计算
- DB 表结构直接暴露给客户端
- iOS 开发时"把 Web 的业务逻辑翻译一遍"

**1.6 必须做**：
- 确认 `src/lib/` 下零 React 依赖
- 审计 API 返回值，确认走 ViewModel 转换
- 为 iOS 预留 Client Adapter 接口文档

---

## 原则 3：DDD 领域驱动设计——业务域隔离（Domain Isolation）

**陈述**：TETO 不是一个大杂烩 records 系统，而是多个独立业务域通过有序编排协作的系统。每个域有独立模型、表、规则、服务、校验、计算。域间通过事件/引用/编排器发生关系，不直接污染。

**业务域清单**：

| 域编号 | 域名 | 核心职责 | 核心表 | 1.6 状态 |
|--------|------|---------|--------|----------|
| D-RECORD | Record Domain | 记录的创建/更新/删除/字段所有权/生命周期/可信标记 | records, record_days, record_links | 已存在，需闭环 |
| D-ITEM | Item Domain | 事项的分类/状态流转/目标关联 | items, item_folders, sub_items | 已存在，需闭环 |
| D-GOAL | Goal Domain | 目标的创建/更新/规则引擎计算 | goals | 已存在，需闭环 |
| D-PHASE | Phase Domain | 阶段（Sprint）时间盒管理 | phases | 已存在 |
| D-INSIGHT | Insight Domain | 洞察生成/统计查询/对比分析 | (查询聚合) | 已存在，需闭环 |
| D-TAG | Tag Domain | 标签管理 | tags | 已存在 |
| D-FINANCE | Finance Domain | 财务（金额/货币/收支） | (由records.cost承载) | **预留，1.6不拆分** |
| D-SCHEDULE | Schedule Domain | 日程/时间规划 | (由records.time_anchor_date承载) | **预留，1.6不拆分** |
| D-LOCATION | Location Domain | 地理信息 | (由records.location承载) | **预留，1.6预留注册** |
| D-SCORING | Scoring Domain | AI评分/多维打分 | (暂无) | **预留，1.6不实装** |
| D-REVIEW | Review Domain | 复盘/核查/确认 | (暂无) | **预留，1.6不实装** |
| D-MAP | Map/LBS Domain | 地图/位置服务/地理编码 | (暂无) | **预留，1.6预留注册** |

**域间通信规则**：
- 域 A 引用域 B 只能用 ID（如 `item_id`），不能直接访问 B 的内部状态
- 跨域操作必须通过 Orchestrator，不得一个 API handler 同时操作多域表
- 域间数据模型不兼容时，通过 Anti-corruption Layer 隔离翻译

**1.6 必须做**：
- 建立 `src/lib/domain/registries/` 和 Domain Registry 格式
- 审计现有跨域引用，定义契约
- 为预留域注册但不拆分实现

---

## 原则 4：编排器（Orchestrator）模式

**陈述**：用户一句话可能涉及多个业务域。不是"一个大函数乱写所有表"，而是：Agent 解析多意图 → Orchestrator 生成执行计划 → 分发各 Domain → 各 Domain 独立处理 → 汇总响应。

**Orchestrator 职责**：
- 持有"用例知识"：知道"创建记录 + 自动归类 + 刷新目标"的步骤序列
- 协调事务（Saga/最终一致性，不要求原子大事务）
- 持有 Multi-Agent 扩展点

**Orchestrator 不持有**：
- Domain 的内部校验规则（那是 Domain Service 的事）
- 数据库连接和查询（那是 data access layer 的事）

**禁止**：
- API route 直接做跨域组合（route 应该：接收→调 Orchestrator→返回）
- Orchestrator 绕过 Domain Service 校验直接写 DB
- 单个 Domain Service 调用另一个 Domain Service（必须通过 Orchestrator 或事件）

**1.6 必须做**：定义 `src/lib/orchestrators/`，创建 `RecordOrchestrator`

---

## 原则 5：Agent 流水线——从"意图解析器"升级为"计划与执行流水线"

**陈述**：Agent 不再是"调 LLM → 得结果 → 写库"，而是完整的 10 阶段流水线。

**流水线 10 阶段**：

```
Stage 0: OBSERVE    — 接收用户输入，识别来源和格式
Stage 1: INTERPRET  — LLM 语义解析：意图识别、实体提取、时间解析
Stage 2: DECOMPOSE  — 复合意图拆分：一句话拆为多个独立动作
Stage 3: PLAN       — Orchestrator 生成执行计划：Operation[]，确定顺序和依赖
Stage 4: VALIDATE   — 每步计划传入 Domain 做预校验（不写库，只验证可行性）
Stage 5: EXECUTE    — Domain Service 按计划逐项执行写入
Stage 6: VERIFY     — 写入后校验：读回确认数据正确性
Stage 7: COMMIT     — 事务提交 / 关联更新（Goal、Phase、Insight 刷新）
Stage 8: EXPLAIN    — 生成用户可读的解释
Stage 9: LOG        — 生成 trace、decision、error log 记录
```

**禁止**：
- Agent 跳过 Stage 4（VALIDATE）：任何写入前必须经过 Domain 校验
- Agent 跳过 Stage 6（VERIFY）：写入后必须读回确认
- 将 VALIDATE 和 EXECUTE 合并为一个 LLM Tool Call

**1.6 必须做**：在 `src/lib/ai/agent-pipeline.ts` 定义流水线类型和阶段枚举

---

## 原则 6：Smart Agent, Dumb Tools（修正版）

**陈述**：Agent 聪明——理解意图、收集上下文、生成计划、选择工具、给解释。Tool 简单——每个 Tool 只做一件事，输入输出明确，失败返回 error_code。

**关键修正**：校验不能全部交给 Agent！Domain 层必须强制执行硬校验、权限、不变量、事务、幂等、统计资格、RLS。Agent 可以判断，但不能成为唯一防线。

**Tool Protocol**：

```typescript
interface ToolProtocol {
  // 调用方（Agent）提供
  tool_name: string;
  input: strict JSON schema;
  dry_run?: boolean;
  idempotency_key?: string;
  trace_id: string;

  // Tool 返回
  output: strict JSON schema;
  ok: boolean;
  error_code?: string;
  error_message?: string;
  validation_results?: { field, severity, rule_id, message }[];
  duration_ms: number;
  span_id: string;
}
```

**禁止**：
- Tool 内部调用 LLM（不推理，只执行）
- Tool 绕过 Domain 不变量直接调 DB
- Agent 绕过 Tool 直接调 DB
- Agent 的写操作校验只依赖 LLM 判断
- Tool 在 dry_run=true 时产生副作用

**1.6 必须做**：将现有 API 路由重构为 Tool Protocol 兼容格式，确保每个 Tool 入口点强制经过 `record-service.ts`

---

## 原则 7：可观测性与自改进飞轮

**陈述**：完整的编号体系让 AI 和开发者能毫秒级定位问题。形成自改进飞轮。

**编号体系完整清单**：

| 编号类别 | 格式 | 示例 | 产生时机 |
|----------|------|------|----------|
| trace_id | `T-{YYYYMMDD}-{random}` | `T-20260504-a1b2c3` | 每次用户操作入口 |
| span_id | `SPAN-{step}-{random}` | `SPAN-03-d4e5f6` | 每个 Pipeline Stage |
| step_id | `LNK-{DOMAIN}-{seq}` | `LNK-PARSE-002` | 流水线每步 |
| component_id | `CMP-{ABBR}` | `CMP-QI` | 编译时定义 |
| behavior_id | `BEH-{COMP}-{seq}` | `BEH-QI-001` | 用户操作触发 |
| decision_id | `DEC-{TYPE}-{random}` | `DEC-ITEM-a1b2c3` | 每次关键判断 |
| tool_call_id | `TC-{TOOL}-{random}` | `TC-RECORD-d4e5f6` | 每次 Tool 调用 |
| error_code | `ERR-{DOMAIN}-{seq}` | `ERR-CLASSIFY-001` | 错误发生时 |
| rule_id | `R-{MOD}-{seq}` | `R-CL-001` | 规则定义时 |
| computation_id | `C-{TYPE}-{seq}` | `C-GOAL-001` | 指标定义时 |

**自改进飞轮**：
```
生产错误 → trace_id+error_code捕获 → 自动生成test_case
→ 存入Eval Harness → 本地复现 → 修复 → 回归通过
→ 部署 → trace_id验证 → 继续收集
```

**禁止**：
- console.log 直接用于生产日志（必须走结构化 Logger）
- 日志不含 trace_id
- 错误不记录 error_code
- 修复 bug 不补测试用例
- 删除或修改已有 error_code 编号（只能新增）

---

## 原则 8：跨端 Design Token 体系

**陈述**：`tokens.json` 是唯一设计变量来源。Web 和 iOS 从 token 转换器生成平台可用变量。组件不得硬编码颜色、间距、字号。

**Token 分类**：

| 分类 | 1.6 状态 |
|------|----------|
| color / font / spacing / radius / shadow / opacity / motion | 须建立 |
| status（操作状态色） | 关键 |
| confidence（置信度区分） | 关键 |
| trust（数据可信度） | 关键 |
| semantic（语义色：成功/警告/错误/信息） | 须建立 |
| dimension（7维度色） | P2 预留 |

**禁止**：组件硬编码颜色值、字号、间距；不同组件对同一状态使用不同颜色。

---

## 原则 9：逃避填表——No Manual Form Burden

**陈述**：用户优先自然语言输入，系统自动解析。只在关键不确定时追问。能默认就默认，能推断就推断。低置信度标记但不强迫填写。表单只是校正界面，不是主入口。

**禁止**：
- 上线需要手动填写 5 个以上字段的新建表单
- 因低置信度而拒绝写入（只能标记，不能拒绝）
- 在用户没主动打开表单时弹窗要求确认

---

## 原则 10：生产级数据库安全

**陈述**：数据安全包含：RLS 最小权限、所有写操作经过 Domain、禁止 Agent 直接写 DB、migration 只能新增不改旧 SQL、软删除、audit log、decision log、backup/restore、idempotency、transaction、destructive action 二次确认、数据脱敏、生产/测试环境隔离、API rate limit、回滚策略。

**禁止**：
- Agent/Tool 绕过 Domain Service 直接写 DB
- migration 修改已部署的 SQL
- 物理删除用户数据（必须软删除）
- 不记录 audit log 就执行批量操作
- 生产环境 DEV_MODE 生效
- 无幂等保护的写操作

---

## 原则快速索引

| 编号 | 简称 | 一句话 |
|------|------|--------|
| P1 | 薄客户端 | 前端不计算、不判断、不编排 |
| P2 | 平台剥离 | 业务逻辑绝不死在 React/iOS 里 |
| P3 | DDD域隔离 | 12个独立域，高内聚低耦合 |
| P4 | 编排器 | 多域操作由 Orchestrator 协调 |
| P5 | Agent流水线 | 10阶段：Observe→Interpret→...→Log |
| P6 | Smart Agent Dumb Tools | Agent 聪明但 Domain 强制执行校验 |
| P7 | 可观测飞轮 | error→trace→test_case→fix→deploy |
| P8 | Design Token | tokens.json 是唯一设计变量源 |
| P9 | 逃避填表 | 自然语言为主，表单只是校正 |
| P10 | 数据库安全 | RLS+Domain校验+Audit Log+软删除 |

---

# 第一章：架构分层与 DDD 领域边界

## 1.1 完整架构分层图

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTS                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  Web     │  │  iOS     │  │  Future  │                   │
│  │(Next.js) │  │(SwiftUI) │  │  (预留)  │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │              │              │                        │
│  ┌────▼──────────────▼──────────────▼─────────────────────┐  │
│  │              CLIENT ADAPTER LAYER                       │  │
│  │  ViewModel→Platform rendering / NO business logic      │  │
│  └────────────────────────┬───────────────────────────────┘  │
├───────────────────────────┼──────────────────────────────────┤
│                           │  HTTP / WebSocket(预留)           │
│                ┌──────────▼──────────┐                       │
│                │   BFF / API LAYER   │                       │
│                │  - 请求验证          │                       │
│                │  - rate limit       │                       │
│                │  - ViewModel 转换   │                       │
│                │  - trace_id 注入    │                       │
│                └──────────┬──────────┘                       │
│                           │                                  │
│                ┌──────────▼──────────┐                       │
│                │    ORCHESTRATOR     │                       │
│                │  - 用例编排          │                       │
│                │  - 多步执行计划      │                       │
│                │  - 事务协调          │                       │
│                │  - Multi-Agent扩展点│                       │
│                └──┬───────┬───────┬──┘                       │
│                   │       │       │                           │
│    ┌──────────────▼─┐ ┌───▼────┐ ┌▼──────────────┐          │
│    │ RECORD DOMAIN  │ │ ITEM   │ │ GOAL   DOMAIN │  ...     │
│    │  invariants    │ │ DOMAIN │ │  goal-engine  │          │
│    │  lifecycle     │ │  ...   │ │  calc engine  │          │
│    │  trust mark    │ │        │ │  explain      │          │
│    └───────┬────────┘ └───┬────┘ └───────┬────────┘          │
│            │              │               │                   │
│    ┌───────▼──────────────▼───────────────▼──────────────┐   │
│    │             SHARED KERNEL                            │   │
│    │  RULES CENTER / COMPUTATION CENTER / TRUST / TRACE  │   │
│    │  types/teto.ts / domain-errors.ts / date-policy.ts  │   │
│    └────────────────────┬────────────────────────────────┘   │
│                         │                                    │
│                ┌────────▼────────┐                           │
│                │  DATA ACCESS    │                           │
│                │  src/lib/db/    │                           │
│                └────────┬────────┘                           │
├─────────────────────────┼────────────────────────────────────┤
│                ┌────────▼────────┐                           │
│                │   DATABASE      │                           │
│                │   PostgreSQL    │                           │
│                │   (RLS强制)     │                           │
│                └─────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

**层级间调用规则**：上层只能调下层，下层绝不依赖上层。

| 调用方向 | 允许？ |
|----------|--------|
| Client → BFF | ✅ |
| BFF → Orchestrator | ✅ |
| Orchestrator → Domain | ✅ |
| Domain → Shared Kernel | ✅ |
| Domain → Domain | ❌（必须通过 Orchestrator 或事件） |
| Client → Domain | ❌ |
| Client → Shared Kernel | ❌ |
| Client → DB | ❌ |
| Agent → DB | ❌（只能 Tool→Domain→DB） |

## 1.2 共享内核（Shared Kernel）

严格控制范围。共享内核中的变更影响所有依赖方。

| 共享内容 | 类型 | 使用者 |
|----------|------|--------|
| `src/types/teto.ts` | 公共类型 | 所有 Domain、API、Client |
| `RULES` (rules/index.ts) | 声明层 | Record、Item、AI Parsing |
| `COMPUTATION` (computation/index.ts) | 声明层 | Goal、Insight、Item |
| `CORE_METRICS` (metric-definitions.ts) | 声明层 | Goal、Insight、Item |
| `domain-errors.ts` | 基础设施 | 所有 Domain |
| `observability/` (trace/logger/error-codes) | 基础设施 | 所有层 |
| `date-policy.ts` | 工具 | 所有 Domain |
| 编号体系（rule_id/computation_id格式） | 全局约定 | 所有层 |

**禁止进入 Shared Kernel**：单个 Domain 的私有模型、特定校验逻辑、前端 ViewModel。

## 1.3 域间通信契约

```
Domain A  ─── Event ───→  Domain B
   │                         │
   └── ID Reference ────────┘  (只能用ID引用，不能直接访问内部状态)
```

- **Domain Event**：`RecordCreated`、`GoalProgressChanged` 等，有明确 schema
- **ID Reference**：跨域只传 ID，需要对方数据时通过对方公开查询接口获取
- **编排器协调**：需要多域操作的场景，Orchestrator 负责调用各域

---

# 第二章：Agent 编排流水线与 Dumb Tools

## 2.1 Agent Pipeline 10 阶段

```typescript
enum PipelineStage {
  OBSERVE = 0,    // 接收用户输入，识别来源和格式
  INTERPRET = 1,  // LLM语义解析：意图、实体、时间
  DECOMPOSE = 2,  // 复合意图拆分为多个独立动作
  PLAN = 3,       // Orchestrator生成执行计划 Operation[]
  VALIDATE = 4,   // Domain预校验（不写库）
  EXECUTE = 5,    // Domain Service逐项执行写入
  VERIFY = 6,     // 写入后读回确认
  COMMIT = 7,     // 事务提交 / 关联刷新
  EXPLAIN = 8,    // 生成用户可读解释
  LOG = 9,        // 生成trace/decision/error记录
}

interface PipelineStepResult {
  stage: PipelineStage;
  span_id: string;
  input_summary: string;
  output_summary: string;
  status: 'ok' | 'failed' | 'skipped';
  error_code?: string;
  duration_ms: number;
  decision_ids?: string[];
  rule_ids?: string[];
}
```

## 2.2 Dumb Tools 清单

**现有 Tool（从 API 路由提取，1.6 需规范化）**：

| Tool名称 | 对应 API | 职责 | 1.6 状态 |
|----------|----------|------|----------|
| `record.create` | POST /api/v2/records | 创建记录（经过 validate→write→verify） | 需重构 |
| `record.update` | PUT /api/v2/records/[id] | 更新记录字段 | 需重构 |
| `record.delete` | DELETE /api/v2/records/[id] | 软删除记录 | 需重构 |
| `record.complete` | POST .../[id]/complete | 标记完成 | 已有雏形 |
| `record.postpone` | POST .../[id]/postpone | 推迟计划 | 已有雏形 |
| `record.cancel` | POST .../[id]/cancel | 取消计划 | 已有雏形 |
| `parse.semantic` | POST /api/v2/parse | AI语义解析 | 已有 |
| `item.match` | (目前在parse-semantic中内嵌) | 事项匹配 | 需抽取为独立Tool |
| `goal.recalc` | GET /api/v2/goals/[id]/engine | 目标引擎重算 | 已有 |
| `insight.aggregate` | GET /api/v2/insights | 洞察聚合 | 已有 |

**Tool Protocol 适用规则**：
- 每个 Tool 输入/输出有严格 JSON schema
- 支持 `dry_run`（只校验不写入）
- 支持 `idempotency_key`（防重复）
- 失败返回标准 `error_code`
- 执行过程自动进入 trace span
- 关键判断生成 decision_id

## 2.3 Tool 调用必须经过的防线

```
Agent (判断该调用什么Tool)
  → Tool.invoke(input + trace_id + idempotency_key)
    → Domain Service.validate()  ← 防线1：Domain校验（不可跳过）
    → Domain Service.execute()   ← 防线2：业务不变量的最后一次检查
      → Data Access Layer        ← 仅做DB操作
        → PostgreSQL RLS         ← 防线3：数据库级强制
```

**Agent 不直接看到 DB，不直接知道表结构。Tool 不包含推理逻辑。**

---

# 第三章：Block -1 — 项目结构审计

> （保持 V0.2 内容，新增原则对齐检查项）

## 原则对齐：审计增加以下检查项

在原有9类检查项基础上，新增：

### J. 前端自算指标（原则1）
搜索 React 组件中的 `.reduce(`、`.filter(…).length`、`Math.max(` 等聚合模式

### K. 业务逻辑写在组件中（原则2）
搜索组件中的 `if (record.type === '发生' && record.confidence > 0.85)` 等业务判断

### L. 跨域直接引用（原则3）
搜索一个 Domain 文件中对另一个 Domain 表的直接查询

### M. API route 绕过 Orchestrator（原则4）
搜索 route.ts 中直接调用多个不同 Domain 的 db 函数

### N. Tool 绕过 Domain 校验（原则6）
搜索直接 `supabase.from('records').insert` 不走 `record-service.ts` 的调用

（原 V0.2 Block -1 的 A-I 检查项保持，审计输出格式保持，审计门槛保持）

---

# 第四章：Block 0 — 数据可信层

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则1/2**：字段可信度在服务端计算，前端只展示 TrustBadge
- **原则6**：`stats-eligibility` 是 Domain 层硬校验，Agent 不能覆盖
- **原则9**：低置信度标记但不拒绝写入，表单只是校正界面
- **原则10**：corrections 表操作必须经过 Domain 校验

## source_type 枚举（保持V0.2）

```
'user_input' | 'user_confirmed' | 'ai_inferred' | 'fallback' | 'system_computed' | 'derived' | 'imported'
```

## stats-eligibility 双口径（保持V0.2）

- **display**：排除 cancelled，其他全含
- **insight**：排除 unchecked + inferred + cancelled + period_rule + 非"发生/总结"类型

（文件变更清单保持V0.2）

---

# 第五章：Block 1 — 接口契约层

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则1/2**：API 返回 ViewModel/DTO，不直接透传 DB 行
- **原则6**：API 响应兼容 Tool Protocol 格式（ok/error_code/duration_ms）
- **原则7**：所有 API 响应 meta 中必含 trace_id、rule_version、computation_version

## 新增：Presentation Contract 定义

API 返回数据类型从 "DB Row" 升级为 "ViewModel/DTO"：

```
RecordDetailViewModel  — 记录详情（含trust标记、decision摘要）
GoalProgressViewModel  — 目标进度（含computation解释）
InsightCardViewModel   — 洞察卡片（含explanation block数据）
TraceDebugViewModel    — 调试trace（含span树）
```

## 新增：日期版 API 版本化（Date-Based Versioning）

### 设计动机

URL 路径版本化（`/api/v1/`、`/api/v2/`）的痛点：
- 一个大版本号掩盖了"哪个具体行为变更"
- 客户端无法精确指定"我要 2026-03-15 之后的行为"
- 破坏性变更只能通过 v3/v4 大版本表达，激进而低频

**采用 Stripe 式日期版版本化**：API 版本绑定到具体的日期，精确表达行为变更时间点。

### 版本号规则

```
API Version = "YYYY-MM-DD"（即日期，如 "2026-05-04"）
```

- 客户端请求时带 header：`Stripe-Version: 2026-05-04`
- 服务端根据请求版本号选择对应的行为分支
- 如果请求不带版本号，使用**当前最新稳定版本**
- 服务端在响应 meta 中返回实际使用的版本号

### 响应格式

```typescript
// 响应 meta 中始终包含
{
  api_version: "2026-05-04",     // 本次请求实际使用的 API 版本
  api_version_min: "2026-01-01", // 当前支持的最早版本
  api_version_max: "2026-05-04", // 当前最新版本
  api_version_deprecated?: {     // 如果请求版本已废弃
    requested: "2025-06-01",
    deprecated_since: "2026-03-01",
    sunset_date: "2026-09-01",
    migration_link: "/docs/api/migration-guide"
  }
}
```

### 变更日志要求

每次 API 行为变更，必须在 `docs/api/CHANGELOG.md` 中记录：

```markdown
## 2026-05-04
- **Change**: `GET /api/v2/goals/[id]/engine` 现在返回 `computation_id` 字段
- **Change**: `POST /api/v2/records` 的 `type` 字段新增枚举值 `'总结'`
- **Deprecation**: `meta.api_version` 更名为 `meta.api_version_used`（旧字段仍返回 90 天）
```

### 实现方式

```typescript
// src/lib/api/version-router.ts
function resolveApiVersion(requestedVersion?: string): {
  effectiveVersion: string;
  isDeprecated: boolean;
  deprecationWarning?: string;
}

// 在 API handler 中
const version = resolveApiVersion(req.headers.get('Stripe-Version'));
if (version.isDeprecated) {
  // 仍处理请求，但返回 deprecation warning
}
// 根据 effectiveVersion 选择行为分支
```

### 1.6 实施范围

- P0：建立版本号格式规范和 `docs/api/CHANGELOG.md`
- P0：实现 `resolveApiVersion()` 版本解析函数
- P0：所有 API 响应 meta 中新增 `api_version` 字段
- P1：旧版本废弃检测和 deprecation warning
- P2：多版本并行行为分支

### 原则对齐

- **原则1/2**：版本控制在后端，客户端只需传 header
- **原则7**：API 版本号是行为变更的精确时间锚点，诊断时可据此定位问题引入时间

---

## 新增：健康检查端点

### 设计动机

- 部署后快速确认系统可用性
- 监控系统（如 Uptime Robot、Grafana）需要标准健康检查端点
- 大模型或 CI 在开始工作前可先确认服务正常
- 运维排障时需要快速知道"哪个组件挂了"

### API 契约

```
GET /api/health
```

**响应结构**：

```typescript
{
  status: "healthy" | "degraded" | "unhealthy",
  version: "1.6.0",
  uptime_seconds: 123456,
  checks: {
    database: {
      status: "ok" | "error",
      latency_ms: 12,
      error?: string
    },
    llm_api: {
      status: "ok" | "degraded" | "error",
      provider: "deepseek",
      latency_ms: 230,
      error?: string
    },
    migrations: {
      status: "ok" | "pending" | "error",
      last_migration: "016_corrections.sql",
      pending_count: 0,
      error?: string
    }
  }
}
```

### 状态判定规则

| 总体 status | 条件 |
|-------------|------|
| `healthy` | 所有 checks 都 ok |
| `degraded` | LLM API 不可用（可以工作但 AI 解析降级）|
| `unhealthy` | 数据库不可用 或 migration 出错 |

### 安全注意

- 健康检查端点**不暴露内部配置**（数据库连接字符串、API key 等）
- 不暴露当前用户数据或系统负载详情
- 速率限制：每分钟最多 60 次（防止被滥用为探活攻击）

### 1.6 实施范围

- P0：实现 `GET /api/health` 端点（database + migrations 检查）
- P1：LLM API 延迟检查（额外网络请求，独立于主健康检查可禁用）
- P2：磁盘空间、内存使用等系统级检查

### 原则对齐

- **原则10**：不暴露敏感信息，速率限制
- **原则7**：健康检查结果可被监控系统捕获，形成运维可观测性

---

### 新增文件清单（Block 1 补充）

| 操作 | 文件 | 优先级 |
|------|------|--------|
| 新建 | `src/lib/api/version-router.ts` | P0 |
| 新建 | `docs/api/CHANGELOG.md` | P0 |
| 新建 | `src/app/api/health/route.ts` | P0 |

（ApiSuccess/ApiError结构、meta字段规则、error_code体系、迁移顺序保持V0.2）

---

# 第六章：Block 2 — 规则中心闭环

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则3**：RULES 是 Shared Kernel，所有 Domain 平等引用
- **原则6**：每个 Domain InvariantIssue 必须绑定 rule_id
- **原则7**：rule_id 编号体系接入可观测性系统

## rule_id 编号体系（保持V0.2）

R01-R05，5模块，含子编号

（文件变更清单保持V0.2）

---

# 第七章：Block 3 — 计算中心闭环

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则1**：前端不自算，Computation Center 是唯一统计出口
- **原则2**：计算逻辑不依赖 React/浏览器
- **原则3**：CORE_METRICS 是 Shared Kernel
- **原则7**：computation_id 接入编号体系

## computation_id 编号体系（保持V0.2）

C01-C04，4模块，含子编号

## 旧 CORE_METRICS 删除的三步走策略（保持V0.2）

审计→deprecate→迁移→删除

## computation explain 三种模式（保持V0.2）

none / summary / full

## 读取层约束（保持V0.2，补充新增）

**新增检查**：所有跨域统计必须经过 Orchestrator 协调，不得一个 API 直接 JOIN 多域表。

---

# 第八章：Block 4 — 链路追踪

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则5**：每个 Pipeline Stage 产生一个 span
- **原则7**：完整编号体系（trace_id/span_id/step_id/component_id/behavior_id）

## 新增：扩大的编号体系

| 编号 | Block 4 中产生？ | 说明 |
|------|-----------------|------|
| trace_id | ✅ 入口生成 | 一次用户操作一个 |
| span_id | ✅ 每个 stage | 流水线每步 |
| step_id | ✅ 逻辑步骤 | LNK-PARSE-001 等 |
| component_id | ✅ 编译时 | CMP-QI 等 |
| behavior_id | P2 预留 | 用户行为模式 |
| tool_call_id | ✅ Tool调用时 | TC-RECORD-xxx |

## trace 存储策略（保持V0.2 分层存储）

成功→内存 / 错误→trace_summaries(7天) / debug→trace_spans(24h)

---

# 第九章：Block 5 — 决策ID与结构化日志

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则5**：Stage 9 (LOG) 产生 decision + trace + error 记录
- **原则6**：每个 Tool 调用产生 decision_id
- **原则7**：decision_log 是飞轮的燃料
- **原则9**：用户纠错绑定原 decision_id

## 新增：结构化日志的 AI 可搜索设计

```
{
  timestamp, user_id, trace_id, span_id, component_id,
  step_id, decision_id, tool_call_id, error_code,
  severity, input_summary, output_summary, duration_ms,
  related_record_id, related_domain
}
```

这样 AI 诊断时只需提供 `trace_id + error_code`，不需要全项目扫描。

---

# 第十章：Block 6 — 令牌化设计体系

> （保持 V0.2 内容，新增原则对齐）

## 原则对齐

- **原则8**：tokens.json 是唯一设计变量来源
- **原则1/2**：组件不得硬编码颜色/间距/字号

## 新增：跨端 Token 流水线

```
tokens.json (单一真相来源)
  → src/design/token-loader.ts  (Web: CSS变量生成)
  → src/design/token-ios.rb     (iOS: Swift Asset生成，预留)
  → Tailwind v4 theme 配置
  → 组件引用: var(--token-status-pending)
```

---

# 第十一章：Block 7 — Eval Harness 与自改进飞轮（新增）

**优先级：P1（架构预留）、P2（完整实现）**

## 目标

建立从生产错误到测试用例的自动化流水线，形成自改进飞轮。

## Eval Harness 结构

```
eval/
├── README.md                  # Eval框架说明
├── harness.config.ts          # Eval配置
├── test-cases/                # 测试用例
│   ├── from-production/       # 从生产错误自动生成
│   │   └── TCASE-xxx.json     # 每个bug一个test case
│   ├── golden/                # Golden tests（已知正确行为）
│   └── regression/            # 手动编写的回归测试
├── scenarios/                 # 场景定义
│   └── scenario-templates/    # 可复用的场景模板
└── runners/                   # 测试运行器
    ├── api-runner.ts          # API契约测试
    ├── domain-runner.ts       # Domain校验测试
    ├── agent-trajectory.ts    # Agent轨迹测试
    └── ui-snapshot.ts         # UI快照对比（P2预留）
```

## Test Case 格式

```json
{
  "test_case_id": "TCASE-x1y2z3",
  "source": "production_error",
  "source_trace_id": "T-20260504-a1b2c3",
  "source_error_code": "ERR-CLASSIFY-001",
  "description": "事项归类在低置信度下错误地自动归入了不相关事项",
  "input": {
    "user_input": "今天跑步5公里花了20元",
    "user_id": "test-user-id"
  },
  "expected": {
    "pipeline_stages_passed": ["OBSERVE", "INTERPRET", "DECOMPOSE", "PLAN", "VALIDATE"],
    "error_code": null,
    "record_created": true,
    "item_matched": "跑步",
    "item_match_confidence": "> 0.7"
  },
  "actual_production": {
    "error_code": "ERR-CLASSIFY-001",
    "item_matched": "购物",
    "item_match_confidence": 0.45
  }
}
```

## Agent Trajectory Test

不仅检查结果，还检查 Agent 的推理过程：

- 是否正确理解意图？
- 是否拆出多个动作？
- tool call 顺序是否正确？
- 是否该追问却没追问？
- 是否绕过 Domain 校验？
- 是否正确处理时间？

## 自改进飞轮流程

```
生产错误发生
  → trace_id + error_code 被结构化日志捕获
  → 自动生成 test_case JSON → 存入 eval/test-cases/from-production/
  → 本地环境或 CI 复现
  → Agent 根据 test_case 修复代码
  → 回归测试通过
  → 部署上线
  → trace_id 验证问题不再出现
  → 继续收集新的错误...
```

## 1.6 实施范围

- P1：建立 `eval/` 目录结构和 Eval 配置
- P1：建立 test_case 格式规范
- P1：实现 API contract runner（最少）
- P2：完整飞轮自动化
- P2：Agent trajectory test
- P2：WebSocket 模拟器集成
- P2：UI 快照对比

## 文件变更清单

| 操作 | 文件 | 优先级 |
|------|------|--------|
| 新建 | `eval/README.md` | P1 |
| 新建 | `eval/harness.config.ts` | P1 |
| 新建 | `eval/test-cases/from-production/.gitkeep` | P1 |
| 新建 | `eval/scenarios/scenario-templates/` | P2 |
| 新建 | `eval/runners/api-runner.ts` | P1 |
| 新建 | `eval/runners/domain-runner.ts` | P2 |
| 新建 | `eval/runners/agent-trajectory.ts` | P2 |

---

# 第十二章：数据库迁移、兼容与回滚策略

> （保持 V0.2 内容，新增原则10条目）

## 原则对齐（原则10）

- 所有写操作经过 Domain Service
- migration 只能新增不改旧 SQL
- 物理删除改为软删除
- 批量操作记录 audit log
- 生产/测试环境隔离
- 数据脱敏

## 新增安全审计项

- 审计所有 `supabase.from().insert/update/delete` 直接调用，确认全部经过 Domain
- 审计所有 SQL migration 是否只新增不改旧
- 确认软删除覆盖范围（records、items、goals）
- 确认 DEV_MODE 在生产环境不可启用

## 新增：数据库 PITR 备份与恢复策略

### 设计动机

原则10要求"backup/restore + 回滚策略"，但V0.2仅在原则上提及。1.6必须给出具体可执行的备份方案。

### Supabase PITR 确认

TETO 使用 Supabase 托管 PostgreSQL。Supabase Pro/Team 计划提供 **Point-in-Time Recovery (PITR)**：
- 支持回滚到 7 天内任意时间点（精确到秒）
- 在 Supabase Dashboard → Database → Backups 中启用

### 1.6 必做事项

**P0：确认 PITR 已启用**
- 登录 Supabase Dashboard 确认 PITR 状态为 Enabled
- 记录当前计划的 PITR 保留天数

**P0：Migration 前自动备份检查点**
- 每次执行 SQL migration 之前，记录当前时间戳（作为回滚锚点）
- 在 `sql/migrations_history.txt` 中追加一行：`016_corrections.sql | 2026-05-04 14:30:00 UTC | 执行人`
- 如果 migration 后发现问题，可将数据库回滚到该时间戳之前

**P1：备份恢复演练**
- 每季度在 staging 环境执行一次 PITR 恢复演练
- 验证恢复后：① RLS 策略正常 ② 核心 API 可访问 ③ 数据完整性校验通过

**P1：备份恢复文档**
- 编写 `docs/operations/disaster-recovery.md`
- 包含：触发条件（什么情况需要回滚）、回滚步骤、验证步骤、通知模板

### 回滚决策矩阵

| 场景 | 处理方式 | 恢复手段 |
|------|---------|---------|
| Migration SQL 语法错误 | 修复 SQL，新建 migration | 不需要回滚（migration 只新增不改旧） |
| Migration 数据迁移逻辑错误 | **立即回滚到 migration 前时间点** | Supabase PITR |
| Bug 导致数据被批量破坏 | 回滚 + 从 audit_log 补回用户操作 | PITR + audit log 回放 |
| 基础设施故障（Supabase 宕机） | 等待 Supabase 恢复 | Supabase 自带 HA |
| 恶意数据删除 | 回滚 + RLS 审查 | PITR + 安全审计 |

### 原则对齐

- **原则10**：备份策略是数据库安全的最后防线
- **原则7**：回滚操作本身产生 trace 记录（可观测）

---

## 新增：功能开关机制（Feature Flags）

### 设计动机

在零停机前提下安全部署新功能：
- 新功能默认关闭，逐步对用户开放
- 出问题时秒级关闭（不依赖部署回滚）
- 支持按用户/百分比灰度发布
- 1.7 起新功能上线前强制走功能开关

### 数据模型

```sql
-- 新增 migration 019_feature_flags.sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT NOT NULL UNIQUE,       -- 如 'new_parse_engine'
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,                     -- 功能说明
  rollout_percentage INTEGER DEFAULT 100, -- 灰度百分比（0-100）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 安全：仅服务端可读（RLS 禁止所有客户端直接访问）
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
-- 不创建客户端 SELECT policy，只在服务端通过 service_role 访问
```

### 服务端工具函数

```typescript
// src/lib/feature-flags.ts
interface FeatureFlag {
  flag_name: string;
  enabled: boolean;
  rollout_percentage: number;
}

/**
 * 检查功能是否对当前用户启用
 * @param flagName - 功能开关名称
 * @param userId - 用户ID（用于灰度计算）
 * @returns true 表示功能可用
 */
async function isFeatureEnabled(
  flagName: string,
  userId?: string
): Promise<boolean> {
  const flag = await getFlag(flagName);
  if (!flag || !flag.enabled) return false;
  if (flag.rollout_percentage >= 100) return true;
  if (!userId) return false;
  // 基于 userId 哈希的确定性灰度分流
  const bucket = hashUserId(userId) % 100;
  return bucket < flag.rollout_percentage;
}
```

### 使用方式

```typescript
// 在 API route 中
if (await isFeatureEnabled('new_parse_engine', userId)) {
  return newParseEngine(input);
}
return legacyParseEngine(input);
```

### 1.6 实施范围

- **P0**：建立 `feature_flags` 表（migration 019）
- **P0**：实现 `src/lib/feature-flags.ts` 工具函数
- **P1**：1.7 起新功能上线前强制接入功能开关
- **P2**：Admin 面板管理功能开关（可视化开启/关闭/设百分比）

### 1.6 首批开关

| flag_name | 默认值 | 用途 |
|-----------|--------|------|
| `new_parse_engine` | false | 新版 AI 语义解析引擎（1.7） |
| `debug_trace_page` | false | Debug trace 页面（仅开发环境） |
| `computation_v2` | false | Computation Center V2（1.7） |

### 原则对齐

- **原则10**：功能开关表 RLs 禁止客户端直接访问
- **原则7**：开关变更产生 audit 记录
- 不引入第三方服务（LaunchDarkly 等），1.6 阶段用 DB 表足够

### 新增文件清单（第十二章补充）

| 操作 | 文件 | 优先级 |
|------|------|--------|
| 新建 | `sql/019_feature_flags.sql` | P0 |
| 新建 | `src/lib/feature-flags.ts` | P0 |
| 新建 | `sql/migrations_history.txt` | P0 |
| 新建 | `docs/operations/disaster-recovery.md` | P1 |

---

# 第十三章：AI IDE 执行规则

> （保持 V0.2 内容，新增原则违反检测）

## 新增：原则违反自动检测

AI IDE 在每次代码修改前必须检查：

1. 是否在 React 组件中新增了聚合计算？→ 违反原则1
2. 是否在 `src/lib/` 中引入了 React/Next.js 依赖？→ 违反原则2
3. 是否让一个 Domain 文件直接查询另一个 Domain 的表？→ 违反原则3
4. 是否在 API route 中直接操作多个 Domain？→ 违反原则4
5. 是否跳过了 Pipeline Stage 4 (VALIDATE)？→ 违反原则5
6. 是否让 Tool 内部调用 LLM？→ 违反原则6
7. 是否新增了不带 error_code 的错误？→ 违反原则7
8. 是否在组件中硬编码了颜色/间距/字号？→ 违反原则8
9. 是否新增了需要用户手动填写 5 个以上字段的表单？→ 违反原则9
10. 是否绕过了 Domain Service 直接写 DB？→ 违反原则10

**违反任意一条，AI IDE 必须停止并报告。**

（原有执行粒度、禁止操作、强制要求、质量门保持V0.2）

---

# 第十四章：P0 / P1 / P2 优先级总览（整合版）

## P0：必须完成，不做等于白做（30项）

| 编号 | 任务 | 来源 |
|------|------|------|
| P0-01 | 10条顶层架构原则文档定稿 | 新增 |
| P0-02 | Block -1 项目结构审计（含原则违反检测） | 原V0.2 + 新增检查项 |
| P0-03 | API response envelope（ApiSuccess/ApiError） | Block 1 |
| P0-04 | error_code 体系（完整编号） | Block 1 + 原则7 |
| P0-05 | trace_id 基础传播（API handler wrapper） | Block 4 |
| P0-06 | trace-span 构建器 + 分层存储 | Block 4 |
| P0-07 | trace_summaries 表 | Block 4 |
| P0-08 | decision_logs 表（含完整字段） | Block 5 |
| P0-09 | RULES_VERSION + rule_id 编号 | Block 2 |
| P0-10 | COMPUTATION_VERSION + computation_id 编号 | Block 3 |
| P0-11 | 旧 CORE_METRICS → 新 CORE_METRICS 统一（审计→deprecate→迁移） | Block 3 |
| P0-12 | goal-engine 查询口径接入 buildStatsQuery | Block 3 |
| P0-13 | stats-eligibility 统计资格统一判定 | Block 0 |
| P0-14 | 可信度计算（compute-trust.ts） | Block 0 |
| P0-15 | computation explain（none/summary 两种模式） | Block 3 |
| P0-16 | debug trace 最小页面 | Block 4 |
| P0-17 | 至少一个录入链路完整 trace | Block 4 |
| P0-18 | 至少一个统计指标 explain | Block 3 |
| P0-19 | API contract tests（records + parse） | 测试体系 |
| P0-20 | 前端统一API调用封装（api/client.ts） | Block 1 |
| P0-21 | Domain Registry 建立（现有域注册） | 原则3 |
| P0-22 | RecordOrchestrator 基本实现 | 原则4 |
| P0-23 | Agent Pipeline 类型定义（10阶段枚举） | 原则5 |
| P0-24 | Tool Protocol 类型定义 | 原则6 |
| P0-25 | 编号体系完整定义（所有ID格式） | 原则7 |
| P0-26 | 结构化 Logger 实现 | 原则7 |
| P0-27 | tokens.json 第一版（status/confidence/trust/semantic） | 原则8 |
| P0-28 | Shared Kernel 边界文档 | 原则3 |
| P0-29 | 生产级安全审计清单 | 原则10 |
| P0-30 | 审计报告中所有"高"风险项清零 | Block -1 |

## P1：应该完成（20项）

| 编号 | 任务 | 来源 |
|------|------|------|
| P1-01 | 用户纠错 API（records/correct） | Block 0 |
| P1-02 | corrections 表 | Block 0 + 5 |
| P1-03 | field_provenance 运行时计算 | Block 0 |
| P1-04 | trust dashboard API | Block 0 |
| P1-05 | 12个前端组件逐步替换 | 读取层 |
| P1-06 | computation full explain 模式 | Block 3 |
| P1-07 | decision detail 页面 | Block 5 |
| P1-08 | 结构化日志（structured-log.ts） | Block 5 |
| P1-09 | decision 历史 API | Block 5 |
| P1-10 | 第3-5批 API 迁移到新 envelope | Block 1 |
| P1-11 | Eval Harness 目录结构 + 配置 | Block 7 |
| P1-12 | API contract runner | Block 7 |
| P1-13 | test_case 格式规范 + 首批用例 | Block 7 |
| P1-14 | 现有 API 路由重构为 Tool Protocol | 原则6 |
| P1-15 | item.match 抽取为独立 Tool | 原则6 |
| P1-16 | 预留域注册（D-LOCATION/D-SCORING/D-SCHEDULE/D-FINANCE） | 原则3 |
| P1-17 | Design Token 转换器（token-loader.ts） | 原则8 |
| P1-18 | 审计报告中所有"中"风险项清零 | Block -1 |
| P1-19 | debug trace完整span（trace_spans表） | Block 4 |
| P1-20 | 目标引擎和洞察链路完整 trace | Block 4 |

## P2：锦上添花（12项）

| 编号 | 任务 | 来源 |
|------|------|------|
| P2-01 | 完整 trust dashboard（UI页面） | Block 0 |
| P2-02 | 全站 UI tokens 接入 | Block 6 |
| P2-03 | 6个基础UI组件 | Block 6 |
| P2-04 | 复杂行为编号（behavior_id） | 原则7 |
| P2-05 | 完整 Eval 飞轮自动化 | Block 7 |
| P2-06 | Agent Trajectory Test | Block 7 |
| P2-07 | WebSocket 模拟器集成 | Block 7 |
| P2-08 | UI 快照对比 | Block 7 |
| P2-09 | Multi-Agent 协作预留接口 | 原则4 |
| P2-10 | 被动规则学习数据结构预留 | 原则7 |
| P2-11 | iOS Client Adapter 完整文档 | 原则2 |
| P2-12 | 审计报告中"低"风险项清零 | Block -1 |

---

# 第十五章：测试体系

> （保持 V0.2 结构，新增 Eval Harness 集成）

## 新增：Eval Harness 集成

```
src/__tests__/
├── api/                 # API contract tests (P0)
├── rules/               # 规则测试 (P1)
├── computation/         # 计算测试 (P1)
├── trust/               # 可信度测试 (P1)
└── regression/          # 回归用例 (P1)

eval/                    # Eval Harness (P1-P2)
├── test-cases/
│   ├── from-production/ # 生产错误自动生成
│   ├── golden/          # Golden tests
│   └── regression/      # 手动回归
├── scenarios/
└── runners/
```

---

# 第十六章：双 MVP 闭环（修正版）

> （保持 V0.2 的 MVP-A 和 MVP-B，新增原则验证项）

## MVP-A：录入可追踪闭环（+原则验证）

在 V0.2 验收标准基础上增加：

- [ ] Agent Pipeline 的 10 个 Stage 全部产生 span
- [ ] 每个 Tool 调用产生 tool_call_id
- [ ] VALIDATE 阶段（Stage 4）不可跳过
- [ ] 低置信度字段标记为 unchecked 但不拒绝写入（原则9）
- [ ] corrections 操作绑定原 decision_id（原则7飞轮起点）

## MVP-B：统计可解释闭环（+原则验证）

在 V0.2 验收标准基础上增加：

- [ ] 指标通过 Computation Center + buildStatsQuery 获取（不绕过）
- [ ] 跨域统计通过 Orchestrator 协调（不直接 JOIN 多域表）
- [ ] 前端展示通过 ViewModel/DTO，不直接使用 DB 行
- [ ] computation explain 包含 computation_id、公式、排除原因

---

# 第十七章：风险矩阵与禁止事项

## 新增：原则层面的风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Agent 绕过 Domain 校验直接写库 | **极高** | Tool Protocol 强制经过 Domain Service |
| 前端新增自算聚合指标 | 高 | 原则1 + 审计 + 禁止清单 |
| 业务逻辑写死在 React 中导致 iOS 重写 | 高 | 原则2 + src/lib/ 零 React 依赖 |
| DDD 域边界模糊导致数据污染 | 高 | Domain Registry + 跨域调用规则 |
| 校验依赖 LLM 导致数据不可信 | 高 | 原则6修正 + Domain 强制校验 |
| 决策无日志导致飞轮断裂 | 中 | Block 5 decision_log 强制 |



---

---

# 第十八章：可观测性增强与自改进自动化工作流（补充规格 V1.0）

> **本章是对第十一章（Eval Harness）、第八章（链路追踪）、第九章（决策日志）、第四章（数据可信）的增强补充。核心目标：把"一笔带过的飞轮描述"升级为"两个可落地的自动化工作流 + 一个诊断 API + 一个增强纠错机制"。**

## 18.1 背景：现有设计缺口

V0.3 蓝图已经定义了编号体系、trace/span/decision 基础设施、以及 Eval Harness 的目录结构和 test_case 格式。但存在以下缺口：

| 缺口 | 现有设计 | 缺什么 |
|------|---------|--------|
| 大模型如何快速诊断 | Debug Trace 页面（人工看） | 大模型需要的结构化诊断 API |
| 测试用例如何产生 | 手动编写 TCASE JSON | 从 trace log **自动生成** test_case |
| UI 正确性如何验证 | UI 快照对比（P2） | WebSocket 模拟器 + accessibility tree |
| 纠错如何驱动改进 | correction 记录绑定 decision_id | 纠错自动生成回归测试 + 聚类 + 规则自我建议 |
| 测试如何集成到开发流 | 手动跑 API runner | CI/CD 集成 + 部署前自动验证 |

## 18.2 总体设计目标

**两个自动化工作流**：

### 工作流 A：Debug 快速诊断工作流

```
生产错误 or 用户报告 bug
  → 获得 trace_id
  → 调用 /api/v2/diagnose?trace_id=xxx
  → 大模型收到结构化诊断报告（根因 + 关联 decision + 关联 rules + 建议方向）
  → token 消耗从"全项目扫描"降到"几百 token"
```

### 工作流 B：错误转测试 + 模拟器验证工作流

```
生产错误发生
  → 结构化 Logger 捕获 error_code + trace_id
  → 自动生成 test_case JSON → 存入 eval/test-cases/from-production/
  → WebSocket 模拟器推送测试用例 → 本地/CI 环境执行
  → 验证：API 数据结构 ✓ + Domain 校验 ✓ + UI 渲染 ✓（accessibility tree）
  → 不通过 → 大模型修复 → 重跑 → 通过 → 部署
  → 部署后验证 trace_id → 闭环
```

## 18.3 设计一：诊断 API（`/api/v2/diagnose`）

### API 契约

```
GET /api/v2/diagnose?trace_id=T-20260504-a1b2c3
```

**响应结构**：

```typescript
interface DiagnosisResult {
  trace_id: string;
  status: 'ok' | 'failed' | 'partial';
  total_duration_ms: number;
  component_id: string;
  user_id: string;
  created_at: string;

  // 断点定位——最重要的部分（击鼓传花：第几个小朋友掉了）
  break_point: {
    stage: PipelineStage;
    stage_name: string;          // 如 "VALIDATE"
    span_id: string;             // SPAN-04-d4e5f6
    error_code: string | null;   // ERR-CLASSIFY-001
    error_message: string | null;
    input_summary: string;
    output_summary: string;
    duration_ms: number;
  } | null;

  // 完整 span 树
  spans: SpanNode[];

  // 关联的决策（为什么这么判断）
  related_decisions: {
    decision_id: string;
    decision_type: string;
    input_summary: string;
    output_summary: string;
    confidence: number | null;
    rule_ids: string[];
  }[];

  // 关联的规则（触发了什么规则）
  related_rules: {
    rule_id: string;
    rule_name: string;
    rule_explanation: string;
    triggered_at_stage: PipelineStage;
  }[];

  // 关联的计算
  related_computations: {
    computation_id: string;
    metric_name: string;
    formula_summary: string;
  }[];

  // 建议修复方向
  suggested_fix: {
    target_file: string;
    target_function: string;
    error_category: string;
    related_doc: string;
    similar_errors_count: number;
  }[];

  // 大模型友好摘要（一行文本，可直接粘贴给 AI）
  ai_prompt_summary: string;
}
```

### 实现原理

诊断 API 不是重新分析，而是**聚合已有结构化数据**：

```
SELECT * FROM trace_summaries WHERE trace_id = $1 → 总状态和断点
SELECT * FROM decision_logs WHERE trace_id = $1  → 关键判断
从 break_point.error_code 反查 error-codes.ts   → error 语义
从 break_point.rule_ids 反查 RULES 中心          → 规则内容和解释
聚合 → DiagnosisResult → 返回
```

### 大模型使用方式

```
收到 bug: "录入'今天跑步5公里'归到了购物，trace_id=T-xxx"
大模型: GET /api/v2/diagnose?trace_id=T-xxx
       → break_point: Stage 4 VALIDATE, ERR-CLASSIFY-001
       → decision: 归入"购物"，confidence 0.45
       → suggested_fix: 检查 src/lib/rules/classification.ts 的 R-CL-001
       → token 消耗: ~500（vs 全项目扫描 ~50000）
```

### 优先级：**P0**

## 18.4 设计二：从 Trace Log 自动生成测试用例

### 生成流水线

```
生产环境 error → structured_logs 捕获
  → 自动触发器检测新增错误
  → 调用 test_case 生成器:
      - 从 trace_summaries 拿 input
      - 从 decision_logs 拿当时判断
      - 从 break_point 拿 actual 错误行为
      - 构造 expected（纠错结果或"不应报错"）
  → 输出 TCASE-xxx.json → 存入 eval/test-cases/from-production/
  → 标记 status: "pending_verification"
```

### 纠错即测试原则

用户每次通过 `POST /api/v2/records/[id]/correct` 纠错：
- 自动调用 test-case-generator
- expected = 用户修正后的结果（人工验证过的正确行为）
- actual_production = 原错误行为
- 标记 status: "auto_verified"
- **每次用户纠错 = 一个免费的、人工验证过的回归测试用例**

### 优先级：**P0**（自动生成器 + 纠错即测试）

## 18.5 设计三：WebSocket 模拟器

### 架构

```
测试脚本 (eval/scenarios/run-scenario.ts)
  → WebSocket → 模拟器服务端 (src/lib/eval/simulator-server.ts)
    → HTTP → TETO 应用 (localhost:3000)
    → 验证: response JSON 结构 ✓ + accessibility tree ✓
    → 返回: SimResult
```

### 消息协议

**SimCommand**：`{ command_id, type: 'api_test'|'ui_test'|'full_flow', test_case_id, api?, ui? }`

**SimResult**：`{ command_id, test_case_id, passed, duration_ms, api_result?, ui_result?, error? }`

### UI 验证策略

**不使用截图像素对比**（不稳定）。使用 **accessibility tree 语义对比**：
- 验证：页面上存在 `role='button' name='创建记录'` 的元素
- 验证：页面上不存在 `role='alert' name='错误'` 的元素

### 优先级：**P1**（API 层验证）/ **P2**（UI accessibility tree 验证）

## 18.6 设计四：纠错增强

### 增强 1：纠错自动生成回归测试（P0）

```
用户纠错 → correction 记录 + TCASE-xxx.json 自动生成
next time: 改了解析逻辑 → regression test 自动发现退化
```

### 增强 2：错误聚类与趋势 API（P1）

```
GET /api/v2/diagnose/trends?days=30
→ 按 error_code 聚类 → 趋势分析 → top 高频修正模式
→ "ERR-CLASSIFY-001 本月出现 23 次，最常被修正为英语相关事项"
```

### 增强 3：规则自我建议（P2）

同一纠错模式出现 N 次（默认 5）→ 主动建议用户设为默认规则。用户确认后自动创建偏好规则。

## 18.7 设计五：CI/CD 集成

```bash
npm run test:contract     # API contract tests（pass@1 / pass@3）
npm run test:eval         # 所有 eval test cases
npm run test:replay       # 重放 production test cases
npm run diagnose          # 诊断最近错误
npm run test:generate-from-error  # 从最近 error 生成 test_case
```

部署前：全部通过。部署后：`verify:deploy` 验证关键 API 正常。

## 18.8 优先级重新分配

基于本章补充，调整第十四章优先级：

| 原编号 | 任务 | 原优先 | 新优先 | 原因 |
|--------|------|--------|--------|------|
| — | 诊断 API `/api/v2/diagnose` | 不存在 | **P0 新增** | 大模型高效诊断前提 |
| — | test_case 自动生成器 | 不存在 | **P0 新增** | 纠错即测试引擎 |
| — | 错误聚类 API | 不存在 | **P1 新增** | 趋势分析数据源 |
| — | WebSocket 模拟器（API层） | 不存在 | **P1 新增** | 自动化测试基础设施 |
| P1-01 | 用户纠错 API | P1 | **P0 升级** | 纠错=免费测试用例 |
| P1-12 | API contract runner | P1 | **P0 升级** | 需可执行命令 |
| P2-07 | WebSocket 模拟器集成 | P2 | P1（仅API层） | 先做API验证 |

## 18.9 新增文件清单

| 操作 | 文件 | 优先级 |
|------|------|--------|
| 新建 | `src/app/api/v2/diagnose/route.ts` | P0 |
| 新建 | `src/lib/observability/diagnose.ts` | P0 |
| 新建 | `src/lib/eval/test-case-generator.ts` | P0 |
| 新建 | `src/lib/eval/simulator-server.ts` | P1 |
| 新建 | `eval/scenarios/run-scenario.ts` | P1 |
| 新建 | `src/lib/eval/accessibility-checker.ts` | P2 |
| 新建 | `src/app/api/v2/diagnose/trends/route.ts` | P1 |
| 新建 | `src/lib/correction/regression-test-generator.ts` | P0 |

## 18.10 验证方式

### 工作流 A
```bash
curl "http://localhost:3000/api/v2/diagnose?trace_id=T-xxx"
# 预期: break_point 定位准确，ai_prompt_summary 是一行可读文本
```

### 工作流 B
```bash
npm run test:generate-from-error  # 生成 test_case
npm run test:eval                  # 跑测试
# 预期: 自动生成的 test_case 可复现错误
```

---

## 附录 18.A：Anthropic/OpenAI 最佳实践映射

| 业界实践 | 来源 | TETO 对应 |
|---------|------|----------|
| "Maintain simplicity in agent design" | Anthropic Building Effective Agents | 10条原则 + P0/P1/P2 渐进复杂度 |
| 分离生成与评估 | Anthropic Harness Engineering | Pipeline Stage 5(EXECUTE) vs Stage 6(VERIFY)；独立 Eval Harness |
| pass@k / pass^k | Anthropic Evals | API contract test: pass@1（确定性）/ parse test: pass@3（AI操作） |
| 结果验证胜过步骤检查 | Anthropic Evals | P0 Outcome Test（检查DB最终状态），P2 Agent Trajectory Test |
| "Poka-yoke your tools" | Anthropic Writing Tools | Tool Protocol: dry_run, idempotency_key, validation |
| "Tools should have clear, distinct purpose" | Anthropic Writing Tools | Dumb Tools 原则：每个Tool只做一件事 |
| "Write error responses that are specific and actionable" | Anthropic Writing Tools | error_code + error_message + validation_results |
| "Prompt-engineer tool descriptions" | Anthropic Context Engineering | Tool Protocol 的 input/output schema 即 tool description |
| "Only increase complexity when demonstrably improves" | Anthropic Building Effective Agents | P0→P1→P2 递进，先验证再扩展 |
| "Find smallest possible set of high-signal tokens" | Anthropic Context Engineering | ViewModel/DTO：只返前端需要的字段 |
| Hooks 三阶段防护 | Claude Code/Codex | AI IDE 执行规则第十三章（PreToolUse/PostToolUse/Stop） |
| CLI evals > MCP evals | Claude Code Harness | API contract runner 用脚本，不先建复杂框架 |
| Accessibility tree 验证 | Claude Code Harness | UI 验证用 accessibility tree 替代截图像素对比 |
| Langfuse Tracing | OpenAI Agents SDK | trace_summaries + decision_logs + diagnosis API |

---

*TETO 1.6 工程底座重构蓝图 V0.4*
*V0.4 变更：新增 D-MAP 域注册、新增第十八章可观测性增强与自改进自动化工作流（诊断API、test_case自动生成、WebSocket模拟器、纠错增强）、新增错误聚类API、新增Anthropic/OpenAI最佳实践映射、新增API日期版版本化、新增健康检查端点、新增PITR备份策略、新增功能开关机制*
*V0.3 基于 V0.2 新增：10条顶层架构原则前置、DDD领域边界与编排器、Agent计划与执行流水线、Dumb Tools协议、Eval Harness自改进飞轮、所有Block的原则对齐修正*

## 禁止事项总清单（全Blueprint汇总）

| 编号 | 禁止事项 | 来源 |
|------|----------|------|
| X01 | 前端自算聚合指标 | 原则1 |
| X02 | React组件中写业务规则判断 | 原则2 |
| X03 | Domain直接调用另一个Domain的表 | 原则3 |
| X04 | API route直接做跨域组合 | 原则4 |
| X05 | Agent跳过VALIDATE阶段 | 原则5 |
| X06 | Tool内部调用LLM | 原则6 |
| X07 | Agent绕过Tool直接写DB | 原则6 |
| X08 | 写操作校验只依赖LLM判断 | 原则6 |
| X09 | console.log用于生产日志 | 原则7 |
| X10 | 错误不记录error_code | 原则7 |
| X11 | 修复bug不补测试用例 | 原则7 |
| X12 | 组件硬编码颜色/字号/间距 | 原则8 |
| X13 | 低置信度拒绝写入（只能标记） | 原则9 |
| X14 | 手动填写5+字段的新建表单 | 原则9 |
| X15 | 绕过Domain Service直接写DB | 原则10 |
| X16 | 修改已部署的SQL migration | 原则10 |
| X17 | 物理删除用户数据 | 原则10 |
| X18 | 生产环境启用DEV_MODE | 原则10 |
| X19 | 无idempotency_key的写操作 | 原则10 |
| X20 | 无审计直接删除旧CORE_METRICS | Block 3 |

---

# 附录 A：原则与 Block 关系映射

| Block | 对应原则 | 已有基础(1.5) | 1.6增量 |
|-------|----------|---------------|---------|
| Block -1 审计 | 全部10条 | 无 | 原则违反检测 |
| Block 0 数据可信 | P1,P2,P6,P9,P10 | data_nature/review_status | trust_level/source_mark/correction |
| Block 1 接口契约 | P1,P2,P6,P7 | API v2 routes（雏形） | ViewModel/API Envelope/contract tests |
| Block 2 规则中心 | P3,P6,P7 | RULES声明层(5模块) | RULES_VERSION/rule explain/编号化 |
| Block 3 计算中心 | P1,P2,P3,P7 | COMPUTATION声明层(4模块) | COMPUTATION_VERSION/computation explain |
| Block 4 链路追踪 | P5,P7 | 无 | 完整编号体系/分层存储 |
| Block 5 决策日志 | P5,P6,P7,P9 | 无 | decision_id/correction绑定 |
| Block 6 设计令牌 | P8,P1,P2 | Tailwind v4基础 | tokens.json/跨端转换器 |
| Block 7 Eval飞轮 | P7 | 无 | eval框架/自改进流水线 |

---

# 附录 B：原则编号快速索引

| 编号 | 简称 | 一句话 |
|------|------|--------|
| P1 | 薄客户端 | 前端不计算、不判断、不编排 |
| P2 | 平台剥离 | 业务逻辑绝不死在 React/iOS 里 |
| P3 | DDD域隔离 | 12个独立域，高内聚低耦合 |
| P4 | 编排器 | 多域操作由 Orchestrator 协调 |
| P5 | Agent流水线 | 10阶段：Observe→Interpret→...→Log |
| P6 | Smart Agent Dumb Tools | Agent聪明但Domain强制执行校验 |
| P7 | 可观测飞轮 | error→trace→test_case→fix→deploy |
| P8 | Design Token | tokens.json是唯一设计变量源 |
| P9 | 逃避填表 | 自然语言为主，表单只是校正 |
| P10 | 数据库安全 | RLS+Domain校验+Audit Log+软删除 |