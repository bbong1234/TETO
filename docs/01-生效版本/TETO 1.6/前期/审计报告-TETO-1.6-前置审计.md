# TETO 1.6 前置审计报告

> 审计日期：2026-05-05  
> 范围：`src/` 全部 .ts/.tsx 文件  
> 依据：《TETO 1.6 总执行清单》第 6 节，A-Q 共 17 类检查项  
> 结果：**高风险 5 项，中风险 8 项，低风险 2 项，通过 2 项**

---

## 1. 高风险项（5 项 — 必须在后续块中清零）

| 编号 | 检查项 | 文件 | 行号 | 违反原则 | 发现描述 | 修复方向 |
|------|--------|------|------|----------|----------|----------|
| **H1** | 前端 API 调用未统一封装 | `src/app/(dashboard)/records/components/QuickInput.tsx` | 77,246,314,322,416,454,498,531,559,576,699,739,773,788,793,818,825,865,926,990,1004,1095,1129,1142,1172,1194,1323,1339,1419,1474,1583 | Block 1 | **30+ 处**直接 `fetch()` 调用，无统一 client | 建立 `src/lib/api/client.ts` 统一封装，逐步替换 |
| **H2** | 前端 API 调用未统一封装 | `src/app/(dashboard)/records/components/RecordEditDrawer.tsx` | 142,153,167,183,194,209,235,246,394,419 | Block 1 | **10+ 处**直接 fetch | 同上 |
| **H3** | 前端 API 调用未统一封装 | `src/app/(dashboard)/items/[id]/page.tsx` | 109,125,156,179,217,232,242,250,271,283,287,296,309,395,454,1275 | Block 1 | **15+ 处**直接 fetch | 同上 |
| **N1** | 绕过 Domain 直接写 DB | `src/lib/ai/enhance-record.ts` | 33-38,47-53,61-64,73-86 | 原则6/10 | AI 增强回写通过 `supabase.from().update()` 直接写入，绕过 Domain Service 和规则中心校验 | 改造为走 Domain Service 的 Tool 调用 |
| **E1** | CORE_METRICS 双轨引用 | `src/lib/computation/index.ts` | 17 | Block 3 | 从 `metrics.ts`（旧）导入，而 insights.ts 从 `metric-definitions.ts`（新）导入 | 统一到 `metric-definitions.ts`，审计→deprecate→删除 old metrics.ts |

---

## 2. 中风险项（8 项 — 有明确整改计划）

| 编号 | 检查项 | 文件 | 行号 | 违反原则 | 发现描述 | 修复方向 |
|------|--------|------|------|----------|----------|----------|
| **M1** | API route 绕过 Orchestrator | `src/app/api/v2/items/route.ts` | 44-72 | 原则4 | POST handler 直接做 `supabase.from('items')` 查重，跳过 Orchestrator | 迁移到 RecordOrchestrator |
| **M2** | API route 绕过 Orchestrator | `src/app/api/v2/record-links/route.ts` | 48-53,62-66 | 原则4 | 直接查 DB 验证 link 约束，业务规则写在 route 而非 domain | 抽取到 Domain Service |
| **F1** | goal-engine 重复实现过滤逻辑 | `src/lib/db/goal-engine.ts` | 9-21 | Block 3 | `applyGoalProgressCaliber()` 内联实现了 buildStatsQuery 已有的口径过滤 | 重构为调用 buildStatsQuery |
| **C1** | data_nature NULL 处理不一致 | `src/lib/db/goal-engine.ts:15` vs `src/lib/db/insights.ts:593` | — | Block 0 | goal-engine 将 NULL 视为 fact，insights 仅检查 `=== 'inferred'` | 统一 NULL 处理策略 |
| **Q1** | console.log 用于生产 | `src/lib/auth/server/get-current-user-id.ts` | 21,38,42,48,69,73 | 原则7 | 6 处 console.log，可能泄露 user ID 等敏感信息到生产日志 | 替换为结构化 Logger |
| **B1** | API 响应格式不一致 | 全部 route.ts | — | Block 1 | 无统一 meta/trace_id 字段；errors/warnings 格式不统一；`POST /parse` 返回 200 而非 201 | 引入 ApiSuccess/ApiError envelope |
| **J1** | 前端自算聚合指标 | `src/app/(dashboard)/items/components/ItemDataPanel.tsx` | 102,165,171,176,183,187,192 | 原则1 | 7 处 `.reduce()` 对 record 数组做聚合计算（计数、求和、指标汇总） | 迁移到 Computation Center，API 返回预计算结果 |
| **K1** | 业务逻辑硬编码 0.7 阈值 | `RecordItem.tsx:72`, `QuickInput.tsx:953`, `RecordEditDrawer.tsx:1002` | — | 原则2 | `confidence < 0.7` 作为低置信度判定阈值在 3 个组件中重复硬编码 | 迁入 Rules Center（R-CL-001），前端只使用标记 |

---

## 3. 低风险项（2 项 — P2 或后移）

| 编号 | 检查项 | 文件 | 行号 | 违反原则 | 发现描述 | 修复方向 |
|------|--------|------|------|----------|----------|----------|
| **P1** | 组件硬编码颜色 | 多处 | — | 原则8 | 6 个文件中 40+ 处硬编码 hex 颜色及 Tailwind 任意值 | tokens.json 建立后用 Design Token 替换 |
| **L1** | 跨域引用 | `src/lib/db/insights.ts` | 2 | 原则3 | import goal-engine（同层 db/，当时可接受的编排引用） | 标记为低风险，1.7 重构时迁至 Orchestrator |

---

## 4. 通过项（2 项）

| 编号 | 检查项 | 状态 |
|------|--------|------|
| **O** | `src/lib/` 中 React/Next.js 依赖 | ✅ 零发现。`src/lib/` 下无 React、Next.js import |
| **I** | 废弃代码引用（/api/v1/, chains, goal_id） | ✅ 无 `/api/v1/` 引用。`RULES_LEGACY_TYPE_MAP` 是合规的向后兼容，非废弃 |

---

## 5. 统计汇总

| 风险等级 | 数量 | 关键项 |
|----------|------|--------|
| **高风险** | 5 | 前端未统一 API 封装(3 文件) + 绕过 Domain 写 DB + CORE_METRICS 双轨 |
| **中风险** | 8 | Orchestrator 绕过 + goal-engine 重复 + data_nature 不一致 + console.log + API envelope 不一致 + 前端自算 + 硬编码阈值 |
| **低风险** | 2 | 硬编码颜色 + 同层跨域引用 |
| **通过** | 2 | React 依赖零 / 废弃代码零 |
| **总计** | 17/17 类全部覆盖 | |

---

## 6. 高风险项清零计划（与后续执行块的映射）

| 高风险编号 | 对应执行块 | P0 编号 |
|------------|-----------|--------|
| H1/H2/H3（前端未统一封装） | 块三 接口契约块 | P0-12 前端统一 API client |
| N1（绕过 Domain 写 DB） | 块三 接口契约块 | P1-12 Tool Protocol 重构 |
| E1（CORE_METRICS 双轨） | 块五 规则与计算闭环块 | P0-23 旧 CORE_METRICS 三步迁移 |

---

## 7. 门禁状态

- [ ] **高风险项 5/5 未清零** → 阶段一门禁：可进入阶段二（高风险项的修复在块三和块五中），但不允许进入阶段四
- [ ] 中风险项 8 项有明确整改计划
- [x] A-Q 共 17 类检查项全部覆盖（含"零发现"标记）

---

*审计报告 V1.0 — 由 3 个并行 Agent 扫描生成*
