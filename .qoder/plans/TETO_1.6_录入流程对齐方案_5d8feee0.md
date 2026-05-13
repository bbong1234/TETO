
# TETO 1.6 录入流程重新对齐方案

## 一、现状总览：已有资产 vs 缺失项

### 1.1 已有且可用的资产

| 模块 | 文件 | 状态 | 备注 |
|------|------|------|------|
| 三层九组类型定义 | `src/types/semantic.ts` / `teto.ts` | ✅ 完整 | ClassificationResult、UnitFieldProposal、DecisionRecord 等1.6类型已定义 |
| DeepSeek AI解析 | `src/lib/ai/parse-semantic.ts` | ✅ 完整 | 含 thinking、field_confidence、violations |
| 入库前AI清分 | `src/lib/ai/classify-input.ts` | ✅ 完整 | classifyInput() 已完成：解析→匹配→歧义检测→准入判断 |
| POST records 1.6流程 | `src/app/api/v2/records/route.ts` | ✅ 完整 | AI清分→判断→confirm卡/入库 的分支逻辑已写 |
| 规则中心 | `src/lib/rules/index.ts` | ✅ 完整 | 5大类规则，含 low_confidence_threshold=0.7 |
| 计算中心 | `src/lib/computation/index.ts` / `stats/` | ✅ 完整 | 统一统计入口 |
| corrections表 | `sql/016/021/022_*.sql` | ✅ DB层就绪 | 含input_id、rule_id、decision_type |
| user_rules表 | `sql/.../002_create_user_rules.sql` | ✅ DB层就绪 | 含4种规则类型 |
| 回归测试生成器 | `src/lib/correction/regression-test-generator.ts` | ✅ 代码就绪 | 未接入纠错API |
| pipeline-runner | `src/lib/ai/pipeline-runner.ts` | ✅ 代码就绪 | 通过feature flag `TETO_PIPELINE_V1` 控制 |
| 本地即时解析+芯片展示 | QuickInput.tsx triggerParse/chips | ✅ 前端可用 | 已在时间栏上方显示解析芯片 |
| 澄清框UI | QuickInput.tsx clarification | ✅ 前端可用 | 支持split/attribution/clarify三种卡片 |

### 1.2 关键差距：QuickInput绕过了1.6入库前清分

当前 `QuickInput.tsx` 在 `handleSubmit` (L1592-1607) 中的提交路径：
```
POST /api/v2/records?enhance=client  ← 绕过了服务端 classifyInput()
→ 入库成功后 → enhanceWithAi() 异步增强（fire-and-forget）
```

这意味着 **1.6 的 classifyInput() 清分管道虽然写好了，但前端从未真正接入**。实际流程仍然是1.5的"先入库→后增强"模式。

---

## 二、逐项需求对比与改造方案

### 需求1：用户输入与即时反馈

**现状**：
- ✅ 芯片展示（cost/duration/metric/time/item/mood/energy/status/location/people/dateAnchor）
- ❌ 缺少可视化查看按钮（?按钮），看不到AI如何识别、thinking过程、field_confidence

**改造方案**：
1. 在芯片区域右侧新增 `?` 按钮（或展开面板），点击后展示：
   - 本地解析结果（parseNaturalInput 的 ParsedInput）
   - 字段识别详情：每个字段的来源（本地正则匹配 / AI推断）
   - 当前不调用服务端解析，先展示本地结果
2. 后续接入 classifyInput 后，在此面板展示：
   - AI thinking 文本
   - field_confidence 标注（certain vs guess 用颜色区分）
   - type_hint 推理过程
   - violations（规则违规时高亮显示）

**涉及文件**：`QuickInput.tsx`（新增解析详情面板组件）

---

### 需求2：规则中心AI清分流程

**现状**：
- ✅ `classify-input.ts` 已实现完整清分流程
- ✅ `POST /api/v2/records` 已实现清分分支
- ❌ QuickInput 使用 `?enhance=client` 跳过清分
- ❌ 没有独立的"仅清分不写入"前端调用

**改造方案**：
1. **修改 QuickInput 提交路径**：去除 `?enhance=client`，改为走服务端清分流程
   - 新路径：提交 → `POST /api/v2/records` → 服务端 classifyInput() → 高置信直接入库 / 低置信返回确认卡片
2. **增加"仅预览不清分"按钮**：在输入框旁加一个预览按钮，调用 `POST /api/v2/parse` 获取解析结果并在详情面板展示，不入库
3. **Flow 变更**：
   ```
   用户输入 → 确认提交 → POST /api/v2/records (走1.6标准流程)
            → classifyInput() → needsConfirmation?
               ├─ false → 入库 + 返回 created record
               └─ true → 返回 _clarification + _compound → 前端弹出确认卡片
   ```

**涉及文件**：
- `QuickInput.tsx`（修改 handleSubmit 和 enhanceWithAi 调用链）
- `records/route.ts`（确认流程需要微调，见需求4）

---

### 需求3：置信度分级处理机制

