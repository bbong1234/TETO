# TETO 1.5 完成报告

## 一、版本信息

- 项目名称：TETO
- 版本号：1.5
- 阶段类型：录入清分与统计口径稳定化
- 报告性质：真实结项报告
- 对应思路文档：
  - 《TETO 1.5 蓝图方案》
  - 《TETO 1.5 总执行清单》
  - 《TETO 发展规划路线图 Spec v3》
  - 《TETO 1.5 项目说明文档》

---

## 二、结项结论

TETO 1.5 已完成结项。

本阶段的核心不是在四维事项上继续叠加功能，而是完成了 **三个质变**：

1. **记录从"散装字段"升级为"三层九组的结构化语法对象"**——每条记录不再是 50+ 个扁平字段的集合，而是被组织为 L1 原始层（原文+主表达）、L2 主链层（8 组可独立统计的语义组）、L3 附属属性层（3 组修饰/组织/关联），字段边界严格，统计口径清晰。

2. **系统从"各处硬编码"升级为"声明层驱动的统一计算架构"**——规则中心（Rules Center）统管记录类型规则、解析规则、归类规则、状态流转规则、AI 降级规则；计算中心（Computation Center）统管核心指标定义、时间窗口、数据过滤口径。参数与逻辑分离，统计口径一致。

3. **目标从"三型分立"升级为"规则驱动的统一引擎"**——三种目标类型（一次性完成/周期性达成/周期性限制）不再由 measure_type 决定行为，而是由 rule_type + operator + period 统一描述，goal-engine 基于同一套计算逻辑输出进度、配速、差额、超限预警。

当前已确认：

- 三层九组数据模型已完整落地
- 规则中心与计算中心已完整实现并接入解析引擎和洞察模块
- 目标引擎已重构为三种规则类型 + 统一计算逻辑
- AI 降级模式已完整实现（parse-rules-fallback.ts），系统在 AI 不可用时仍可正常录入
- 语义解析前端展示已升级（语义卡片 + 歧义澄清框 + 置信度分级）
- DEV_MODE 安全加固已完成，生产环境自动禁用
- 数据库性能优化已完成（RLS 友好复合索引 + 旧弱索引清理）
- 类型定义去重已完成（Update 类型用 Omit 从 Create 类型派生）
- 数据完整性诊断系统已实现（13 项检查）

因此，TETO 1.5 的真实结论是：

> **录入清分与统计口径稳定化目标已落地，系统已从"结构化记录 + 四维事项 + 增强洞察"推进为"语法化记录 + 声明层架构 + 规则驱动引擎"的稳定计算系统；记录内部有了三层九组的语法结构，系统内部有了规则中心与计算中心的统一口径，目标引擎有了三种规则的统一计算逻辑。**

---

## 三、1.5 的阶段定位

TETO 1.5 的定位，不是 1.4 的功能补充，而是：

> **对 1.4 语义引擎与四维事项的口径稳定化。**

1.4 解决的是"事项内部怎么组织、记录内部怎么结构化"的问题，1.5 解决的是：

- 记录内部结构到底怎么分层分组（三层九组模型）
- 系统各处的计算参数到底由谁说了算（规则中心 + 计算中心）
- 目标引擎的三种类型到底怎么统一计算（规则驱动重构）
- AI 不可用时系统到底能不能继续工作（降级模式）
- 生产环境到底会不会因为 DEV_MODE 泄漏 RLS（安全加固）

所以 1.5 不是把系统铺宽，而是把系统打稳。

---

## 四、1.5 的核心变化：三根定梁的架设

### 4.1 旧结构：散装字段 + 硬编码参数 + 分立目标

1.4 及之前，记录、系统和目标的结构是：

- 记录有 50+ 个字段，但没有分层分组，时间组/因果组/量化组混在一起
- 解析规则、统计口径、阈值分散在各个文件中硬编码
- 目标的三种度量类型（boolean/numeric/repeat）各有各的计算逻辑
- AI 不可用时系统只有前端基础正则，无法进行后端降级解析
- DEV_MODE 在客户端无生产环境保护

这导致：

