# TETO 1.6 总执行清单

---

## 0. 清单定位

本清单用于回答以下问题：

1. **TETO 1.6 当前到底做什么**
2. **TETO 1.6 先做什么、后做什么**
3. **哪些功能属于 1.6 范围**
4. **哪些内容明确不进入 1.6**
5. **每一块做到什么程度才算完成**
6. **如何验证不是"写了类型定义"，而是架构真落地了**

本清单默认服从《TETO 1.6 工程底座重构蓝图 V0.4》的已定边界：

- 10 条顶层架构原则（不可违反的宪法）
- 13 个 DDD 业务域（6 个现有 + 7 个预留/远期）
- Agent 10 阶段流水线（OBSERVE → INTERPRET → … → LOG）
- Smart Agent Dumb Tools 协议（Agent 聪明，Domain 强制执行校验）
- 7 个工程 Block（-1 ~ 6）+ 第十八章可观测性增强与自改进自动化工作流
- 完整编号体系（trace_id / span_id / decision_id / error_code / rule_id / computation_id / tool_call_id）
- 诊断 API `/api/v2/diagnose` + 错误聚类 API + test_case 自动生成器 + WebSocket 模拟器
- Anthropic/OpenAI 业界最佳实践映射

**蓝图 vs 执行清单的关系**：

```
蓝图定边界 → 总执行清单定范围和顺序 → 当前执行清单定唯一动作
→ 单任务提示词给 AI → 按验收链路验证 → 通过后下一块
```

---

## 1. 1.6 当前总目标

### 1.1 总目标

> **TETO 1.6 的核心目标，是把"工程底座打稳"——让数据可信、让 API 有契约、让规则/计算中心可闭环运作、让每次操作可追踪可追溯、让统计结果可解释、让错误能自动转化为测试用例、让 AI 能通过 trace_id 毫秒级定位问题。**

1.6 **不是**功能版本，是**工程重构版本**。用户看到的功能基本不变，但底座的可靠性、可解释性、可观测性发生质变。

### 1.2 1.6 的唯一主任务

> **把 1.5 已验证的上层功能，放到一个稳固的工程底座上。让 1.7、2.0 不再每次都在"地基不稳"的前提下盖楼。**

### 1.3 1.6 的三条主线

1. **数据可信主线**
   - 数据可信度（trust_level）可计算、可展示、可追溯
   - 统计资格（stats-eligibility）统一判定，不被前端绕开
   - 用户纠错可沉淀为回归测试（"纠错即测试"）

2. **工程可观测主线**
   - 完整编号体系（trace_id / span_id / decision_id / error_code / rule_id / computation_id / tool_call_id）
   - 结构化日志替代 console.log
   - 诊断 API：大模型根据 trace_id 即可定位根因
   - Debug trace 页面可查完整 span 树

3. **自改进飞轮主线**
   - 生产错误 → trace 捕获 → 自动生成 test_case → 本地复现 → 修复 → 回归 → 部署验证
   - 两个自动化工作流集成到开发/部署流程

---

## 2. 1.6 执行总原则

### 2.1 架构原则（10 条宪法，不可违反）

| 编号 | 原则 | 一句话 |
|------|------|--------|
| P1 | 薄客户端 | 前端是传菜员，不计算、不判断、不编排。所有业务逻辑在厨房（后端）完成。 |
| P2 | 平台剥离 | 业务逻辑绝不死在 React/iOS 里。`src/lib/` 零前端依赖。 |
| P3 | DDD 域隔离 | 12 个独立域，高内聚低耦合。表结构完全隔离。 |
| P4 | 编排器 | 多域操作由 Orchestrator 协调。 |
| P5 | Agent 流水线 | 10 阶段：Observe→Interpret→Decompose→Plan→Validate→Execute→Verify→Commit→Explain→Log |
| P6 | Smart Agent Dumb Tools | Agent 聪明——理解意图、推理判断。Tool 简单——只做执行。Domain 强制执行校验。 |
| P7 | 可观测飞轮 | error→trace→test_case→fix→deploy。给每个环节编号，出 bug 时根据编号直接定位。 |
| P8 | Design Token | tokens.json 是唯一设计变量源。跨 Web/iOS 统一。 |
| P9 | 逃避填表 | 自然语言为主，表单只是校正界面。不强迫填写。 |
| P10 | 数据库安全 | RLS + Domain 校验 + Audit Log + 软删除 + 幂等。 |

**违反任意一条原则的代码不得合并。**

### 2.2 执行顺序原则

1. 先建立类型基础设施（编号体系、Pipeline 枚举、Tool Protocol 接口）——不改行为只建骨架
2. 再做审计清理（Block -1 原则违反检测，前端自算识别）——先看清再动手
3. 再闭环三大中心（规则中心、计算中心、接口契约）——存量重构
4. 再建立可观测层（trace / decision / log / 诊断 API）——新增能力
5. 再做自改进工作流（test_case 自动生成、WebSocket 模拟器、纠错增强）——自动化闭环
6. 最后做设计令牌和远期预留——锦上添花

### 2.3 兼容原则

1. 1.6 期间 1.5 功能不损坏
2. 旧 CORE_METRICS 三步移除（审计→deprecate→迁移→删除），不直接删除
3. 新增 migration 只新增不改旧
4. API 新增 ViewModel 层，旧路由渐进迁移

### 2.4 完成判断原则

> **1.6 的完成标准不是"类型文件存在"，而是"8 条验收链路全部可走通，且违反蓝图的高风险项归零"。**

---

## 3. 1.6 最小可用闭环

以下 6 条成立，1.6 就已经具备明确价值：

1. **前端不再自算聚合指标**——所有统计走 Computation Center
2. **API 返回有统一 envelope + trace_id**——每次请求可追踪
3. **一次录入产生完整 trace（含 span 树和 decision_id）**——可观测闭环
4. **一个统计指标可 explain（包含排除原因列表）**——可解释闭环
5. **调用 `/api/v2/diagnose?trace_id=xxx` 返回结构化根因分析**——大模型高效诊断
6. **一次用户纠错自动生成一个回归测试用例**——"纠错即测试"飞轮起步

---

## 4. 1.6 总执行范围

本清单将 1.6 拆为 10 个执行块：

