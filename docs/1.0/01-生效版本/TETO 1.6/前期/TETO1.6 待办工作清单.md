# TETO 1.6 待办工作清单

> 不含多Agent。聚焦地基未完工部分 + 黑盒消灭。

---

## 1. Pipeline VALIDATE 阶段 — 接入不变式校验

**现状**：pipeline-runner.ts 第 188-192 行，VALIDATE 是 no-op（status: 'skipped'）。
**目标**：Pipeline 内调用 domain invariants，出来的数据天然正确，不再依赖外部门禁。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 1.1 | `pipeline-runner.ts` | VALIDATE 阶段改为调用 `validateRecordInvariants()` 等不变式函数 |
| 1.2 | `pipeline-runner.ts` | 校验失败时把 issues 写进 `PipelineStepResult`，pipeline 返回 `overallStatus: 'failed'` |
| 1.3 | `pipeline-runner.ts` | 补充 VERIFY 阶段（Stage 6）：写入后读回确认数据正确性 |

---

## 2. 计算中心唯一性 — 确认无散落计算

**现状**：已核实 domain 层无业务计算（只有 batch count）。但需正式验证。
**目标**：所有统计/差额/洞察计算只经过 `src/lib/stats/` 和 `src/lib/db/goal-engine.ts`、`insights.ts`。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 2.1 | `src/app/api/v2/diagnose/` | 核实诊断接口是否走 stats-engine，无裸算 |
| 2.2 | `src/lib/computation/index.ts` | 检查 COMPUTATION 对象是否被 stats/goal/insights 引用（而非硬编码） |
| 2.3 | 全局 | grep 残留的裸 `reduce/sum/avg` 排除非计算中心文件后确认 |

---

## 3. 行为模式编号落地（P0）

**现状**：`genBehaviorId()` 定义在 `id-registry.ts` 第 74 行，但 0 处调用。
**目标**：给 `lib/` 下每个关键函数一个稳定编号，AI 报错时直接定位"第几个小朋友断了"。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 3.1 | 新建 `src/lib/observability/behavior-registry.ts` | 文件级静态编号表：`B-001 ~ B-NNN`，每个编号对应一个函数 |
| 3.2 | `src/lib/ai/parse-semantic.ts` | `parseSemantic()` 开头调 `genBehaviorId('B-xxx')` 写入 span |
| 3.3 | `src/lib/ai/enhance-record.ts` | `enhanceRecord()` 同上 |
| 3.4 | `src/lib/utils/item-match.ts` | `matchItemSmart()` 同上 |
| 3.5 | `src/lib/domain/record-service.ts` | `createRecord()` / 各 domain service 核心函数同上 |
| 3.6 | `src/lib/stats/metrics.ts` | 统计计算函数同上 |
| 3.7 | `src/lib/db/goal-engine.ts` | 目标差额计算函数同上 |

---

## 4. LLM thinking 持久化（P0）

**现状**：DeepSeek 返回的 `thinking` 字段在 `validateAndFixSemantic()` 之后丢弃了。
**目标**：存到 `decision_logs` 表或 `parsed_semantic` JSON 中，让 LLM 推理过程可追溯。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 4.1 | `src/lib/ai/parse-semantic.ts` | `rawJson.units[].thinking` 在 `validateAndFixSemantic()` 前提取保存 |
| 4.2 | `src/lib/ai/parse-semantic.ts` | 将 thinking 写入返回的 ParsedSemantic 结构（或额外字段） |
| 4.3 | SQL | 考虑在 `records.parsed_semantic` 中增加 thinking 字段，或在 `decision_logs` 中记录 |

---

## 5. 副作用日志（P1）

**现状**：`enhanceRecord()` 回写了哪些字段、匹配了哪个事项，没有日志。
**目标**：每次增强的副作用写入 `decision_logs`。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 5.1 | `src/lib/ai/enhance-record.ts` | 增强前后对比：记录回写了哪些字段、值变化 |
| 5.2 | `src/lib/ai/enhance-record.ts` | 记录匹配到的事项 ID、匹配策略类型（exact/fuzzy/keyword） |
| 5.3 | `src/lib/ai/enhance-record.ts` | 调用 `genDecisionId('ENHANCE')` 写入 `decision_logs` |

---

## 6. 匹配链路日志（P1）

**现状**：`matchItemSmart()` 返回结果，但不知道走了哪步匹配（精确/包含/模糊/关键词扫描）。
**目标**：每步命中情况可查。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 6.1 | `src/lib/utils/item-match.ts` | 每个匹配阶段输出结构化日志（阶段名、候选数、结果） |
| 6.2 | `src/lib/utils/item-match.ts` | 调用 `genDecisionId('ITEM_MATCH')` 记录最终决策 |

---

## 7. 计算中间态（P2）

**现状**：stats-engine 只输出最终结果，中间步骤不可见。
**目标**：trace 中记录关键中间值。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 7.1 | `src/lib/stats/metrics.ts` | 关键指标计算时用 `startSpan/endSpan` 记录中间态 |
| 7.2 | `src/lib/db/goal-engine.ts` | 目标差额计算中间值记录 |

---

## 8. RLS 拦截原因（P2）

**现状**：Postgres RLS 拒绝了，只知道写入失败。
**目标**：捕获具体 RLS policy 名称。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 8.1 | `src/lib/supabase/server.ts` | Supabase 错误中提取 RLS policy 信息 |
| 8.2 | 全局 domain service | 写入失败时把 RLS 原因写进 error_code |

---

## 9. 设计令牌接入（P3）

**现状**：`src/design/tokens.json` 定义完整但 0 处引用。
**目标**：Tailwind 配置从 tokens.json 读取，改一处全站生效。

| 子任务 | 文件 | 做什么 |
|-------|------|--------|
| 9.1 | 新建 `src/design/loader.ts` | 读取 tokens.json，导出为 Tailwind extend 格式 |
| 9.2 | `tailwind.config.cjs` | `extend.colors` 从 loader 读取而非硬编码 |

---

## 执行顺序

```
1.VALIDATE/VERIFY  →  2.计算中心核实  →  3.行为编号(P0)  →  4.thinking持久化(P0)
                                                 ↓
                              5.副作用日志(P1)  →  6.匹配链路(P1)
                                                 ↓
                              7.计算中间态(P2)  →  8.RLS原因(P2)
                                                 ↓
                                           9.设计令牌(P3)
```

每完成一项 `npm run build` 必须通过。