- 统计口径不一致：同一个指标在不同地方用不同的阈值和算法
- 目标引擎逻辑分散：三种类型各有各的代码路径，难以统一扩展
- 字段边界模糊：mood 和 cause_text 分不清，location 包含状态信息
- AI 单点依赖：LLM 挂掉时系统只能靠前端基础解析，后端增强完全不可用

### 4.2 新结构：三层九组 + 声明层架构 + 规则驱动引擎

1.5 将记录、系统和目标同时稳定化：

**记录三层九组模型：**

| 层 | 组 | 回答的问题 | 字段 |
|----|----|-----------|------|
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
| L3-B 组织组 | 管理状态？ | review_status, confidence_level |
| L3-C 关联组 | 属于哪里？ | item_id, sub_item_id, phase_id, linked_record_id, record_link_hint |

**规则中心（Rules Center）——5 大模块：**

| 模块 | 管辖范围 | 关键配置 |
|------|---------|---------|
| record_type | 记录类型枚举 + 旧类型映射 | 情绪/花费/结果 → 发生 |
| parsing | 解析规则关键词映射 | 时间锚点词、情绪关键词、体态关键词、量化模式 |
| classification | 归类阈值 | 自动归类置信度阈值 0.85 |
| lifecycle | 生命周期终态 + 数据性质 | 终态列表、data_nature 枚举、period 频率 |
| fallback | 降级参数 | 低置信度阈值 0.7、降级置信度 0.3、降级提示文案 |

**计算中心（Computation Center）——4 大子系统：**

| 子系统 | 管辖范围 | 关键配置 |
|--------|---------|---------|
| metrics | 核心指标权重和阈值 | 活跃度权重(7d=0.4, 30d=0.3, 近期=0.3)、停滞天数(7/14/30) |
| time_windows | 时间窗口定义 | 热力图回溯 180 天、周期对比 7/30 天、近境上下文 3 天 |
| data_scope | 数据过滤口径 | 活跃事项状态、周期天数映射、停滞阈值 |
| comparison | 对比分析参数 | 时间段分布(早6-12/午12-18/晚18-22/夜22-6) |

**目标规则驱动引擎：**

| 旧模型 | 新模型 | 变化 |
|--------|--------|------|
| measure_type: boolean | rule_type: 一次性完成, operator: complete | 布尔达标 → 一次性完成规则 |
| measure_type: numeric + deadline | rule_type: 一次性完成, operator: >= | 量化+截止日 → 一次性达到规则 |
| measure_type: numeric + daily_target | rule_type: 周期性达成, period: 每天 | 量化+日目标 → 周期达成规则 |
| measure_type: repeat | rule_type: 周期性达成, period: 每周/月 | 重复型 → 周期达成规则 |
| (无) | rule_type: 周期性限制, operator: <= | 新增：限制型规则（如每周不超 X） |

这带来的根本改变：

- 记录不再是 50+ 个扁平字段的集合，而是有严格分层分组的语法对象
- 系统参数不再是分散在各处的硬编码，而是声明层统一管理
- 目标不再是三种类型各有各的计算，而是规则驱动 + 统一引擎
- AI 不再是单点依赖，降级模式保证系统在 LLM 不可用时仍可工作
- 生产环境不再有 DEV_MODE 绕过 RLS 的风险

---

## 五、1.5 的实际完成情况

### 5.1 已完成三层九组模型

#### SQL 迁移层

- 迁移 004：新增 16 个字段，覆盖 L2 的 7 个语义组（时间组、发生主干组、结果组、因果组、地点组、量化组、人物组）+ L3 组织组 + L1 输入源
- 迁移 004b：新增 body_state（体态分离）和 money_currency（币种分离），完成 L3 情绪组和 L2 量化组的最终对齐
- 所有字段均带有 CHECK 约束（outcome_type 9 值枚举、place_type 10 值枚举、time_precision 4 值枚举等）

#### 类型定义层

- `src/types/teto.ts`（835 行）：Record 接口完整映射三层九组全部字段
- `src/types/semantic.ts`：ParsedSemantic 接口与 DB 字段完全对齐
- Update 类型用 Omit 从 Create 类型派生，消除 ~100 行重复定义

#### AI 解析层