| 编号 | 执行块 | 核心产出 |
|------|--------|---------|
| 一 | 架构基座块 | 编号体系 + Pipeline 类型 + Tool Protocol + Domain Registry + Orchestrator + Logger |
| 二 | 前置审计块（Block -1） | 审计报告（原则违反检测 + 前端自算清剿 + 跨域引用治理） |
| 三 | 接口契约块（Block 1） | API Envelope + ViewModel + error_code 体系 + 前端 api/client.ts + API 日期版版本化 + 健康检查端点 |
| 四 | 数据可信块（Block 0） | trust_level 计算 + stats-eligibility + 纠错 API + 纠错即测试 |
| 五 | 规则与计算闭环块（Block 2+3） | RULES_VERSION + COMPUTATION_VERSION + computation explain + 旧 CORE_METRICS 迁移 |
| 六 | 可观测性块（Block 4+5+第十八章） | trace-span + trace_summaries + decision_logs + debug trace 页面 + 诊断 API |
| 七 | 自改进工作流块（第十八章） | test_case 自动生成器 + WebSocket 模拟器 + npm 命令集成 |
| 八 | 设计令牌块（Block 6） | tokens.json + token-loader.ts |
| 九 | Eval Harness 块（Block 7） | eval/ 目录 + API contract runner + 首批 test cases |
| 十 | 安全审计块 | 软删除覆盖 + migration 审计 + DEV_MODE 防护 + RLS 确认 + PITR 备份 + 功能开关 |

---

## 5. 执行块一：架构基座块

### 5.1 目标

在不动任何现有代码的前提下，建立 1.6 所需的所有类型定义、接口约束、目录结构。这是其他所有 Block 的地基。

### 5.2 必做项

#### 5.2.1 编号体系完整定义（P0）

在 `src/lib/observability/id-registry.ts` 中定义所有 ID 格式和生成函数：

| ID 类型 | 格式 | 生成函数 | 产生时机 |
|---------|------|----------|----------|
| trace_id | `T-{YYYYMMDD}-{6位随机}` | `genTraceId()` | 每次用户操作入口 |
| span_id | `SPAN-{stage序号}-{6位随机}` | `genSpanId(stage)` | 每个 Pipeline Stage |
| step_id | `LNK-{DOMAIN}-{3位序号}` | `genStepId(domain)` | 流水线逻辑步骤 |
| component_id | `CMP-{ABBR}` | 编译时常量 | 系统组件标识 |
| behavior_id | `BEH-{COMP}-{3位序号}` | P2 预留 | 用户行为模式 |
| decision_id | `DEC-{TYPE}-{6位随机}` | `genDecisionId(type)` | 每次关键判断 |
| tool_call_id | `TC-{TOOL}-{6位随机}` | `genToolCallId(tool)` | 每次 Tool 调用 |
| error_code | `ERR-{DOMAIN}-{3位序号}` | 编译时常量 | 错误发生时 |
| rule_id | `R-{MOD}-{3位序号}` | 编译时常量 | 规则定义时 |
| computation_id | `C-{TYPE}-{3位序号}` | 编译时常量 | 指标定义时 |

#### 5.2.2 Agent Pipeline 类型定义（P0）

在 `src/lib/ai/agent-pipeline.ts` 中定义：

- `PipelineStage` 枚举（Stage 0-9）
- `PipelineContext` — 流水线上下文
- `PipelineStepResult` — 每阶段输出（含 span_id / input_summary / output_summary / status / error_code / duration_ms / decision_ids / rule_ids）
- `PipelineResult` — 整体输出

#### 5.2.3 Tool Protocol 类型定义（P0）

在 `src/lib/ai/tool-protocol.ts` 中定义通用 Tool 接口：

```typescript
// Tool 调用方（Agent）提供: tool_name, input(schema), trace_id, idempotency_key?, dry_run?
// Tool 返回: ok, output, error_code?, validation_results?, duration_ms, span_id
```

每个 Tool 必须：
- 输入/输出有严格 JSON Schema
- 支持 `dry_run`（只校验不写入）
- 支持 `idempotency_key`（防重复）
- 失败返回标准 `error_code`
- 执行过程自动进入 trace span

#### 5.2.4 Domain Registry 建立（P0）

在 `src/lib/domain/registries/` 下建立：

| 域编号 | 域名 | 1.6 状态 | 核心表 |
|--------|------|----------|--------|
| D-RECORD | Record Domain | 已有，需闭环 | records, record_days, record_links |
| D-ITEM | Item Domain | 已有，需闭环 | items, item_folders, sub_items |
| D-GOAL | Goal Domain | 已有，需闭环 | goals |
| D-PHASE | Phase Domain | 已有 | phases |
| D-INSIGHT | Insight Domain | 已有，需闭环 | (查询聚合) |
| D-TAG | Tag Domain | 已有 | tags |
| D-FINANCE | Finance Domain | 预留，1.6 不拆分 | (records.cost) |
| D-SCHEDULE | Schedule Domain | 预留，1.6 不拆分 | (records.time_anchor_date) |
| D-LOCATION | Location Domain | 预留注册 | (records.location) |
| D-SCORING | Scoring Domain | 预留注册 | (暂无，远期 AI 打分) |
| D-REVIEW | Review Domain | 预留注册 | (暂无) |
| D-MAP | Map/LBS Domain | 预留注册 | (暂无，远期地图 API) |

每个域有独立模型、表、规则、服务、校验、计算。域间通过事件/引用/编排器协作，表结构完全隔离，数据不污染。

#### 5.2.5 Orchestrator 接口定义（P0）

在 `src/lib/orchestrators/` 下建立：

- `Operation` — 单个操作（target_domain, action, payload）
- `ExecutionPlan` — 执行计划（operations[], dependencies, rollback_strategy）
- `OrchestrationResult` — 编排结果
- `IOrchestrator` — 编排器接口

#### 5.2.6 结构化 Logger 实现（P0）

在 `src/lib/observability/logger.ts` 中实现：

- 结构化日志格式（JSON，含 trace_id / span_id / component_id / severity / input_summary / output_summary / duration_ms / error_code）
- 替代所有 `console.log`
- 生产环境输出到文件，开发环境输出到控制台

### 5.3 完成标准

- 所有枚举、接口、类型通过 `npx tsc --noEmit` 编译
- 编号体系生成函数可调用并返回正确格式
- Domain Registry 包含全部 6 个现有域 + 6 个预留域
- Logger 可输出含 trace_id 的结构化日志
- **不修改任何现有的 `.ts` 文件**（只新增文件）

### 5.4 验收方式

```bash
npx tsc --noEmit  # 零类型错误
```

手动验证：
- `genTraceId()` → 输出格式 `T-20260504-a1b2c3`
- `genSpanId(4)` → 输出格式 `SPAN-04-d4e5f6`
- `logger.info("test", { trace_id: "T-xxx" })` → 输出结构化 JSON
- `DomainRegistry.list()` → 返回 12 个域的描述信息

