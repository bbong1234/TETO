# RULES 规则中心 + COMPUTATION 计算中心 — 实施计划

## Context

TETO 1.5 规划文档要求建立规则中心和计算中心，将散落在 15+ 文件中的 100+ 硬编码规则和计算口径集中管理为单一来源（Single Source of Truth）。

### 与 P1-P5 的关系

**P1-P5 是运行时执行层，RULES/COMPUTATION 是声明层，两者互补不重叠：**

| P1-P5 已完成 | RULES/COMPUTATION 补什么 |
|-------------|------------------------|
| P1 record-invariants 校验规则 | RULES.lifecycle 集中定义状态枚举和阈值 |
| P3 ai-write-policy 写入策略 | RULES.fallback 和 RULES.lifecycle.AI_FIELD_POLICIES 集中引用 |
| P4 metric-definitions + record-filters | COMPUTATION.metrics 包裹 P4 产物，新增 time_windows/data_scope/comparison |
| P5 transaction-service 事务化 | 不涉及，RULES/COMPUTATION 不管运行时 |

**P1-P5 的代码完全保留不动**，RULES/COMPUTATION 只是从中 re-export 并补上散落在他处的常量。

当前状态：
- 系统规则散落在 `teto.ts`、`parse-rules-fallback.ts`、`parseNaturalInput.ts` 等多处
- 计算口径硬编码在 `insights.ts`、`goal-engine.ts`、`metrics.ts` 中
- moodMap/energyMap/bodyMap 在两个文件中**各写了一遍**
- 魔法数字（0.7、0.85、14、180、2000 等）无名无姓

目标：创建 `src/lib/rules/index.ts` 和 `src/lib/computation/index.ts` 两个声明式中心，并让各模块从中心读取而非硬编码。

---

## STEP 1: 创建 `src/lib/rules/index.ts`

**新建文件**：`src/lib/rules/index.ts`

导出 `RULES` 常量对象，5 个类别：

### record_type
- `ALL`: re-export `RECORD_TYPES` from `@/types/teto`
- `NORMALIZATION_MAP`: `{ '情绪': '发生', '花费': '发生', '结果': '发生' }` — 从 teto.ts 的 normalizeRecordType 提取
- `normalize`: re-export `normalizeRecordType` from `@/types/teto`

### parsing
- `ACTION_TEXT_MAX_LENGTH`: 4
- `ACTION_TEXT_MIN_LENGTH`: 2
- `AUTO_CLASSIFY_THRESHOLD`: 0.85（from parseNaturalInput.ts）
- `LOW_CONFIDENCE_THRESHOLD`: 0.7（from enhance-record.ts）
- `MAX_INPUT_LENGTH`: 2000（from optimize-input/route.ts）
- `TIME_PRECISION_LEVELS`: `['exact', 'approx', 'fuzzy', 'unknown']`
- `MOOD_MAP`: 合并 parseNaturalInput.ts + parse-rules-fallback.ts 的关键词（取并集）
- `ENERGY_MAP`: 合并两个文件的能量关键词
- `BODY_STATE_MAP`: 两个文件相同，直接复用
- `STATUS_MAP`: from parseNaturalInput.ts
- `TIME_ANCHOR_MAP`: 两个文件相同，直接复用
- `TYPE_KEYWORDS`: `{ plan: [...], idea: [...], summary: [...], completion: [...] }` — 合并两文件

### classification
- `VALID_DATA_NATURES`: `['fact', 'inferred']`（需先从 record-invariants.ts 导出）
- `VALID_PERIOD_FREQUENCIES`: `['daily', 'weekly', 'monthly', 'irregular']`
- `OUTCOME_TYPE_LABELS`: re-export from `@/types/teto`
- `PLACE_TYPE_LABELS`: re-export from `@/types/teto`
- `MONEY_DIRECTION_LABELS`: re-export from `@/types/teto`
- `OUTCOME_DIRECTION_LABELS`: re-export from `@/types/teto`

### lifecycle
- `RECORD_STATUSES`: re-export `LIFECYCLE_STATUSES` from `@/types/teto`
- `TERMINAL_STATUSES`: `['completed', 'postponed', 'cancelled']`（需先从 record-lifecycle-invariants.ts 导出）
- `ITEM_STATUSES`: re-export from `@/types/teto`
- `GOAL_STATUSES`: re-export from `@/types/teto`
- `PHASE_STATUSES`: re-export from `@/types/teto`
- `STAGNATION_THRESHOLD_DAYS`: 14
- `AI_FIELD_POLICIES`: re-export from `@/lib/domain/ai-write-policy`