- `src/lib/ai/parse-semantic.ts`（503 行）：DeepSeek System Prompt 已按三层九组结构组织输出
- `src/lib/ai/enhance-record.ts`（422 行）：增强管线按组回写，仅填空不覆盖
- `src/lib/ai/parse-rules-fallback.ts`（418 行）：降级解析覆盖 L2 关键组（时间、量化、情绪）

#### 前端展示层

- QuickInput 语义卡片：5 类芯片（花费/时长/指标/时间/事项 + 修饰/情绪/地点/人物/日期锚点）
- ParsedChip 组件：从 QuickInput 中提取为独立组件，支持点击编辑、回车确认、Esc 取消
- RecordItem：L2/L3 字段以胶囊标签形式展示

---

### 5.2 已完成规则中心

`src/lib/rules/index.ts`（314 行）完整实现 5 大模块：

- **record_type**：记录类型枚举 + 旧类型映射（情绪→发生、花费→发生、结果→发生）
- **parsing**：时间锚点关键词（前天/昨天/明天/后天/上周/下周等）、情绪关键词（5 类）、体态关键词、能量关键词、量化模式（55+ 种单位匹配）、花费模式、时长模式、记录类型关键词
- **classification**：自动归类阈值 0.85
- **lifecycle**：终态列表、data_nature 枚举、period 频率映射
- **fallback**：低置信度阈值 0.7、降级置信度 0.3、最大输入长度、降级提示文案

规则中心被以下模块引用：
- `parse-rules-fallback.ts`：降级解析使用 RULES.parsing 和 RULES.fallback
- `parseNaturalInput.ts`：前端本地解析使用 RULES
- `optimize-input.ts`：模糊输入检测使用 RULES

---

### 5.3 已完成计算中心

`src/lib/computation/index.ts`（145 行）完整实现 4 大子系统：

- **metrics**：活跃度权重（7天=0.4, 30天=0.3, 近期=0.3）、分母、停滞阈值（7/14/30 天）
- **time_windows**：热力图回溯 180 天、周期窗口 7/30 天、近境上下文 3 天
- **data_scope**：停滞阈值 14 天、活跃事项状态（活跃/推进中/放缓）、周期天数映射
- **comparison**：时间分布区间（早6-12/午12-18/晚18-22/夜22-6）

计算中心被以下模块引用：
- `src/lib/stats/metrics.ts`：5 项核心指标计算
- `src/lib/db/insights.ts`：洞察聚合查询

---

### 5.4 已完成统计框架

`src/lib/stats/`（5 个文件）完整实现：

| 文件 | 功能 |
|------|------|
| metrics.ts（206 行） | 5 项核心指标：活跃度、投入量、记录频率、计划达成率、效果 |
| metric-definitions.ts（5.3 KB） | 指标元定义（算法、数据源、时间范围、推断数据策略） |
| metric-explain.ts（1.7 KB） | 指标可解释性（"这个数字怎么算出来的"） |
| record-filters.ts（2.9 KB） | 数据过滤口径（fact 优先、状态过滤、时间范围） |
| date-policy.ts（1.8 KB） | 日期策略（统计日期边界、时区处理） |

---

### 5.5 已完成目标引擎重构

#### SQL 迁移

- 迁移 006：四阶段重构（添加字段 → 数据迁移 → 删除旧字段 → 添加索引）
- 旧字段 measure_type/repeat_frequency/repeat_count/daily_target/deadline_date 全部移除
- 新字段 rule_type/operator/period/target_min/target_max/deadline/source/confirmation_required/progress_source

#### 引擎实现

`src/lib/domain/goal-engine.ts`（1089 行）统一计算：

| 规则类型 | operator | 计算逻辑 |
|---------|----------|---------|
| 一次性完成 | complete | 达成即完成，无需数值 |
| 一次性完成 | >= / <= / = / between | 累计值 vs target_min/max |
| 周期性达成 | >= | 每周期实际值 vs target_min |
| 周期性限制 | <= | 每周期实际值 vs target_max，超限预警 |