---

## 6. 执行块二：前置审计块（Block -1）

### 6.1 目标

扫描现有代码库，识别所有违反 10 条原则的代码。输出审计报告，区分高/中/低风险。高风险项必须在后续块中清零。

### 6.2 必做项

#### 6.2.1 审计检查项（P0）

| 编号 | 检查项 | 搜索模式 | 对应原则 |
|------|--------|----------|----------|
| A | 类型定义重复 | 审查 `src/types/` | 共享内核 |
| B | API route 返回值不一致 | 审查所有 route.ts | Block 1 |
| C | `data_nature` 使用不一致 | `grep -r "data_nature" src/` | Block 0 |
| D | RULES 未通过统一出口引用 | `grep -r "from.*rules/" src/` | Block 2 |
| E | COMPUTATION 未通过统一出口引用 | `grep -r "from.*computation/" src/` | Block 3 |
| F | goal-engine 未使用 buildStatsQuery | 审查 goal-engine.ts | Block 3 |
| G | 前端组件分发统计逻辑 | `grep -r "stat\|score\|progress" src/components/` | 原则1 |
| H | 前端 API 调用未统一封装 | `grep -r "fetch(" src/` | Block 1 |
| I | 废弃代码引用 | `grep -r "chains\|goal_id" src/` | 清理 |
| **J** | **前端自算聚合指标** | `.reduce(` / `.filter(...).length` / `Math.max(` in `src/components/` | 原则1 |
| **K** | **业务逻辑写在组件中** | `if (record.type ===` 等 in `src/components/` | 原则2 |
| **L** | **跨域直接引用** | 一个 db 文件 import 另一个不相关的 db 文件 | 原则3 |
| **M** | **API route 绕过 Orchestrator** | route.ts 中直接调多个不相关的 db 函数 | 原则4 |
| **N** | **绕过 Domain 直接写 DB** | `supabase.from().insert/update/delete` 不在 src/lib/db/ 内 | 原则6/10 |
| **O** | **src/lib/ 中 React 依赖** | `import.*react` / `import.*next` in `src/lib/` | 原则2 |
| **P** | **组件硬编码颜色/字号** | `#[0-9a-fA-F]{3,6}` / `font-size:` / `px` in `src/components/` | 原则8 |
| **Q** | **console.log 用于生产** | `console.log(` in `src/lib/` | 原则7 |

### 6.3 完成标准

- 审计报告列出所有发现（含：文件、行号、违反原则、风险等级、修复方向）
- 高风险项数量明确——这是后续块的清零目标
- 审计报告存档

### 6.4 验收方式

- 审计报告是否覆盖 A-Q 全部 17 类检查项
- 每个检查项下有是否具体发现（即使为 0 也明确标记）
- 高风险项是否有对应的 P0 修复任务编号

---

## 7. 执行块三：接口契约块（Block 1）

### 7.1 目标

统一所有 API 的响应格式、错误格式、元数据字段。前端统一通过 `api/client.ts` 调用。

### 7.2 必做项

#### 7.2.1 API Response Envelope（P0）

```typescript
// 成功
type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: { trace_id, rule_version?, computation_version?, server_timestamp };
};

// 错误
type ApiError = {
  ok: false;
  error: { error_code, message, details? };
  meta: { trace_id, span_id?, server_timestamp };
};
```

#### 7.2.2 error_code 体系（P0）

在 `src/lib/observability/error-codes.ts` 中建立初始注册表：

| 域 | error_code | 含义 |
|----|------------|------|
| RECORD | ERR-RECORD-001 | 记录创建校验失败 |
| RECORD | ERR-RECORD-002 | 记录状态流转非法 |
| ITEM | ERR-ITEM-001 | 事项匹配失败 |
| PARSE | ERR-PARSE-001 | 语义解析不可理解 |
| PARSE | ERR-PARSE-002 | 语义解析信息不足 |
| GOAL | ERR-GOAL-001 | 目标计算无数据 |
| AUTH | ERR-AUTH-001 | 未认证 |
| AUTH | ERR-AUTH-002 | 无权限 |

#### 7.2.3 ViewModel/DTO 定义（P0）

在 `src/lib/api/presentation/` 下建立：

- `RecordDetailViewModel` — 记录详情（含 trust 标记、decision 摘要）
- `GoalProgressViewModel` — 目标进度（含 computation 解释）
- `InsightCardViewModel` — 洞察卡片（含 explanation block 数据）
- `TraceDebugViewModel` — 调试 trace（含 span 树）

**前端只接收 ViewModel，绝不直接使用 DB Row。**

#### 7.2.4 前端统一 API 调用封装（P0）

`src/lib/api/client.ts`：统一的 `api.get<T>()` / `api.post<T>()` / `api.put<T>()`
- 自动解析 ApiSuccess/ApiError
- 自动提取响应 meta 中的 trace_id

#### 7.2.5 第一批 API 迁移（P0）

迁移以下核心 endpoint 到新 envelope：

1. `POST /api/v2/records` — 创建记录
2. `POST /api/v2/parse` — 语义解析
3. `GET /api/v2/goals/[id]/engine` — 目标引擎

#### 7.2.6 API 日期版版本化（P0）

采用 Stripe 式日期版版本化，替代传统的 URL 路径版本号（`/v1/`、`/v2/`）：

- 客户端请求时带 header：`Stripe-Version: 2026-05-04`
- 服务端在响应 meta 中返回实际使用的版本号：`api_version: "2026-05-04"`
- 实现 `src/lib/api/version-router.ts`：解析请求版本号、检测废弃版本、返回 deprecation warning
- 建立 `docs/api/CHANGELOG.md`：记录每次 API 行为变更的日期和内容
- 响应 meta 始终包含 `api_version` / `api_version_min` / `api_version_max`

**验收**：任意 API 响应 meta 中 `api_version` 字段存在且为合法日期格式；带过期版本号请求时返回 deprecation warning。

#### 7.2.7 健康检查端点（P0）

`GET /api/health`：

```typescript
// 响应
{
  status: "healthy" | "degraded" | "unhealthy",
  version: "1.6.0",
  uptime_seconds: 123456,
  checks: {
    database: { status: "ok" | "error", latency_ms: 12 },
    llm_api: { status: "ok" | "degraded" | "error", provider: "deepseek", latency_ms: 230 },  // P1
    migrations: { status: "ok" | "pending" | "error", last_migration: "019", pending_count: 0 }
  }
}
```

- 不暴露内部配置（连接字符串、API key）
- 速率限制：每分钟最多 60 次