**现状**：
- ✅ classifyInput 中已有 confidence 判断（<0.7 低置信，field_confidence guess 检测）
- ✅ low_confidence_threshold=0.7 在 RULES 中定义
- ❌ 低置信度检测粒度不够，目前只检测了：shared_duration、sub_item_ambiguous、low_confidence
- ❌ 缺少以下低置信度场景的专门检测：
  - 复合句拆分不确定（units间relation类型为unknown或confidence低）
  - 语义模糊不清（mood/cause_text/state 边界模糊）
  - 事项归属不明确（item_hint 含多个候选但都无法 high confidence）
  - 句子结构错误（action_text 为空或过长、主谓宾不完整）

**改造方案**：
1. **扩展 classify-input.ts 的歧义检测**：
   - 新增 `item_ambiguous` issue 类型：当 matchItemSmart 返回 confidence=medium 时触发
   - 新增 `parse_uncertain` issue 类型：当 action_text 为空或无法识别核心动作时触发
   - 新增 `compound_uncertain` issue 类型：复合句 relations 中 type 无法确定时
   - 新增 `boundary_blur` issue 类型：mood/cause_text 边界模糊时（如"因为太累所以没跑步"→mood还是cause?）
2. **更新 ClarificationType 枚举**：
   ```typescript
   // semantic.ts 中补充
   type ClarificationType = ... | 'item_ambiguous' | 'parse_uncertain' | 'compound_uncertain' | 'boundary_blur';
   ```
3. **区分高/低置信度的入库策略**：
   - 高置信：ClassificationResult.needsConfirmation=false → 直接入库，写入 parsed_semantic + confidence_level='high'
   - 低置信：needsConfirmation=true → 返回确认卡片，不入库，保留原始输入供用户修正

**涉及文件**：
- `src/types/semantic.ts`（扩增 ClarificationType）
- `src/lib/ai/classify-input.ts`（扩增歧义检测逻辑）
- `src/lib/rules/index.ts`（增加 boundary_blur 相关规则）

---

### 需求4：确认与修正流程

**现状**：
- ✅ 澄清框UI存在（handleClarifyConfirm）
- ❌ 确认后的流程是直接PATCH记录，没有重新经过 classifyInput
- ❌ 缺少"用户修改原文后重新清分"的完整回路

**改造方案**：
1. **新增确认后重新清分的API端点**：`POST /api/v2/records/confirm`
   - 接收：用户确认后的字段选择 + 原始 input
   - 流程：将用户选择merge进payload → 重新调用 classifyInput（带用户修正的上下文）
   - 如果再次低置信 → 再次返回确认卡片（最多循环2次）
   - 通过 → 入库
2. **修改 QuickInput 的 handleClarifyConfirm**：
   ```
   用户确认 → POST /api/v2/records/confirm
            → classifyInput(带用户修正的hint)
               ├─ needsConfirmation=false → 入库
               └─ needsConfirmation=true → 再次弹出（带更精确的options）
   ```
3. **确认卡片增加"修改原文"功能**：允许用户在确认卡片中直接修改原始输入文本，重新触发解析

**涉及文件**：
- `src/app/api/v2/records/confirm/route.ts`（新建）
- `QuickInput.tsx`（修改 handleClarifyConfirm）
- `src/lib/ai/classify-input.ts`（支持传入 userHints 参数用于重新清分）

---

### 需求5：数据库与计算中心规则

**现状**：
- ✅ 计算中心 `src/lib/computation/index.ts` 已定义统一口径
- ✅ 规则中心 `src/lib/rules/index.ts` 已定义声明层
- ❌ 计算中心未显式过滤"未确认数据"
- ❌ 数据库缺少 `review_status` 字段的实际使用来区分"已确认/未确认"

**改造方案**：
1. **利用已有 `review_status` 字段**（teto.ts 中已定义：unchecked/confirmed/corrected/disputed）：
   - 入库时：needsConfirmation=false → review_status='confirmed'
   - 入库时：needsConfirmation=true（走确认流程后）→ review_status='confirmed'
   - 用户修改已确认记录 → review_status='corrected'（触发corrections）
2. **在计算中心增加数据准入过滤**：所有统计查询默认 `WHERE review_status IN ('confirmed', 'corrected')`，排除 unchecked/disputed
3. **在 insights/stats API 中添加过滤逻辑**：确保只统计已确认的正式数据

**涉及文件**：
- `src/lib/computation/index.ts`（增加 review_status 过滤）
- `src/lib/stats/`（确保查询带 review_status 条件）
- `src/lib/domain/record-service.ts`（入库时设置 review_status）
- `src/app/api/v2/records/route.ts`（创建记录时设置 review_status）

---

### 需求6：纠错与规则学习机制

**现状**：
- ✅ corrections表已建（016/021/022三份迁移），含 record_id、decision_id、field_corrected、old_value、new_value、input_id、rule_id、decision_type
- ✅ user_rules表已建（002），含 rule_type、trigger_pattern、target_id、confidence、source
- ✅ regression-test-generator.ts 已实现
- ❌ 没有纠错API端点
- ❌ 没有前端纠错UI
- ❌ user_rules未被AI清分流程消费
- ❌ 错误聚类和规则建议逻辑缺失