引擎输出字段：
- 时间维度：total_passed_days, remaining_days
- 当前周期：current_period_actual/target/progress
- 累计：total_actual, total_target, deficit
- 完成率：completion_rate, completion_rate_7d/30d
- 日均：daily_average, avg_7d, avg_30d
- 配速：dynamic_daily_pacer
- 超限：is_over_limit, remaining_budget
- 投射：weekly/monthly_target, weekly/monthly_projection

---

### 5.6 已完成 AI 降级模式

`src/lib/ai/parse-rules-fallback.ts`（418 行）完整实现：

**4 种降级触发**：
- ai_timeout：LLM 响应超时
- ai_error：LLM 返回错误
- ai_unavailable：LLM 服务不可用
- api_key_missing：DEEPSEEK_API_KEY 缺失

**降级解析能力**：
- 时间锚点解析（关键词 → 日期偏移）
- 情绪推断（关键词 → mood 枚举）
- 体态检测（累/困/饿/头疼/没精神）
- 能量推断（高/中/低）
- 记录类型推断（关键词 → 4 种主类型）
- 花费/时长/指标模式匹配
- 用户规则兜底匹配

**降级置信度**：0.3（vs 正常 AI 解析的 0.7+），明确标记为降级结果

**集成路径**：
- `enhance-record.ts`：try parseSemantic → catch → shouldFallback → parseWithFallback
- `parse/route.ts`：API 层同样支持降级链路
- 前端显示降级提示："智能解析响应超时，已切换基础模式"

---

### 5.7 已完成安全加固

**DEV_MODE 生产环境保护**（3 处）：

| 文件 | 变量 | 保护机制 |
|------|------|---------|
| src/lib/supabase/server.ts | DEV_MODE | NODE_ENV=production 时自动禁用，防止 SERVICE_ROLE_KEY 泄漏 |
| src/lib/auth/server/get-current-user-id.ts | DEV_MODE | NODE_ENV=production 时自动禁用，防止认证绕过 |
| src/lib/auth/get-current-user-id.ts | NEXT_PUBLIC_DEV_MODE | NODE_ENV=production 时自动禁用，防止客户端 RLS 绕过 |

采用 `let DEV_MODE = false` + console.error 策略，而非 throw，确保 `next build` 不会因残留 DEV_MODE=true 而失败。

---

### 5.8 已完成数据库性能优化

迁移 007 新增 10 个 RLS 友好复合索引（全部以 user_id 为前缀，配合部分索引 WHERE ... IS NOT NULL）：

| 索引 | 覆盖场景 |
|------|---------|
| idx_records_user_item | 按事项查记录 |
| idx_records_user_sub_item | 按子项查记录 |
| idx_records_user_phase | 按阶段查记录 |
| idx_records_user_time_anchor | 按时间锚点查计划记录 |
| idx_goals_user_phase | 按阶段查目标 |
| idx_goals_user_sub_item | 按子项查目标 |
| idx_phases_user_status | 按状态查阶段 |
| idx_items_user_folder | 按文件夹查事项 |

同时清理 7 个旧弱索引（缺少 user_id 前缀，RLS 环境下无效）。

---

### 5.9 已完成数据完整性诊断

`src/lib/diagnostics/data-integrity-check.ts`（14.8 KB）实现 13 项检查：

1. 记录类型验证
2. 生命周期状态有效性
3. 事项引用完整性
4. 子项引用完整性
5. 阶段引用完整性
6. 记录日引用完整性
7. 周期规则验证
8. 数据性质验证
9. 时间精度验证
10. 指标值约束
11. 花费/时长非负性
12. 记录关联关系验证
13. 审核状态追踪

---

### 5.10 已完成 Domain 层不变量体系

`src/lib/domain/`（9 个文件）实现完整的记录安全网：

| 模块 | 功能 |
|------|------|
| record-service.ts | createRecordSafely / updateRecordSafely，不变量校验后写入 |
| record-invariants.ts | 记录字段约束验证 |
| record-lifecycle-invariants.ts | 生命周期状态转换验证 |
| relation-invariants.ts | 关联关系完整性验证 |
| ai-write-policy.ts | AI 字段所有权策略（80+ 字段规则） |
| field-ownership-policy.ts | 应用所有权规则过滤 AI 更新 |
| record-ai-service.ts | 安全 AI 增强包装 |
| transaction-service.ts | 批量事务处理 |
| domain-errors.ts | 领域错误类型定义 |