**验收**：`curl http://localhost:3000/api/health` 返回 `status: "healthy"`，checks 中 database 和 migrations 均为 ok。

### 7.3 完成标准

- 3 个核心 API 返回统一 envelope
- `api/client.ts` 可被所有前端组件使用
- error_code 覆盖至少 5 个域 8 个错误码
- 审计报告中 H 类（API 未统一封装）清零
- 所有 API 响应 meta 含 `api_version` 字段
- `/api/health` 返回 healthy 状态

### 7.4 验收方式

API contract test：
```bash
curl -X POST http://localhost:3000/api/v2/records -H "Content-Type: application/json" -d '{...}'
# 预期: response 包含 ok + data + meta.trace_id（格式 T-YYYYMMDD-xxx）

# 健康检查
curl http://localhost:3000/api/health
# 预期: {"status":"healthy","version":"1.6.0",...}

# API 版本化
curl http://localhost:3000/api/v2/records -H "Stripe-Version: 2026-01-01"
# 预期: meta 中 api_version 字段存在
```

---

## 8. 执行块四：数据可信块（Block 0）

### 8.1 目标

建立字段可信度计算引擎、统计资格统一判定、用户纠错闭环。**每次纠错自动生成回归测试用例。**

### 8.2 必做项

#### 8.2.1 可信度计算引擎（P0）

在 `src/lib/trust/compute-trust.ts` 中实现：

```
source_type='user_input' + review_status='verified' → trusted
source_type='ai_inferred' + 无corrections → unchecked
有corrections记录 → reviewed
review_status='disputed' → disputed
```

#### 8.2.2 stats-eligibility 统一判定（P0）

在 `src/lib/stats/stats-eligibility.ts` 中实现双口径：
- `isEligibleForDisplay()`：排除 cancelled，其他全含
- `isEligibleForInsight()`：额外排除 unchecked + inferred + cancelled + period_rule + 非发生/总结类型

#### 8.2.3 用户纠错 API（P0 升级）