**改造方案**：

**Phase A: 纠错记录写入**
1. 新建 `POST /api/v2/records/[id]/correct` 端点：
   - 接收被修正字段名、旧值、新值
   - 写入 corrections 表
   - 自动调用 regression-test-generator 生成测试用例
   - 更新记录的 review_status='corrected'
2. 前端：在 RecordItem 编辑保存时，比对AI原值与用户修改值，差异字段自动触发纠错记录

**Phase B: 规则学习与消费**
3. 当同类错误积累到阈值（如同一字段同一类型的corrections ≥3条），标记为"可沉淀为规则"
4. 在规则中心增加 `RULES.learned` 动态规则区，从 user_rules 表加载
5. classifyInput 在清分时读取 user_rules 中的活跃规则来辅助判断

**Phase C: 用户确认规则**
6. 新增 `/settings/rules` 页面，展示"待确认规则"列表，用户可确认/拒绝/修改

**涉及文件**：
- `src/app/api/v2/records/[id]/correct/route.ts`（新建）
- `src/lib/correction/rule-learner.ts`（新建 - 错误聚类与建议）
- `src/lib/ai/classify-input.ts`（消费 user_rules）
- `src/lib/rules/index.ts`（增加 learned 动态规则区）
- `RecordItem.tsx` / `RecordEditDrawer.tsx`（纠错触发）

---

### 需求7：后续功能扩展

**现状**：
- ❌ 记录→事项/目标生成：未实现
- ❌ 收录入口气：未实现
- ✅ 三层九组模型：已完成
- ✅ 编码体系（编号系统）：trace_id/input_id/unit_id/decision_id/record_id 体系已设计

**改造方案**：

**7.1 记录直接生成事项/目标**
- 在 RecordItem 操作菜单中增加"生成事项"和"生成目标"按钮
- 调用已存在的 `POST /api/v2/items`、`POST /api/v2/goals`
- 从记录的 content/action_text/item_hint 预填充标题
- 自动设置关联：生成的 item_id/goal_id 写回记录

**7.2 收录入口气**
- 在 QuickInput 旁增加收纳入口气按钮（收录短语/常用模板）
- 用户可保存常用短语模板（如"背了X个单词，花了X分钟"）
- 后续输入时可快速套用模板

**涉及文件**：
- `RecordItem.tsx`（新增生成事项/目标菜单项）
- `QuickInput.tsx`（新增收录模板按钮）
- `src/app/api/v2/templates/`（新建模板CRUD API）

---

## 三、实施优先级

### P0（核心痛点 - 必须立即修复）
| # | 任务 | 影响 |
|---|------|------|
| 1 | QuickInput 接入 classifyInput 清分管道 | **核心**：当前绕过1.6清分，所有后续功能都依赖此入口 |
| 2 | 计算中心增加 review_status 过滤 | **核心**：确保统计口径正确 |
| 3 | 入库时设置 review_status | **核心**：数据准入控制的基础 |

### P1（闭环关键 - 本阶段完成）
| # | 任务 | 影响 |
|---|------|------|
| 4 | 扩展低置信度检测粒度（需求3） | 提升清分准确性 |
| 5 | 确认后重新清分回路（需求4） | 完善确认-入库闭环 |
| 6 | 纠错API + 前端触发（需求6 Phase A） | 纠错数据沉淀 |

### P2（增强体验 - 可后续迭代）
| # | 任务 | 影响 |
|---|------|------|
| 7 | 解析详情面板 `?` 按钮 | 用户可查看AI识别过程 |
| 8 | 规则学习与消费（需求6 Phase B/C） | 个性化规则优化 |
| 9 | 记录→事项/目标生成（需求7.1） | 降低操作复杂度 |

---

## 四、核心文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `QuickInput.tsx` | **重构** | handleSubmit改为走1.6标准清分流程；去除?enhance=client；接入解析详情面板 |
| `classify-input.ts` | 扩展 | 增加item_ambiguous/parse_uncertain/compound_uncertain/boundary_blur检测；支持userHints参数 |
| `semantic.ts` | 扩增 | ClarificationType枚举新增4种类型；增加ParsePreview类型 |
| `records/route.ts` | 调整 | 创建记录时设置review_status；决策日志关联记录ID |
| `/api/v2/records/confirm/route.ts` | **新建** | 确认后重新清分+入库端点 |
| `/api/v2/records/[id]/correct/route.ts` | **新建** | 纠错记录端点 |
| `computation/index.ts` | 修改 | 增加review_status过滤到数据准入 |
| `rules/index.ts` | 扩增 | boundary_blur规则；learned动态规则区 |
| `correction/rule-learner.ts` | **新建** | 错误聚类与规则建议 |
| `RecordItem.tsx` | 修改 | 编辑保存时触发纠错；增加生成事项/目标菜单 |
| `stats/` 目录 | 检查 | 确保所有查询带review_status条件 |