---

### 5.11 已完成 API 层扩展

V2 API 从 1.4 的 27+ 个路由扩展到 36 个路由，新增：

| 模块 | 新增路由 |
|------|---------|
| 语义解析降级 | /parse（支持 fallback 模式） |
| 模糊输入检测 | /optimize-input |
| 用户规则 | /user-rules（完整 CRUD + 重置） |
| 数据导出 | /export/records |
| 数据完整性 | /diagnostics/integrity |

---

### 5.12 已完成前端语义卡片升级

QuickInput 从 1.4 的简单芯片模式升级为语义卡片模式：

- **5 类主体芯片**：花费/时长/指标/时间/事项
- **5 类修饰芯片**：心情/能量/状态/地点/人物
- **日期锚点芯片**：时间锚点日期显示
- **标签芯片**：标签选择与展示
- **歧义澄清框**（256 行）：共享时长分配、子项归属歧义、指标值确认
- **拆分预览面板**（236 行）：复合句拆分结果逐条预览、类型提示、置信度指示
- **ParsedChip 组件**：提取为独立组件，支持点击编辑、回车确认、Esc 取消

---

## 六、1.5 阶段完成的核心价值

### 6.1 给记录建了语法结构

1.4 的记录是 50+ 个扁平字段。1.5 给它分了三层九组：L1 原始层（原文+主表达）、L2 主链层（8 组可独立统计）、L3 附属属性层（3 组修饰/组织/关联）。记录不再是散装字段集合，而是有严格语法分层的结构化对象。

### 6.2 给系统建了声明层

1.4 的阈值和规则分散在各处硬编码。1.5 的规则中心和计算中心把参数与逻辑分离：规则统管解析/归类/降级，计算统管指标/窗口/口径。改一个阈值不再需要搜索整个代码库。

### 6.3 给目标建了统一引擎

1.4 的目标有三种度量类型，各有各的计算路径。1.5 用 rule_type + operator + period 统一描述，goal-engine 基于同一套逻辑输出所有结果。新增"周期性限制"规则类型（如"每周不超 200 元"），无需新增代码路径。

### 6.4 让系统不怕 AI 挂掉

1.4 在 AI 不可用时只剩前端基础正则。1.5 的降级模式在后端提供完整的规则解析，保证系统"可变笨但不可瘫"。

### 6.5 让生产环境不再泄漏

1.4 的 DEV_MODE 在客户端无生产环境保护。1.5 的三处自动禁用机制确保即使 .env 残留 DEV_MODE=true，生产环境也不会绕过 RLS。

### 6.6 让数据库不怕 RLS

1.4 的索引缺少 user_id 前缀，RLS 环境下查询计划器无法有效利用。1.5 的复合索引全部以 user_id 为前缀 + 部分索引 WHERE ... IS NOT NULL，PostgreSQL 在 RLS 过滤后能高效命中索引。

---

## 七、1.5 从构思到落地的关键演进

### 7.1 规则中心：从散装硬编码到声明层

1.5 之前，解析规则散落在 parseNaturalInput.ts、parse-semantic.ts prompt、enhance-record.ts 等多个文件中。修改一个情绪关键词需要搜索整个代码库。

1.5 将所有规则集中到 RULES 常量，解析模块只消费不定义。这带来的不仅是维护便利，更重要的是**统计口径的一致性**——活跃度权重、停滞阈值、时间窗口在所有入口使用相同值。

### 7.2 三层九组：从扁平字段到语法分层

1.4 给记录加了 30+ 个字段但没有分层。这导致：
- 不知道哪些字段可以独立统计（L2），哪些只是修饰（L3）
- mood 和 cause_text 的边界模糊（"因为太累所以没跑步"到底归情绪组还是因果组？）
- action_text 允许写很长，失去"核心动作"的语义

1.5 的三层九组明确：L2 是可独立统计的核心，L3 是主观/附属信息不做统计口径底座，字段边界严格（action_text ≤ 4 字，mood ≠ cause_text，location 不含状态）。