新增 `POST /api/v2/records/[id]/correct`：
- 接受要修正的字段及新值
- 生成 correction 记录，绑定原 decision_id
- 触发 computeTrustLevel 重算
- **关键新增：自动调用 test-case-generator，生成回归测试用例存入 eval/test-cases/from-production/**
- 原因：每次用户纠错 = 一个免费的、人工验证过的回归测试

#### 8.2.4 corrections 表（P0）

SQL migration（新增 016）：
```sql
create table corrections (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references records(id),
  decision_id text not null,
  field_corrected text not null,
  old_value text,
  new_value text,
  corrected_by text not null, -- 'user' | 'system'
  created_at timestamp default now()
);
```

### 8.3 完成标准

- 新创建的记录自动计算 trust_level
- stats-eligibility 双口径生效
- 用户纠错后：① correction 记录生成 ② trust_level 重算 ③ 回归测试用例自动生成

### 8.4 验收方式

测试输入：
- `source_type = 'ai_inferred'` → `trust_level = 'unchecked'`
- `source_type = 'user_input'` → `trust_level = 'trusted'`
- 用户纠错后 → 检查 `eval/test-cases/from-production/` 下自动生成了 TCASE JSON
- 回归测试用例中 `expected.item_matched` = 用户修正后的值，`actual_production.item_matched` = 原错误值

---

## 9. 执行块五：规则与计算闭环块（Block 2 + Block 3）

### 9.1 目标

给规则中心和计算中心打上版本号、编号体系、explain 能力。完成旧 CORE_METRICS 的三步迁移。

### 9.2 必做项

#### 9.2.1 RULES_VERSION + rule_id（P0）

- 在 `src/lib/rules/index.ts` 中定义 `RULES_VERSION = '1.6.0'`
- 为现有 5 个规则模块分配 rule_id（如 R-CL-001 等）
- 每个 Domain Invariant Issue 绑定对应 rule_id

#### 9.2.2 COMPUTATION_VERSION + computation_id（P0）

- 在 `src/lib/computation/index.ts` 中定义 `COMPUTATION_VERSION = '1.6.0'`
- 为 4 个计算子模块分配 computation_id

#### 9.2.3 旧 CORE_METRICS 三步迁移（P0）

**第 1 步：审计** — 通过审计报告列出所有引用旧 `metrics.ts` 的位置
**第 2 步：deprecate** — 在旧文件每个导出上加 `@deprecated` 注释，指向 `metric-definitions.ts`
**第 3 步：迁移** — 将所有旧引用替换为新引用，确认零旧引用后删除旧文件

#### 9.2.4 goal-engine 接入 buildStatsQuery（P0）

- 将 `applyGoalProgressCaliber()` 的功能移入 `buildStatsQuery()` 的参数
- goal-engine 改为调用 `buildStatsQuery()` 而非内联查询

#### 9.2.5 computation explain（P0/P1）

- P0：实现 none/summary 两种模式（返回数值 + 公式摘要 + 排除数量）
- P1：实现 full 模式（含每条记录的排除原因列表和 computation_id 反查）

### 9.3 验收方式

- `grep -r "from.*metrics" src/` → 0 个结果（@deprecated 注释除外）
- goal-engine 中不再出现独立的 Supabase 查询
- 调 Goal 统计 API → meta 含 `computation_version: "1.6.0"`
- computation explain 返回排除记录数量和 computation_id

---

## 10. 执行块六：可观测性块（Block 4 + Block 5 + 第十八章诊断 API）

### 10.1 目标

建立完整的 trace/span/decision/诊断体系。让"击鼓传花"中每个小朋友都编号——出错时大模型根据编号直接锁定断点。

### 10.2 必做项

#### 10.2.1 trace_id 基础传播（P0）

实现 API handler wrapper，自动注入/提取 trace_id，记录请求 begin/end 时间，将 trace_id 写入响应 meta。

#### 10.2.2 trace-span 构建器（P0）

在 `src/lib/observability/trace.ts` 中实现：
- `startSpan(trace_id, stage, input_summary)` → 返回 SpanContext
- `endSpan(context, status, output_summary)` → 记录 duration_ms

#### 10.2.3 trace_summaries 表（P0）

SQL migration（新增 017）：存储每次操作的 trace 摘要，自动清理（保留 7 天）。

#### 10.2.4 decision_logs 表（P0）

SQL migration（新增 018）：存储每次关键判断（事项归类、字段回写、置信度判断等），含 decision_id / trace_id / span_id / input_summary / output_summary / confidence / rule_ids。

#### 10.2.5 诊断 API `/api/v2/diagnose?trace_id=xxx`（P0 新增）

这是**让大模型高效诊断的核心 API**。不用全项目扫描，一次调用拿到所有上下文。

**响应结构**：

```typescript
interface DiagnosisResult {
  trace_id: string;
  status: 'ok' | 'failed' | 'partial';

  // 断点定位——最重要的部分
  break_point: {
    stage: PipelineStage;        // 哪个 Stage 断了
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

  // 关联的决策
  related_decisions: { decision_id, decision_type, input_summary, output_summary, confidence, rule_ids }[];

  // 关联的规则
  related_rules: { rule_id, rule_name, rule_explanation, triggered_at_stage }[];

  // 建议修复方向
  suggested_fix: { target_file, target_function, error_category, similar_errors_count }[];

  // 大模型友好摘要（一行文本，可直接粘贴给 AI）
  ai_prompt_summary: string;
}
```

**大模型使用方式**：
```
收到 bug: "录入'今天跑步5公里'归到了购物，trace_id=T-xxx"
大模型: GET /api/v2/diagnose?trace_id=T-xxx
       → 立即看到 break_point: Stage 4 VALIDATE, ERR-CLASSIFY-001
       → decision: 归入"购物"，confidence 0.45
       → suggested_fix: 检查 src/lib/rules/classification.ts 的 R-CL-001
       → token 消耗从"全项目扫描"降到几百 token
```

#### 10.2.6 Debug Trace 最小页面（P0）

新建 `/debug/trace?trace_id=xxx` 页面：
- 显示 trace_summary（总耗时、状态、error_code）
- 显示 span 树（每个 Stage 的 input/output/duration/status）
- 显示关联的 decision_ids 和 rule_ids

#### 10.2.7 一条完整录入链路 trace（P0）

QuickInput 录入流程的完整 trace 接入：
- 10 个 Stage 全部产生 span
- 每个 Tool 调用产生 tool_call_id
- 关键判断产生 decision_id

### 10.3 完成标准

- 任何 API 请求的响应头都含 `X-Trace-ID`
- 调 `/api/v2/diagnose?trace_id=T-xxx` 返回结构化 DiagnosisResult
- 一次录入操作在 `trace_summaries` 表中有对应记录
- Debug Trace 页面可按 trace_id 查看完整 span 树

### 10.4 验收方式

```bash
# 1. 录入 "今天跑步5公里" → 从响应 meta 获取 trace_id
# 2. 调用诊断 API
curl "http://localhost:3000/api/v2/diagnose?trace_id=T-xxx"
# 预期: break_point 不为 null（如果出错）或 status='ok'（如果正常）
# 预期: related_decisions 包含 item_match 类型决策
# 预期: ai_prompt_summary 是一行可读文本
# 3. 打开 /debug/trace?trace_id=T-xxx → 看到 10 个 span
```

---

## 11. 执行块七：自改进工作流块（第十八章设计）

### 11.1 目标

实现"错误自动转测试用例 + 模拟器验证 + 脚本化执行"的自动化闭环。

### 11.2 必做项

#### 11.2.1 test_case 自动生成器（P0）

在 `src/lib/eval/test-case-generator.ts` 中实现：

```
生产错误发生
  → 从 structured_logs 捕获 error_code + trace_id
  → 从 trace_summaries 拿 input
  → 从 decision_logs 拿当时判断
  → 从 break_point 拿 actual 错误行为
  → 构造 expected（如果用户后来纠错了，用纠错结果；否则用"不应该报错"）
  → 输出 TCASE-xxx.json → 存入 eval/test-cases/from-production/
  → 标记 status: "pending_verification" or "auto_verified"
```

#### 11.2.2 纠错即测试（P0）

每次用户通过 `POST /api/v2/records/[id]/correct` 纠错后：
- 自动调用 test-case-generator
- expected = 用户修正后的结果（因为用户已经人工验证了正确行为）
- actual_production = 原错误行为
- 标记 status: "auto_verified"
- 下次改了归类逻辑 → 回归测试自动发现退化

#### 11.2.3 WebSocket 模拟器（P1）

在 `src/lib/eval/simulator-server.ts` 中实现：
- WebSocket 服务端接收测试指令
- 调用 API 并验证 response
- P1 范围：API 层验证（数据结构完整性 + 字段校验正确性）
- P2 预留：UI 层验证（通过 accessibility tree 检查渲染正确性，不依赖截图像素对比）

消息协议：
- 测试脚本 → 模拟器：`SimCommand`（command_id, type, test_case_id, api/uri 测试参数）
- 模拟器 → 测试脚本：`SimResult`（passed, api_result, error）

#### 11.2.4 错误聚类 API（P1）

`GET /api/v2/diagnose/trends?days=30`：
- 按 error_code 聚类统计
- 显示每类错误的趋势（rising/falling/stable）
- 显示用户最常修正的模式（如"背单词→归入购物 8次"）

#### 11.2.5 npm 命令集成（P0）

在 `package.json` 中新增：
```json
{
  "scripts": {
    "test:contract": "npx ts-node eval/runners/api-runner.ts",
    "test:eval": "npx ts-node eval/runners/run-all.ts",
    "test:replay": "npx ts-node eval/runners/replay-from-production.ts",
    "diagnose": "npx ts-node eval/runners/diagnose-recent.ts",
    "test:generate-from-error": "npx ts-node eval/runners/generate-from-recent-error.ts"
  }
}
```

### 11.3 完成标准

- `test_case` 自动生成器可运行：输入 trace_id → 输出 TCASE JSON
- 用户纠错后自动在 `eval/test-cases/from-production/` 生成回归测试
- `npm run test:contract` 和 `npm run test:eval` 可执行
- WebSocket 模拟器可连接本地 TETO 实例并执行 API 验证（P1）

### 11.4 验收方式

```bash
# 1. 制造一个错误（临时改错归类规则）
# 2. 触发录入，产生 error_code
# 3. 运行自动测试生成
npm run test:generate-from-error
# 4. 检查 eval/test-cases/from-production/ 有新文件
# 5. 修复 bug
# 6. 重跑测试
npm run test:eval
# 预期: 新生成的 test_case 通过
```

---

## 12. 执行块八：设计令牌块（Block 6）

### 12.1 目标

建立 `tokens.json` 作为唯一设计变量来源。Web 和 iOS（远期）共享同一套设计符号。

### 12.2 必做项

#### 12.2.1 tokens.json（P0）

在 `src/design/tokens.json` 中定义：

- **color**：status（操作状态色）/ confidence（置信度色）/ trust（数据可信度色）/ semantic（语义色：成功/警告/错误/信息）
- **font** / **spacing** / **radius** / **shadow** / **opacity** / **motion**

#### 12.2.2 token-loader.ts（P1）

将 `tokens.json` 转换为 CSS Custom Properties：
```css
:root { --token-status-pending: #...; --token-trust-unchecked: #...; }
```

#### 12.2.3 跨端 Token 流水线（P2 预留）

```
tokens.json (单一真相来源)
  → src/design/token-loader.ts  (Web: CSS 变量生成)
  → src/design/token-ios.rb     (iOS: Swift Asset 生成，预留)
  → Tailwind v4 theme 配置
  → 组件引用: var(--token-status-pending)
```

### 12.3 验收方式

- 检查 TrustBadge 组件的颜色来源 → 必须是 `var(--token-trust-xxx)`
- 修改 `tokens.json` → 组件的颜色和间距跟随变化

---

## 13. 执行块九：Eval Harness 块（Block 7）

### 13.1 目标

建立测试基础设施（目录结构 + 可执行 runner + 首批 test cases）。

### 13.2 必做项

#### 13.2.1 eval 目录结构（P0）

```
eval/
├── README.md
├── harness.config.ts
├── test-cases/
│   ├── from-production/       # 自动生成（纠错/错误转测试）
│   ├── golden/                # Golden tests（已知正确行为）
│   └── regression/            # 手动编写的回归测试
├── scenarios/
│   └── scenario-templates/
└── runners/
    ├── api-runner.ts          # API 契约测试（P0）
    ├── domain-runner.ts       # Domain 校验测试（P1）
    ├── agent-trajectory.ts    # Agent 轨迹测试（P2）
    └── run-all.ts             # 批量运行入口
```

#### 13.2.2 API contract runner（P0）

最少验证 3 个 endpoint：
1. `POST /api/v2/records` → 验证 response envelope + trace_id
2. `POST /api/v2/parse` → 验证结构完整
3. `GET /api/v2/goals/[id]/engine` → 验证 computation_version

#### 13.2.3 首批 test_case（P0）

3 个 golden test cases：
1. 单动作输入："今天跑步5公里" → 1 条记录，归入跑步事项
2. 复合输入："学了英语还健身了" → 2 条记录，分别归入英语和健身
3. 模糊输入："今天弄了一下那个" → 标记低置信度，不自动归类

### 13.3 验收方式

```bash
npm run test:contract
# 预期输出: "3/3 API contract tests passed"
npm run test:eval
# 预期输出: "所有 test cases 通过"
```

---

## 14. 执行块十：安全审计块

### 14.1 目标

确保数据库安全 10 条原则在生产环境中落实。

### 14.2 必做项

#### 14.2.1 软删除覆盖（P0）

确认 records / items / goals 三表均为软删除（有 deleted_at 字段）。

#### 14.2.2 migration 合规（P0）

- 审计所有现有 migration 文件，确认没有修改已部署 SQL 的情况
- 确认新增 migration 只新增不改旧

#### 14.2.3 DEV_MODE 防护（P0）

确认生产环境 `NEXT_PUBLIC_DEV_MODE` 不可用。

#### 14.2.4 RLS 确认（P0）

确认所有核心表（records, items, goals, phases, tags）有基于 `auth.uid()` 的 RLS policy。

#### 14.2.5 数据库 PITR 备份确认（P0）

- 登录 Supabase Dashboard 确认 PITR（Point-in-Time Recovery）已启用
- 记录当前计划的 PITR 保留天数（至少 7 天）
- 建立 `sql/migrations_history.txt`：每次执行 migration 前记录时间戳 + migration 名称 + 执行人
- 编写 `docs/operations/disaster-recovery.md`（P1）：回滚触发条件、步骤、验证、通知

**验收**：
- Supabase Dashboard 中 PITR 状态为 Enabled
- `sql/migrations_history.txt` 存在且记录了所有历史 migration

#### 14.2.6 功能开关机制（P0）

- 新建 `sql/019_feature_flags.sql`：`feature_flags(flag_name, enabled, description, rollout_percentage)`
- 表启用 RLS 但禁止客户端直接访问（仅服务端 service_role 可读）
- 实现 `src/lib/feature-flags.ts`：`isFeatureEnabled(flagName, userId?)`
- 支持基于 userId 哈希的灰度分流（`rollout_percentage` 0-100）
- 1.6 首批开关：`new_parse_engine`(false)、`debug_trace_page`(false)、`computation_v2`(false)

**验收**：
- `feature_flags` 表存在且有 RLS 保护
- `isFeatureEnabled('debug_trace_page')` 返回 false（默认关闭）
- `isFeatureEnabled('debug_trace_page', userId)` 在 rollout_percentage=100 时返回 true

### 14.3 验收方式

- SQL 查询：`SELECT has_table_privilege('anon', 'records', 'INSERT')` → false
- 审计报告 N 类（绕过 Domain 直接写 DB）高风险项 = 0
- Supabase Dashboard PITR Enabled
- `isFeatureEnabled()` 函数可正常调用并返回正确结果

---

## 15. 1.6 总验收标准（8 条链路）

### 链路 1：录入可追踪（MVP-A 核心）

输入 "今天跑步5公里花了20元"：
- 产生 trace_id（`T-YYYYMMDD-xxx` 格式）
- Agent Pipeline 10 个 Stage 全部产生 span
- 每个 Tool 调用产生 tool_call_id
- Stage 4（VALIDATE）不可跳过，校验结果有 rule_id
- 低置信度字段标记为 unchecked 但不拒绝写入（原则9）
- 以 trace_id 打开 `/debug/trace` 页面，看到完整 span 树

### 链路 2：统计可解释（MVP-B 核心）

查看"跑步"事项的统计：
- 指标通过 Computation Center + `buildStatsQuery` 获取
- `stats-eligibility` 正确排除不符合条件的记录
- computation explain 包含 computation_id、公式摘要、排除原因
- 前端展示通过 ViewModel/DTO
- 同一事项在不同入口的统计一致

### 链路 3：诊断 API 快速定位（新增核心）

录入出错后：
- 调用 `GET /api/v2/diagnose?trace_id=T-xxx`
- 返回结构化 DiagnosisResult（断点位置 + 关联 decision + 关联 rules + suggested_fix）
- `ai_prompt_summary` 是一行可读文本，大模型几百 token 即可理解问题

### 链路 4：数据可信闭环

① AI 低置信度记录 → `trust_level = 'unchecked'`
② 用户纠错 → `trust_level → 'reviewed'`
③ correction 记录绑定原 decision_id
④ **自动生成回归测试用例存入 eval/test-cases/from-production/**
⑤ 查询 corrections 表确认绑定关系

### 链路 5：规则中心闭环

- Domain Invariant Issue 触发时携带 rule_id
- API meta 中返回 RULES_VERSION
- 违反规则的请求得到标准 error_code 和 rule explain

### 链路 6：接口契约合规

- 所有 API 返回统一 `ApiSuccess<T>/ApiError` envelope
- meta 中必含 trace_id
- 前端通过 `api/client.ts` 调用，自动提取 trace_id

### 链路 7：自改进飞轮运转

- 生产错误 → 结构化 log 捕获
- `npm run test:generate-from-error` 自动生成 test_case
- `npm run test:eval` 可执行
- 修复后重新运行，test_case 通过

### 链路 8：原则违反归零（Block -1 审计通过）

- "高"风险项 = 0（前端自算、绕过 Domain 写 DB、`src/lib/` 中 React 依赖）
- "中"风险项有明确整改计划

---

## 16. 优先级总览

### P0：必须完成，不做等于白做（40 项）

| 编号 | 任务 | 所属执行块 |
|------|------|-----------|
| P0-01 | 10 条顶层架构原则文档定稿 | 基座 |
| P0-02 | 编号体系完整定义（id-registry.ts） | 块一 |
| P0-03 | Agent Pipeline 类型定义（agent-pipeline.ts） | 块一 |
| P0-04 | Tool Protocol 类型定义（tool-protocol.ts） | 块一 |
| P0-05 | Domain Registry 建立（12 域注册） | 块一 |
| P0-06 | Orchestrator 接口定义 | 块一 |
| P0-07 | 结构化 Logger 实现 | 块一 |
| P0-08 | Block -1 项目结构审计（含原则违反检测） | 块二 |
| P0-09 | API response envelope（ApiSuccess/ApiError） | 块三 |
| P0-10 | error_code 体系（完整编号） | 块三 |
| P0-11 | ViewModel/DTO 定义 | 块三 |
| P0-12 | 前端统一 API 调用封装（api/client.ts） | 块三 |
| P0-13 | 第一批 API 迁移（records + parse + goal-engine） | 块三 |
| P0-14 | **API 日期版版本化（version-router.ts + CHANGELOG.md）**（新增） | 块三 |
| P0-15 | **健康检查端点 `/api/health`**（新增） | 块三 |
| P0-16 | 可信度计算（compute-trust.ts） | 块四 |
| P0-17 | stats-eligibility 统计资格统一判定 | 块四 |
| P0-18 | 用户纠错 API（records/correct） | 块四 |
| P0-19 | corrections 表 | 块四 |
| P0-20 | 纠错自动生成回归测试（"纠错即测试"） | 块四 |
| P0-21 | RULES_VERSION + rule_id 编号 | 块五 |
| P0-22 | COMPUTATION_VERSION + computation_id 编号 | 块五 |
| P0-23 | 旧 CORE_METRICS 三步迁移（审计→deprecate→删除） | 块五 |
| P0-24 | goal-engine 查询口径接入 buildStatsQuery | 块五 |
| P0-25 | computation explain（none/summary） | 块五 |
| P0-26 | trace_id 基础传播（API handler wrapper） | 块六 |
| P0-27 | trace-span 构建器 + 分层存储 | 块六 |
| P0-28 | trace_summaries 表 | 块六 |
| P0-29 | decision_logs 表（含完整字段） | 块六 |
| P0-30 | **诊断 API `/api/v2/diagnose`**（新增） | 块六 |
| P0-31 | debug trace 最小页面 | 块六 |
| P0-32 | 至少一个录入链路完整 trace | 块六 |
| P0-33 | **test_case 自动生成器**（新增） | 块七 |
| P0-34 | **npm 测试命令集成**（新增） | 块七 |
| P0-35 | tokens.json 第一版（status/confidence/trust/semantic） | 块八 |
| P0-36 | API contract tests（records + parse + goal-engine） | 块九 |
| P0-37 | eval/ 目录结构 + 首批 3 个 golden test cases | 块九 |
| P0-38 | 生产级安全审计（软删除/RLS/migration/DEV_MODE） | 块十 |
| P0-39 | **数据库 PITR 备份确认 + migration 检查点**（新增） | 块十 |
| P0-40 | **功能开关机制（feature_flags 表 + isFeatureEnabled）**（新增） | 块十 |

### P1：应该完成（19 项）

| 编号 | 任务 | 所属执行块 |
|------|------|-----------|
| P1-01 | field_provenance 运行时计算 | 块四 |
| P1-02 | trust dashboard API | 块四 |
| P1-03 | 12 个前端组件逐步替换（读取层） | 块五 |
| P1-04 | computation full explain 模式 | 块五 |
| P1-05 | decision detail 页面 | 块六 |
| P1-06 | decision 历史 API | 块六 |
| P1-07 | 结构化日志表（structured_logs） | 块六 |
| P1-08 | debug trace 完整 span（trace_spans 表） | 块六 |
| P1-09 | 目标引擎和洞察链路完整 trace | 块六 |
| P1-10 | **WebSocket 模拟器（API 层）**（新增） | 块七 |
| P1-11 | **错误聚类 API `/api/v2/diagnose/trends`**（新增） | 块七 |
| P1-12 | 现有 API 路由重构为 Tool Protocol | 块三 |
| P1-13 | item.match 抽取为独立 Tool | 块三 |
| P1-14 | 预留域注册（D-FINANCE/D-SCHEDULE/D-LOCATION/D-SCORING/D-REVIEW/D-MAP） | 块一 |
| P1-15 | Design Token 转换器（token-loader.ts） | 块八 |
| P1-16 | API contract runner（完整版） | 块九 |
| P1-17 | 审计报告中"中"风险项清零 | 块二 |
| P1-18 | 第 3-5 批 API 迁移到新 envelope | 块三 |
| P1-19 | **备份恢复文档 + 季度恢复演练**（新增） | 块十 |

### P2：锦上添花（13 项）

| 编号 | 任务 |
|------|------|
| P2-01 | 完整 trust dashboard（UI 页面） |
| P2-02 | 全站 UI tokens 接入 |
| P2-03 | 6 个基础 UI 组件 |
| P2-04 | behavior_id 实装 |
| P2-05 | 完整 Eval 飞轮自动化（定时触发） |
| P2-06 | Agent Trajectory Test |
| P2-07 | WebSocket 模拟器 UI 层（accessibility tree 验证） |
| P2-08 | 规则自我建议（纠错模式累积触发） |
| P2-09 | Multi-Agent 协作预留接口 |
| P2-10 | iOS Client Adapter 完整文档 |
| P2-11 | 地图 API 接入（D-MAP） |
| P2-12 | AI 自动评分（D-SCORING） |
| P2-13 | 审计报告中"低"风险项清零 |

---

## 17. 1.6 执行顺序

### 第一阶段：类型基建 + 审计

- **执行块一**（架构基座）：9 个类型文件全部建立 + 编译通过
- **执行块二**（前置审计）：审计报告输出，"高"风险项清单明确

### 第二阶段：接口契约 + 数据可信

- **执行块三**（接口契约）：API Envelope + ViewModel + error_code + 前端 client.ts
- **执行块四**（数据可信）：compute-trust + stats-eligibility + 纠错 API + 纠错即测试

### 第三阶段：规则/计算闭环 + 可观测性

- **执行块五**（规则与计算闭环）：RULES_VERSION / COMPUTATION_VERSION / CORE_METRICS 迁移 / compute explain
- **执行块六**（可观测性）：trace-span + trace_summaries + decision_logs + debug trace + 诊断 API

### 第四阶段：自改进工作流 + 设计令牌 + Eval Harness

- **执行块七**（自改进工作流）：test_case 自动生成器 + WebSocket 模拟器 + npm 命令
- **执行块八**（设计令牌）：tokens.json + token-loader.ts
- **执行块九**（Eval Harness）：eval/ 目录 + API runner + 3 个 test cases
- **执行块十**（安全审计）：软删除 / RLS / migration / DEV_MODE

### 阶段间门禁

**每个阶段结束前，必须跑一次链路验收。前一阶段未验收通过，不进入下一阶段。**

---

## 18. 1.6 明确后移的内容

以下内容保留方向，但不作为 1.6 当前必须交付：

1. 完整 Eval 飞轮自动化（定时触发、自动创建 GitHub Issue）（P2）
2. Agent Trajectory Test（P2）
3. WebSocket 模拟器 UI 层（accessibility tree 验证）（P2）
4. Multi-Agent 协作实现（P2）
5. iOS Client Adapter 实现（P2）
6. 全站 UI tokens 接入（P2）
7. 6 个基础 UI 组件新建（P2）
8. behavior_id 实装（P2）
9. D-FINANCE / D-SCHEDULE / D-LOCATION / D-SCORING / D-REVIEW / D-MAP 域拆分实现
10. 完整 trust dashboard UI 页面（P2）
11. 地图 API 接入（D-MAP）（P2）
12. AI 自动评分系统（D-SCORING）（P2）
13. 规则自我建议（P2）

---

## 19. 1.6 明确不做的事

1. 新增用户可见的功能（新页面、新图表、新洞察类型）
2. 改变现有 UI 布局和交互流程
3. 引入新的 AI 能力（建议型洞察、自动规划、AI 打分）
4. 扩展数据模型（新记录类型、新维度）
5. 修改已部署的 SQL migration
6. 物理删除任何用户数据
7. 新增需要手动填写 5+ 字段的表单
8. 在组件中硬编码颜色/间距/字号值
9. 让 Agent 或 Tool 绕过 Domain Service 直接写 DB
10. 前端自算新的聚合指标
11. 多人协作/排名
12. 企业/团队/家庭联动
13. 移动端优先重做

**但可以预留数据结构**：为 D-LOCATION（地图）、D-SCORING（AI打分）、D-MAP（LBS）等预留域注册和数据字段，1.6 不实装。

---

## 20. 1.6 当前唯一优先动作

> **先按本清单执行第一阶段：架构基座块（全部类型文件建立 + 编译通过）+ 前置审计块（审计报告输出）。**

在第一阶段未验收通过前，不进入：
- API 契约重构
- trace/decision 落地
- CORE_METRICS 迁移
- 诊断 API 实现
- 自改进工作流
- 设计令牌
- Eval Harness

---

## 21. 1.6 最需要防的坑

1. **执行块一变成"纯写类型，不验证可用性"**——每个类型必须跟着一个最小可行的使用示例
2. **审计报告出来后直接跳到修复，跳过"设计修复方案"**——高风险项必须先设计再动手
3. **1.6 过程中 1.5 既有功能被破坏**——每完成一个执行块，必须跑一遍 1.5 的核心验收链路
4. **CORE_METRICS 迁移不完整导致统计口径分裂**——迁移后确认旧文件零引用
5. **编号体系只写不接入**——每个编号不能只是定义，必须在对应的代码里接入 generate 函数
6. **诊断 API 只返回原始数据不聚合**——不只是返回 DB 行，必须聚合为 DiagnosisResult（含断点、关联 decision、suggested_fix）
7. **test_case 自动生成后从不运行**——必须 `npm run test:eval` 可一键执行
8. **把架构基座块的类型定义当作"不用验收的文字工作"**——类型定义必须通过 tsc 编译 + 至少一个实际使用验证
9. **纠错即测试被忽略**——每次用户纠错就是一免费的回归测试用例，必须自动化

---

## 22. 这份清单的使用方式

使用顺序固定为：

1. **蓝图定边界**——《TETO 1.6 工程底座重构蓝图 V0.4》
2. **总执行清单定范围和顺序**——本清单
3. **当前执行清单定这一阶段唯一动作**——从本清单拆出的单阶段任务清单
4. **单任务提示词给 AI 编程工具**——每个必做项一个独立提示词
5. **按验收链路验证**——对照第 15 章 8 条链路逐条验证
6. **通过后再进入下一块**——阶段门禁未通过，不进入下一阶段

---

## 23. 1.6 与前序版本的衔接

| 文件 | 关系 |
|------|------|
| 《TETO 1.6 工程底座重构蓝图 V0.4》 | 架构设计文档——定义边界、原则、模块结构（含第十八章可观测性增强） |
| 《TETO 1.6 总执行清单》（本文件） | 执行清单——定义范围、顺序、验收标准 |
| 《TETO 1.6 版本说明》 | 版本定位——描述为什么需要 1.6 和 1.6 要解决什么问题 |
| 《TETO 1.5 总执行清单》 | 参考模型——本清单的结构参照 1.5 清单模式 |

**三文档关系**：
```
版本说明（为什么） → 蓝图（做什么、边界在哪） → 总执行清单（怎么做、如何验收）
```

---

*TETO 1.6 总执行清单 V1.0*
*综合了 V0.4 蓝图（含第十八章可观测性增强与自改进自动化工作流）、1.5 清单模式、业界最佳实践（Anthropic Harness Engineering / Building Effective Agents / Claude Code Harness / OpenAI Agents SDK）*
*对应蓝图版本：V0.4*