### fallback
- `FALLBACK_CONFIDENCE`: 0.3
- `on_llm_unavailable`: `'use_parseNaturalInput'`
- `ai_write_policy`: `'fill_empty_only'`

---

## STEP 2: 创建 `src/lib/computation/index.ts`

**新建文件**：`src/lib/computation/index.ts`

导出 `COMPUTATION` 常量对象，4 个子模块：

### metrics
- `CORE_METRICS`: re-export from `@/lib/stats/metric-definitions`
- `buildStatsQuery`: re-export from `@/lib/stats/record-filters`
- `explainMetric`: re-export from `@/lib/stats/metric-explain`
- `STAGNATION_THRESHOLDS`: `{ ACTIVE: 7, MILD: 14, MODERATE: 30 }`（from metrics.ts stagnationLevel）
- `ACTIVITY_SCORE_WEIGHTS`: `{ RECENT_7D: 40, FREQ_30D: 30, RECENCY: 30 }`（from metrics.ts computeActivity，权重为分值上限）

### time_windows
- `HEATMAP_DAYS_BACK`: 180
- `STANDARD_WINDOWS`: `{ WEEK: 7, MONTH: 30, QUARTER: 90, HALF_YEAR: 180 }`
- `PERIOD_DAYS`: `{ '每天': 1, '每周': 7, '本周': 7, '每月': 30, '本月': 30, '每年': 365 }`（from goal-engine.ts getPeriodDays）
- `ROLLING_LABELS`: `{ '7d': '近 7 天', '30d': '近 30 天' }`（from insights.ts computeRangeLabel）

### data_scope
- `STAGNATION_THRESHOLD_DAYS`: 14（from insights.ts 停滞检测）
- `ITEM_CHANGE_DIFF_THRESHOLD`: 3（from insights.ts 事项级变化展示阈值）
- `DEFAULT_INCLUDE_TYPES`: `['发生', '总结']`（大多数 insight 指标的默认记录类型）

### comparison
- `SCOPES`: `['week', 'month'] as const`
- `TIME_DISTRIBUTION_SLOTS`: `{ morning: { start: 6, end: 12 }, afternoon: { start: 12, end: 18 }, evening: { start: 18, end: 22 }, night: { start: 22, end: 6 } }`
- `WEEK_START_DAY`: 1（Monday）

---

## STEP 3: 导出 domain 私有常量

**修改**：`src/lib/domain/record-invariants.ts`
- `const VALID_DATA_NATURES` → `export const VALID_DATA_NATURES`
- `const VALID_PERIOD_FREQUENCIES` → `export const VALID_PERIOD_FREQUENCIES`

**修改**：`src/lib/domain/record-lifecycle-invariants.ts`
- `const TERMINAL_STATUSES` → `export const TERMINAL_STATUSES`

---

## STEP 4: 更新 `parse-rules-fallback.ts` 从 RULES 读取

**修改**：`src/lib/ai/parse-rules-fallback.ts`
- Import `TIME_ANCHOR_MAP`, `MOOD_MAP`, `ENERGY_MAP`, `BODY_STATE_MAP`, `TYPE_KEYWORDS`, `FALLBACK_CONFIDENCE` from `@/lib/rules`
- 删除本地的 `TIME_ANCHOR_MAP`、`moodMap`、`bodyMap`、`energyMap`、`planKeywords`、`ideaKeywords`、`summaryKeywords` 定义
- 函数逻辑不变，仅数据来源从本地常量改为 RULES 导入

---

## STEP 5: 更新 `parseNaturalInput.ts` 从 RULES 读取

**修改**：`src/lib/utils/parseNaturalInput.ts`
- Import `MOOD_MAP`, `ENERGY_MAP`, `BODY_STATE_MAP`, `STATUS_MAP`, `TIME_ANCHOR_MAP`, `TYPE_KEYWORDS`, `AUTO_CLASSIFY_THRESHOLD` from `@/lib/rules`
- 删除本地的 `moodMap`、`energyMap`、`bodyStateMap`、`statusMap`、`actionMap`、`compoundPatterns`、`planKeywords`、`ideaKeywords`、`summaryKeywords`、`completionKeywords` 定义
- 替换硬编码 `0.85` 为 `RULES.parsing.AUTO_CLASSIFY_THRESHOLD`

---

## STEP 6: 更新 `enhance-record.ts` 从 RULES 读取

**修改**：`src/lib/ai/enhance-record.ts`
- Import `LOW_CONFIDENCE_THRESHOLD` from `@/lib/rules`
- 替换硬编码 `0.7`（约 line 297）

---

## STEP 7: 更新 `optimize-input/route.ts` 从 RULES 读取