### 7.3 目标引擎：从三型分立到规则驱动

1.4 的目标引擎有三条代码路径：boolean 用完成/未完成判断、numeric 用累计值判断、repeat 用周期计数判断。新增一种规则类型就需要改三处。

1.5 用 rule_type + operator + period 统一描述后，引擎只需一条计算路径：根据 rule_type 选择累计/周期模式，根据 operator 选择比较方式，根据 period 选择周期窗口。新增"周期性限制"只增加了 is_over_limit 分支，不需要新的代码路径。

### 7.4 降级模式：从可选增强到必备韧性

1.4 的 AI 增强是"锦上添花"，LLM 不可用时用户只损失增强功能。但 1.5 的语义解析是核心录入链路的一部分，LLM 不可用意味着后端增强完全不可用。

因此降级模式从"可选增强"变为"必备韧性"——parse-rules-fallback 不是备选方案，而是系统可用性的底线保障。4 种降级触发、覆盖 L2 关键组的本地解析、0.3 降级置信度标记，确保系统在任何情况下都能"变笨但不断"。

---

## 八、1.5 的局限

### 8.1 计划类记录日期提醒未实现（P5）

time_anchor_date 字段已就绪，前端可展示计划记录的未来日期投影（虚线蓝色边框），但缺少通知机制。用户必须主动访问记录页才能看到即将到期的计划。

### 8.2 统计 4 主轴未系统化实现（P16）

计算中心和统计框架已定义 5 项核心指标，但洞察页未按"行动 vs 目标 / 时间 vs 计划 / 投入 vs 效果 / 时间分布"4 个主轴组织。当前只有 TimeDistributionPanel 覆盖第 4 轴，其余 3 轴缺独立面板。

### 8.3 非事项数据统计区未实现（P14）

洞察页的 DataReviewPanel 统计了无事项记录的数量，但没有独立的非事项数据统计区。无法查看未归属事项的花费、时长、指标等聚合数据。

### 8.4 被动规则学习未实现（P20）

user_rules 表和完整 CRUD API 已就绪，但用户修正归类时的自动规则沉淀逻辑未实现。用户改错后，下次类似输入仍可能犯同样错误。

### 8.5 规则管理面板未实现（P21）

后端 API 完整（GET/POST/PUT/DELETE + 重置），但前端无规则管理 UI。用户无法查看、启用/禁用、删除 AI 学习的规则。

### 8.6 阶段与执行视图未分离（P15）

事项详情页同时包含阶段管理和执行信息，没有"执行视图"和"阶段档案视图"的分离。阶段管理和日常推进混在同一页面。

### 8.7 记录关联前端未使用

record_links 的 DB Schema + API 完整（POST/GET/DELETE /api/v2/record-links），但前端零使用。记录间的 completes/derived_from/postponed_from/related_to 关系在 UI 上不可见。

### 8.8 文档与枚举小问题

- CLAUDE.md 迁移顺序仍写旧编号（001,003,006,008,010），应为 001-007
- time_precision 在 teto.ts 包含 `inherited`，但 DB CHECK 约束无此值

---

## 九、1.5 完成标准应如何理解

按照 TETO 1.5 总执行清单的最小可用闭环，1.5 的完成应落在以下事实上：

### 最小闭环 1：普通输入更顺手 ✓

- QuickInput 语义卡片升级已落地
- 手动明确优先：类型/时间/事项/子项/量化字段均可手动选择
- 4 种主类型基本承接稳定

### 最小闭环 2：复合句可基本稳定拆分 ✓

- parse-semantic.ts 支持复合句检测（is_compound）+ 子句间关系（relations）
- QuickInput 拆分预览面板支持逐条/全部提交
- batch_id 标记同源拆分

### 最小闭环 3：归类支持理由回显、可修正、可学习 ⚠️ 部分

- 理由回显：field_confidence 和 confidence 存在，但前端仅有指示徽章，无展开面板
- 可修正：RecordEditDrawer 支持修改所有字段 ✓
- 可学习：被动规则学习（P20）未实现 ✗

### 最小闭环 4：AI 不可用时仍可降级录入 ✓

- parse-rules-fallback.ts 完整实现 4 种降级触发
- 降级解析覆盖 L2 关键组
- 前端显示降级提示

### 最小闭环 5：洞察支持固定时间对比，并可追溯依据 ⚠️ 部分

- 固定时间对比：PeriodComparisonPanel 支持周/月对比 ✓
- 可追溯依据：FactSourcePanel 有事实列表 + "Show Evidence" 开关 ✓
- 但不可钻取到单条源记录 ✗

---

## 十、与 1.4 完成报告的核心对比

| 维度 | 1.4 | 1.5 |
|------|-----|-----|
| 核心任务 | 事项深化与语义引擎建设 | 录入清分与统计口径稳定化 |
| 记录结构 | 50+ 扁平字段 | 三层九组（L1/L2/L3，13 组） |
| 系统参数 | 分散硬编码 | 规则中心 + 计算中心声明层 |
| 目标引擎 | 三型分立（boolean/numeric/repeat） | 规则驱动（rule_type + operator + period） |
| AI 降级 | 无后端降级，仅前端基础正则 | 完整降级模式（4 种触发 + 规则兜底） |
| 安全 | DEV_MODE 客户端无保护 | 三处生产环境自动禁用 |
| DB 性能 | 索引缺 user_id 前缀 | RLS 友好复合索引 + 旧索引清理 |
| 类型定义 | Create/Update 独立定义 | Omit 派生去重 |
| 统计框架 | insights.ts 一个文件 | 5 文件 stats 框架 + 5 项核心指标 |
| 领域安全 | 无 | 9 文件 Domain 不变量体系 + 13 项诊断 |
| 前端展示 | 简单芯片 | 语义卡片 + 歧义澄清框 + 拆分预览 + ParsedChip |
| 变更性质 | 纵深建设 | 口径稳定化 |

---

## 十一、1.5 之后不应继续做的事

1.5 完成了口径稳定化，但后续不应：

- 在被动规则学习未落地前，让 AI 做更多自动归类决策——归类错误不可沉淀，错误会反复
- 在 4 主轴框架未建立前，继续往洞察页堆更多面板——没有框架的面板只是图表堆砌
- 在降级模式验证充分前，让 AI 承担更多核心链路——韧性底线还没被真实压力测试
- 在三层九组边界未充分验证前，继续给记录加字段——语法结构的边界比字段数量重要
- 把规则中心从声明层变成推理层——当前它只定义参数，不应膨胀为推理引擎
- 把计算中心从指标定义变成 BI 平台——当前它只定义口径，不应膨胀为分析系统

---

## 十二、1.5 之后可以开始做的事

1.5 已把口径打稳，后续可以在稳定地基上：

- **1.6 维度分析 + 可观测性**：
  - 统计 4 主轴系统化实现（P16）
  - 非事项数据统计区（P14）
  - 维度面板（情绪/财务/时间/效率/社交/空间 6 维度分析）
  - 计划类记录日期提醒（P5）
  - 规则管理面板（P21）
  - AI 可观测性（trace_id / decision_id / 修正率统计）

- **1.7 排名复盘笔记缓存**：
  - 被动规则学习（P20）
  - 阶段与执行视图分离（P15）
  - 记录关联前端可视化（P3）
  - AI 判断理由展开面板（P4）
  - 轻量笔记/复盘能力

- **修复文档小问题**：
  - 更新 CLAUDE.md 迁移顺序
  - 确认 time_precision 的 inherited 枚举是否需要加到 DB CHECK

---

## 十三、最终结论

TETO 1.5 的真实结论：

> **TETO 已从"结构化记录 + 四维事项 + 增强洞察"推进为"语法化记录 + 声明层架构 + 规则驱动引擎"的稳定计算系统。记录内部有了三层九组的语法结构，不再是散装字段集合；系统内部有了规则中心与计算中心的统一口径，不再是各处硬编码；目标引擎有了三种规则的统一计算逻辑，不再是三型分立；AI 不可用时有了降级模式的韧性保障，不再是单点依赖；生产环境有了 DEV_MODE 的安全加固，不再是 RLS 泄漏风险。口径稳定化目标已落地，核心链路真实可走通，数据闭环稳定可靠。**