**修改**：`src/app/api/v2/optimize-input/route.ts`
- Import `MAX_INPUT_LENGTH` from `@/lib/rules`
- 替换硬编码 `2000`（line 28）

---

## STEP 8: 更新 `insights.ts` 从 COMPUTATION 读取

**修改**：`src/lib/db/insights.ts`
- Import `COMPUTATION` from `@/lib/computation`
- 替换硬编码 `180`（line 82）→ `COMPUTATION.time_windows.HEATMAP_DAYS_BACK`
- 替换硬编码 `14 * 24 * 60 * 60 * 1000`（line 327）→ `COMPUTATION.data_scope.STAGNATION_THRESHOLD_DAYS * 24 * 60 * 60 * 1000`
- 替换 `Math.abs(diff) >= 3`（line 556）→ `Math.abs(diff) >= COMPUTATION.data_scope.ITEM_CHANGE_DIFF_THRESHOLD`
- 替换 `computeTimeDistribution` 中的硬编码小时范围 → `COMPUTATION.comparison.TIME_DISTRIBUTION_SLOTS`
- 替换 `computeRangeLabel` 中的 7/30 → `COMPUTATION.time_windows.STANDARD_WINDOWS`

---

## STEP 9: 更新 `goal-engine.ts` 从 COMPUTATION 读取

**修改**：`src/lib/db/goal-engine.ts`
- Import `COMPUTATION` from `@/lib/computation`
- 替换 `getPeriodDays()` 中的硬编码 1/7/30/365 → `COMPUTATION.time_windows.PERIOD_DAYS`
- 保留 `applyGoalProgressCaliber`（运行时查询构建器，非声明式配置）

---

## STEP 10: 更新 `metrics.ts` 从 COMPUTATION 读取

**修改**：`src/lib/stats/metrics.ts`
- Import `COMPUTATION` from `@/lib/computation`
- 替换 `stagnationLevel()` 中的 7/14/30 → `COMPUTATION.metrics.STAGNATION_THRESHOLDS`
- 替换 `computeActivity()` 中的 40/30/30 → `COMPUTATION.metrics.ACTIVITY_SCORE_WEIGHTS`

---

## STEP 11: 部分更新 `parse-semantic.ts` 引用 RULES

**修改**：`src/lib/ai/parse-semantic.ts`
- Import `RECORD_TYPE_RULES` from `@/lib/rules`
- 在 LLM prompt 中，将硬编码的 `["发生", "计划", "想法", "总结"]` 替换为引用 `RULES.record_type.ALL` 的插值
- 将 "2-4个字" 替换为引用 `RULES.parsing.ACTION_TEXT_MIN_LENGTH` 和 `ACTION_TEXT_MAX_LENGTH` 的插值
- 不改动 prompt 中的描述性文本（复合句拆分规则等）

---

## 验证

1. 每完成 2-3 步后运行 `npm run build` 确认无类型错误
2. 全部完成后 `npm run build` 必须通过
3. 核心不变量：所有运行时行为与改动前完全一致 — RULES/COMPUTATION 只做声明，不引入新逻辑
4. 抽查验证：停滞天数阈值仍为 14、事项匹配置信度仍为 0.85、action_text 长度限制仍为 4

---

## 文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/rules/index.ts` | RULES 规则中心声明 |
| 新建 | `src/lib/computation/index.ts` | COMPUTATION 计算中心声明 |
| 修改 | `src/lib/domain/record-invariants.ts` | 导出 VALID_DATA_NATURES/VALID_PERIOD_FREQUENCIES |
| 修改 | `src/lib/domain/record-lifecycle-invariants.ts` | 导出 TERMINAL_STATUSES |
| 修改 | `src/lib/ai/parse-rules-fallback.ts` | 从 RULES 读取关键词映射 |
| 修改 | `src/lib/utils/parseNaturalInput.ts` | 从 RULES 读取关键词映射和阈值 |
| 修改 | `src/lib/ai/enhance-record.ts` | 从 RULES 读取置信度阈值 |
| 修改 | `src/app/api/v2/optimize-input/route.ts` | 从 RULES 读取输入长度限制 |
| 修改 | `src/lib/db/insights.ts` | 从 COMPUTATION 读取时间窗口和阈值 |
| 修改 | `src/lib/db/goal-engine.ts` | 从 COMPUTATION 读取周期天数 |
| 修改 | `src/lib/stats/metrics.ts` | 从 COMPUTATION 读取停滞/活跃度权重 |
| 修改 | `src/lib/ai/parse-semantic.ts` | 从 RULES 插值记录类型和长度限制到 prompt |
