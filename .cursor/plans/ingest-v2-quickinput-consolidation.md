# Ingest V2 录入链收口改造计划（执行稿 V2）

> 唯一目标：在**不推翻**现有 `POST /api/v2/inputs` 主路径前提下，收口 QuickInput 生命周期与后端时间/复合句语义。  
> **禁止**：改回 `/api/v2/parse`、records 直建主录入、改 `docs/` 与 `sql/` 已有文件、大改 goals/insights/统计。

---

## 开工前交付物（本节即你要求的「第 9 点」）

### 1）七节点 ↔ 现有文件映射

| 节点 | 现有主要文件 |
|------|----------------|
| **A SubmitInput** | [QuickInput.tsx](src/app/(dashboard)/records/components/QuickInput.tsx)（`handleSubmit`、`runIngestJob`、`resetSubmitDraft`） |
| **B CreatePendingTimelineCard** | [RecordsClient.tsx](src/app/(dashboard)/records/RecordsClient.tsx)（`handlePendingCreated`、`PendingInputDraft`、`toPendingRecord`）；[RecordList.tsx](src/app/(dashboard)/records/components/RecordList.tsx)、[RecordItem.tsx](src/app/(dashboard)/records/components/RecordItem.tsx)（`pending:` / `aiPending`） |
| **C IngestParse** | [inputs/route.ts](src/app/api/v2/inputs/route.ts)；[pipeline.ts](src/lib/ingest/pipeline.ts)；[classify-input.ts](src/lib/ai/classify-input.ts)（内调 `parseSemantic` / fallback）；[record-unit-mapper.ts](src/lib/utils/record-unit-mapper.ts)（`buildUnitFields`、`resolveTemporalFields` 等） |
| **D ShowConfirmPanel** | [QuickInput.tsx](src/app/(dashboard)/records/components/QuickInput.tsx)（`ingestClarify` 绿色面板、`buildClarifyFromPostResponse`、`splitPreview`） |
| **E AnswerDecision** | [inputs/[id]/answer/route.ts](src/app/api/v2/inputs/[id]/answer/route.ts)；[inputs/[id]/skip/route.ts](src/app/api/v2/inputs/[id]/skip/route.ts)；[inputs/[id]/cancel/route.ts](src/app/api/v2/inputs/[id]/cancel/route.ts) |
| **F PromoteRecords** | `createRecordSafely`（inputs POST / answer）；`record_links` `derived_from`；`batch_id`（[answer/route.ts](src/app/api/v2/inputs/[id]/answer/route.ts) 已有部分逻辑） |
| **G RefreshTimelineReplacePending** | [RecordsClient.tsx](src/app/(dashboard)/records/RecordsClient.tsx)（`onPendingResolved`、`onRecordCreated`、`handleDeferredPlaceholder`、`resumeClarify` —— 实现时 **改为更新同卡 `lifecycle`**，不再依赖 `defer:` 第二卡）；QuickInput 内 `sessionStorage` `teto_records_ingest_clarify_v1` |

---

## 规格补遗（开改前必须对齐，2026-05-12）

### 补 1：时间轴「会话卡」唯一形态（单槽位、同卡变生命周期）

**原则（硬约束）**

- **同一 `input.id` 在时间轴上始终只占一个会话位**：从用户按下提交到该 input 终态（`saved` / `cancelled` / `failed` / 长期 `deferred`），列表里只对应 **一条**会话型草稿，**禁止**「删掉 parsing 卡再新建 await_confirm 卡」或「defer 用 `defer:` 新 id 与 parsing 并存两套」。
- **生命周期是「同一张卡」上的状态迁移**：`parsing → awaiting_confirmation → deferred | saved | cancelled | failed` 均为 **同一条 `PendingInputDraft`（或等价物）** 的 `lifecycle` 字段变更；**DOM/列表 key 稳定**（**列表主键不因阶段改名**）。
- **稳定主键与 `inputId` 的时序（避免写错）**：`input.id` 仅在 `POST /api/v2/inputs` **成功后**才有。实现时二选一写死：**(A)** 提交瞬间生成 **`client_session_id`（UUID）**，列表 key = `session:${client_session_id}`，响应回来后把 **`inputId` 写入同条 draft**，key 不变；**(B)** 先占位 `pending:${trace}:${idx}`，响应后 **merge 为** `session:${client_session_id}` 且写入 `inputId`（若选 B，须保证 merge 不闪断、不丢点击态）。**禁止**在拿到 `input.id` 之前把列表 key 写成仅 `session:${inputId}` 导致无法挂载。
- **与顶部绿色澄清面板的关系**：澄清 UI 仍可放在 QuickInput；时间轴卡必须能通过 **`inputId` + 同一 `session` 主键** 与面板状态绑定，二者是同一会话的两种视图，而非两套数据。
- **终态收束**：
  - `saved`：移除该会话卡（或折叠为「已入库」一条极短摘要，二选一在实现时定一种，默认 **移除卡 + 列表出现正式 records**）。
  - `deferred`：**不删卡**：卡文案切到「待确认」等，点击仍打开同一 `clarifySnapshot` / 同一 `inputId`。
  - `cancelled` / `failed`：**不静默消失**（见补 4）。

**需废弃的表述**：不再写「awaiting_confirmation 卡或保留一行占位」等二选一说法；**只保留「单会话位 + 生命周期字段迁移」**。

**实现侧要点（仍属方案，非代码）**

- 废除独立 `defer:${inputId}` 与「`pending:${trace}:idx` 与后续会话 **并行代表同一次提交**」的做法；`pending:${trace}:idx` 若仅用于并发去重，应在收到响应后 **合并进** 同一条以 **`client_session_id`** 为主键的 draft（见补 1 稳定主键），并写入 `inputId`。
- 多行输入 = **多个 input = 多张会话卡**（每行一个 `input.id`），各行仍互不阻塞。

### 补 2：`compound_confirm` 与 `field_clarify` 的后端稳定分类

**问题**：仅靠 `field === '_confirm'` 或 `issue.type` 让前端猜，易与 `boundary_blur` 的二选一 `_confirm` 混用。

**约定（与现有 TS 字段兼容，避免搞错）**：当前 `PendingQuestion.kind` 已被占用为 **控件类型**（`'select' | 'text' | 'datetime' | 'number'`）。**不得**把 `kind` 直接改成仅 `compound_confirm | field_clarify` 否则丢失「下拉 / 数字框」语义。

**推荐实现（写入方案）**：新增独立字段，例如 **`clarify_class: 'compound_confirm' | 'field_clarify' | 'boundary_confirm'`**（或命名 `question_scope`），**保留**现有 `kind` 专指控件；`compound_confirm` 题可令 `kind === 'select'` 且 `options` 为四动作，但 **UI 分支以 `clarify_class === 'compound_confirm'` 为准**（不依赖 `field === '_confirm'` 作为唯一条件）。若产品坚持只用 `kind` 一个字段，则必须同时引入 **`widget`** 子字段承载原四类控件——须在开工前在类型里定稿一种，**禁止**半改导致类型与 DB JSON 不一致。

- **`clarify_class === 'compound_confirm'`** — 复合句/拆分决策专用（四动作）。
- **`clarify_class === 'field_clarify'`** — 普通字段追问。
- **`clarify_class === 'boundary_confirm'`**（可选）— 边界二选一，与 compound 四钮彻底分离。

**后端责任**

- [clarification-planner.ts](src/lib/ingest/clarification-planner.ts)：`compound_uncertain` 生成题时 **`clarify_class: 'compound_confirm'`**（四动作）；`field` 可继续 `'_confirm'` 仅作存储，**前端渲染以 `clarify_class` 为准**。
- 其余 `item_id` / `sub_item_id` / `metric:*` / `duration_minutes` 等 → **`clarify_class: 'field_clarify'`**，`kind` 仍为 `select`/`number`/…；`options` / `placeholder` / `ai_guess` 等沿用现结构。
- `boundary_blur`：**`clarify_class: 'boundary_confirm'`**（推荐）或 `field_clarify` + **`clarify_subtype: 'boundary'`**，**禁止**与 `compound_confirm` 共用四钮。

**前端渲染规则**

- **`clarify_class === 'compound_confirm'`**（或已定稿的等价字段）→ **固定四按钮**，提交值严格 `split` | `keep_single` | `cancel` | `defer`。
- **`clarify_class === 'field_clarify'`** → 按现有 **`kind`（select/number/text/datetime）** 渲染 + 跳过 / 取消本轮，**不展示** compound 四钮。
- **顶栏澄清队列**：队列中每一项必须带 **`inputId`**（或与 `client_session_id` 可逆映射），与 **时间轴同一会话卡** 一一对应；多 input 同时澄清时禁止串题。

**API**：`POST /api/v2/inputs` 的 `pending.question`、`answer` / **`skip`** / `cancel` 返回的 `next.question`（若有），JSON 中均带 **`clarify_class`**（及可选 `clarify_subtype`），保证链上一致。

### 补 3：`keep_single` 保留哪一条 unit（`primary_unit_id`）

**禁止**模糊表述「主单元」而不定义。

**优先方案（写入方案）**

- 在 **`POST /api/v2/inputs` 成功响应体**中增加 **`primary_unit_id: string`**（单 unit 时等于该 unit 的 `id`；多 unit 时由后端唯一规则给出）。
- **判定规则（默认，实现时写死注释）**：
  - 若存在 `unit_index === 0` 的 `input_units` 行，则 **`primary_unit_id` = 该行的 `id`**；
  - 若因数据异常没有 index 0，则回退为 **`unit_index` 最小** 的 unit 的 `id`；
  - 若 classifier 将来需要「语义主句非首片」，须在 **classify / planner** 显式写字段覆盖（本次不扩展则 **默认首 unit**）。
- **`keep_single` 行为**：`POST .../answer` 收到 `answer === 'keep_single'` 时，**仅**对 `primary_unit_id` 对应 unit 执行 promote（或等价合并逻辑）；其余 unit **一律 `cancelled` 且无 `promoted_record_id`**，不得半成品 promoted。

### 补 4：`failed` 状态 UI 与收束规则（相对 `cancelled`）

| 维度 | `failed` | `cancelled` |
|------|------------|----------------|
| **语义** | 系统/网络/校验/不可恢复错误导致 **未达成用户期望的入库** | 用户主动 **放弃本次 input**（含 compound 里选「取消」） |
| **正式 records** | **不应产生**（若已部分 promote，归到「部分失败」单独策略：本次方案要求 **能单卡展示错误并禁止静默**；部分成功是否允许见下） | **不应产生**（已产生的需在 answer 逻辑里定义，本次以整 input cancel 为零记录为准） |
| **时间轴会话卡** | **保留**，`lifecycle === 'failed'` | **保留至用户关闭或自动收起策略**，`lifecycle === 'cancelled'`，或移除卡（二选一：**须显式**，默认 **保留短文案 + 可关闭** 以免丢上下文） |
| **卡上展示** | 主文案仍为 **该行/该 input 的完整原文**；副区展示 **「失败」+ 可读错误摘要**（来自 API `message` / `errorCode`，脱敏）；**禁止**无提示消失 | 展示 **「已取消」**，可选原因略 |
| **可恢复** | **允许「重试」**：同一卡上提供「重新提交原文」按钮 → 等价发起 **新** `POST /api/v2/inputs`（新 `input.id`，新会话卡或清空失败卡后重建，**须在方案实现时二选一并写死**；推荐 **失败卡上重试 = 新 input + 替换同槽位 session**） | **一般不自动重试**；用户可重新在输入框打字提交（新会话） |
| **与静默消失** | **禁止**：`onError` 不得只做 `onPendingResolved` 而不把卡迁到 `failed` | **禁止**静默：`cancel` API 后卡须显式终态 |

**硬约束**：任何 `POST /api/v2/inputs` 非 2xx / 或业务 `apiError`，时间轴上对应会话必须从 `parsing` **迁移到 `failed`**（同一卡），不得 `onPendingResolved` 直接删掉且无卡。

### 补 5：九条验收场景 — 可执行验收清单（自测打勾用）

每条需同时勾选 **UI（时间轴 + 必要时顶部面板）**、**接口 JSON**、**入库数据（DB 或刷新后 GET records）** 三类证据。未勾满三类视为该条 **未通过**。

---

#### 场景 1：单句直接通过

- **输入**：`今天下午跑步30分钟`
- **UI — 时间轴会话卡**
  - [ ] 提交后输入框立即空。
  - [ ] **同一张**会话卡出现，`lifecycle=parsing`（或等价文案「解析中」）。
  - [ ] 成功后该会话卡 **收束为 saved**（按补 1：默认会话卡消失 + 列表出现新记录）；全程 **仅一张卡、无第二卡**。
- **UI — 顶部澄清**
  - [ ] **不出现**绿色澄清面板。
- **接口**
  - [ ] `POST /api/v2/inputs` → **201**，`data.pending == null`，`data.promoted_record_ids.length >= 1`。
  - [ ] 若多 unit 仍单条入库，`data.primary_unit_id` 存在且合理（可 N/A）。
- **入库**
  - [ ] 新 record：`duration_minutes` 与语义一致；`occurred_at` / `time_anchor_date` / `time_text` 至少其一与「今天下午」一致；无互斥锚点误伤。

---

#### 场景 2：同句锚点继承

- **输入**：`昨天买了咖啡，晚上又看了会书`
- **UI**
  - [ ] 若需确认：会话卡 `awaiting_confirmation`，原文完整可见。
  - [ ] 若直过：无澄清。
- **接口**
  - [ ] `POST /api/v2/inputs` 返回体中 units 或后续 GET list records：**两个 unit 对应记录**的日期锚均 **继承「昨天」**，不得一条落回「今天」默认日。
- **入库**
  - [ ] 两条 record（或一条若模型未拆）的 `time_anchor_date` / `occurred_at` 日期部分 **均不晚于用户日历日的错误回退**；与 `resolveTemporalFields` 规则一致。

---

#### 场景 3：冲突锚点必须确认

- **输入**：`昨天写方案，今天改了一版`
- **UI**
  - [ ] 会话卡 **`awaiting_confirmation`**，不消失。
  - [ ] 顶部（或内嵌）澄清：`pending != null`；**若**本题为复合拆分决策则 **`clarify_class === 'compound_confirm'`** 且仅四钮；若为冲突锚点但产品走 **boundary / field** 题，则 **不得** 出现 compound 四钮，但仍须 **`awaiting_confirmation` + 0 入库**。
- **接口**
  - [ ] `POST /api/v2/inputs` → **200** 且 `pending != null`，**不得** 201 无确认直出多锚点记录。
- **入库**
  - [ ] 用户未确认前：**0 条**新正式 record。

---

#### 场景 4：开始时间 + 时长 → 结束时间

- **输入**：`昨天下午3点开会2小时`
- **UI — 时间轴 / 列表胶囊**
  - [ ] 展示 **时间段**（非仅单点）；无 `time_text` 抢显示而掩盖 `occurred_at_end` 的情况（按显示规则优先级）。
- **接口 / 入库**
  - [ ] 新 record：`occurred_at` 含 **15:00** 语义（时区与现有库一致）；`occurred_at_end` 含 **+2h** 语义（如 17:00）。
  - [ ] `RecordEditDrawer` 打开该条：可见 **开始、结束**；可见 **原文**。

---

#### 场景 5：复合句 — `split`

- **输入**：`昨天下午跑步5公里，花20元买水`
- **操作**：进入 `compound_confirm` 后选 **拆分保存**（`split`）。
- **UI**
  - [ ] **`clarify_class === 'compound_confirm'`** 时仅四钮；`question.kind` 可为 `select` 等控件类型，**不得**单靠 `kind` 判断 compound。
  - [ ] 会话卡：`awaiting_confirmation` → 成功后 **saved**，卡收束符合补 1。
- **接口**
  - [ ] `answer` 响应：`promoted_record_ids.length >= 2`；`input_status`  completed（或等价）。
- **入库**
  - [ ] 多条 record **同一 `batch_id`**；存在 `record_links` **`derived_from`** 链；无 unit `promoted` 残留未对齐。

---

#### 场景 6：复合句 — `keep_single`

- **输入**：同上。
- **操作**：选 **不拆分**（`keep_single`）。
- **接口**
  - [ ] `POST /api/v2/inputs` 曾返回 **`primary_unit_id`**（记下值）。
  - [ ] `keep_single` 后：**恰好 1 条** record；其 `input_unit_id`（若表上有）或内容与 **`primary_unit_id`** 对应 unit 一致。
- **入库**
  - [ ] 其余 input_units：**cancelled**，`promoted_record_id` 为空；**无** 多条 promoted。

---

#### 场景 7：`cancel`（整 input）

- **操作**：复合确认里选 **取消**（`cancel`）。
- **UI**
  - [ ] 会话卡 → **`cancelled`**，有「已取消」类文案，**非**静默消失。
- **接口**
  - [ ] `answer` 或专用 cancel：`input` 终态 cancelled；无 `promoted_record_ids`。
- **入库**
  - [ ] **0** 条本次产生之正式 record。

---

#### 场景 8：`defer`

- **操作**：选 **暂不确认**（`defer`）。
- **UI**
  - [ ] **同一张**会话卡 → `lifecycle=deferred`（或统一枚举名 `deferred`），仍占单槽；点击卡可恢复同一 `clarifySnapshot` / 同一 `inputId`。
- **接口**
  - [ ] `defer` 响应：`deferred: true`，**无** promote。
- **入库**
  - [ ] **0** 条新 record。

---

#### 场景 9：多行输入，中间行进入确认

- **输入**：三行独立文本，第二行触发澄清（可用弱锚点或缺事项类题目）。
- **UI**
  - [ ] **三张**会话卡（三个 `input.id`），互不合并。
  - [ ] 第一行：先 `parsing` → `saved`（或终态）；**不因第二行卡住而缺失终态**。
  - [ ] 第二行：`awaiting_confirmation` 期间，第一与第三行卡 **不出现错误回滚或误删**。
  - [ ] 第三行：正常完成；顶部澄清队列与三卡 **`inputId` 可追溯**。
- **接口**
  - [ ] 三次 `POST /api/v2/inputs` 均被发起（顺序可串行，但**不得**因第二行 pending 而第三行未请求）。
- **入库**
  - [ ] 三行各自结果与语义一致；无串 `batch_id`。

---

### 2）每节点：保留什么 / 改什么

#### A SubmitInput

- **保留**：`POST /api/v2/inputs`、多行 `linesToProcess` 循环、提交即 `resetSubmitDraft`、`resolveIngestV2ForClient` 门禁。
- **修改**：
  - 与 **B/G** 联动：`pendingId` 与 **`input.id`（及 trace）** 可双向追溯（新建类型字段，如 `inputId?: string` 待 POST 返回后回填，或 pending 创建改为「先本地 id + 返回后 merge」）。
  - 明确 **failed** 态：单路 `onError` 时该行 pending 进入 `failed` 文案/收束，而非静默消失。
- **状态/接口**：请求体不变；可选扩展 POST 响应或二次 GET 非必须——优先客户端用 `input.id` 关联。

#### B CreatePendingTimelineCard

- **保留**：时间轴上展示「非正式 record」的会话草稿能力；`aiPendingIds` 仅用于解析中动画时可并入 `lifecycle` 判定。
- **修改（对齐补 1）**：
  - **唯一会话位**：每个 `input.id` **仅一条** `PendingInputDraft`，列表 **stable id**（见补 1「`client_session_id` / merge」规则，**禁止**用会随阶段变化的 key）；**禁止**删卡再建另一 id 代表同一 input。
  - **同卡生命周期**：仅更新 `lifecycle` 与展示副文案：`parsing` → `awaiting_confirmation` → `deferred` | `saved` | `cancelled` | `failed`；`deferred` 仍为同卡 + 存 `clarifySnapshot`，**废除**独立 `defer:${inputId}` 第二卡与 parsing 卡并存。
  - `toPendingRecord`：**主文案始终为该行完整原文**；`lifecycle` 驱动副标（解析中 / 待确认 / 已失败等）。
- **状态变量**：`PendingInputDraft` 必备 `inputId`（收到 POST 后回填）、`lifecycle`（上列枚举）、`rawContext`、`clarifySnapshot?`；逐步废弃与 `defer:` 前缀绑定的第二套占位模型。

#### C IngestParse

- **保留**：`ingestFull` → `classifyInput` → `createInput` / `createInputUnits`、`needsConfirmation` 分支、决策日志写入（非致命失败可保留）。
- **修改**：
  - **时间唯一主源**：所有 `recordDate` / `anchorDate` / `occurred_at` / `occurred_at_end` 的最终合成，只通过 **扩展后的 `resolveTemporalFields`（或重命名但单入口）** 完成；`inputs/route.ts` 与 `answer/route.ts` 仅组装 `proposed` 后调用该入口，**禁止**两处再写平行日期推断。
  - **规则顺序（写入 `resolveTemporalFields` 文档注释 + 单实现）**：
    1. 已明确的 `occurred_at`
    2. `time_anchor_date`
    3. `time_text` 相对锚点（`inferAnchorDateFromTimeText`）
    4. **同 input 同句**内后续 unit 继承「首个明确锚点」（见下条与 classify 对齐）
    5. **互斥锚点**（`explicitAnchors.size > 1`）→ 已有 issue，确保 **绝不静默落库到今天**
  - **时长推导结束**：在已有 `duration_minutes` + `occurred_at` 时推导 `occurred_at_end`（[record-unit-mapper.ts](src/lib/utils/record-unit-mapper.ts) 已有雏形，收口为唯一规则并保证与 AI 返回字段优先级一致）。
  - **classify-input.ts**：当前 `inheritedAnchorDate` 仅在 `isCompound` 为 true 时写入后续 unit（约 254–256 行）。规格要求 **非 is_compound 但多 unit 的单次输入**也要继承（例如模型未标 compound 的双事件）。改为：**同一 `raw_input` 一次 classify 的多 unit** 均适用继承逻辑（或与 `units.length > 1` 条件结合），并与 `resolveTemporalFields` 输入一致。
  - **buildUnitFields**：避免与 `resolveTemporalFields` 重复造 `occurred_at`；优先产出「原始语义字段」，最终时刻由单入口合并（可小步：先抽函数再删重复）。

#### D ShowConfirmPanel

- **保留**：绿色澄清卡、`splitPreview`、题面 `prompt`、原文区。
- **修改（对齐补 2）**：
- **渲染以 `pending.question.clarify_class`（或已定稿等价字段）为准**：`compound_confirm` → 固定四钮；`field_clarify` / `boundary_confirm` → 按原 **`question.kind` 控件类型** 渲染 + 跳过/取消本轮；**禁止**用 `field === '_confirm'` 作为唯一分支条件。
- **版式**：顶区（会话 `lifecycle` + `clarify_class` + 控件 `kind`）→ **完整原文**（无 `line-clamp`）→ 原因说明 → 拆分预览表 → 动作区。
  - **Busy**：仅当前题按钮 `disabled`；输入框不因澄清整体锁死。

#### E AnswerDecision

- **保留**：`answer` / `skip` / `cancel` 路由与 `coerceAnswer`、多 unit promote 循环。
- **修改（对齐补 2、补 3、补 4）**：
  - **`keep_single`**：**仅** promote **`primary_unit_id`** 对应 unit（见 POST 响应约定）；其余 unit 一律 `cancelled`、无 `promoted_record_id`。
  - **compound 四语义**：`split` / `keep_single` / `cancel` / `defer` 行为与补 1、补 4 及验收清单一致；`cancel` 与 **`failed`** 区分见补 4。
  - **`field_clarify`**：`skip`/`cancel` 路由行为不变；不与 compound 四值混解析。
  - **时间**：promote 前 payload 一律经统一 `resolveTemporalFields`。

#### F PromoteRecords

- **保留**：`createRecordSafely`、`batch_id`、`record_links` `derived_from`（answer 内已有）。
- **修改**：
  - **首条 POST 直接 promote 路径**（`needsConfirmation === false` 的 [inputs/route.ts](src/app/api/v2/inputs/route.ts)）：与 answer 路径使用**同一时间入口**；复合无确认直接入库时同样带 **batch** 与必要 **links**（若多 unit）。
  - **keep_single** 严格裁剪：再跑一遍单元测试式自检（DB 层若无 transaction，需保证失败时一致）。

#### G RefreshTimelineReplacePending

- **保留**：`onRecordCreated` 刷新、顶栏澄清队列 `sessionStorage`、与 `inputId` 的关联思路。
- **修改（对齐补 1、补 4）**：
  - **同一 `inputId` 单卡迁移**：任何阶段变更只 **更新同一条** `PendingInputDraft`（同一列表 key），禁止「resolve 旧 pending + 新建 `defer:` 卡」。
  - `saved`：同卡移除或收束（与补 1 默认一致）+ 列表出现新 records。
  - `cancelled` / `failed`：同卡进入对应 `lifecycle`，**显式 UI**（见补 4）；**不得** `onPendingResolved` 无终态删卡。
  - `resumeClarify`：点击 **同一张 deferred 卡** 灌回 QuickInput，仍绑定同一 `inputId`；顶栏队列与卡 `inputId` 对齐后收束。

### 3）准备删除或收口的旧逻辑

- **收口**：`inputs/route.ts` 与 `answer/route.ts` 内对 `resolveTemporalFields` 的重复/分叉条件 → 单函数。
- **收口**：`classify-input.ts` 内与 `record-unit-mapper` 重复的日期推断 → 调用同一套或只保留一处「语义→proposed」、一处「proposed→DB 时间」。
- **前端收口**：`pending` 与 `ingestClarify` 以 **`inputId` + 单会话槽位** 对齐（补 1）；`onDeferResolved` 等旧「双卡」辅助函数随 `defer:` 模型废除而删除或改为更新同卡 `lifecycle`。
- **不删除**：`/api/v2/parse`、`RecordEditDrawer` 内 parse 路径（仅展示一致性修改）；未引用的 `useAiEnhance.ts` **本次可不删文件**，避免无关 diff。

---

## 必改文件清单（与执行稿对齐）

| 区域 | 文件 |
|------|------|
| 后端时间 + promote | [inputs/route.ts](src/app/api/v2/inputs/route.ts)、[inputs/[id]/answer/route.ts](src/app/api/v2/inputs/[id]/answer/route.ts)、[classify-input.ts](src/lib/ai/classify-input.ts)、[record-unit-mapper.ts](src/lib/utils/record-unit-mapper.ts) |
| 复合句与普通追问 | [clarification-planner.ts](src/lib/ingest/clarification-planner.ts)、[answer/route.ts](src/app/api/v2/inputs/[id]/answer/route.ts)、[skip/route.ts](src/app/api/v2/inputs/[id]/skip/route.ts)、[inputs/route.ts](src/app/api/v2/inputs/route.ts)（`primary_unit_id`）、[src/types/inputs.ts](src/types/inputs.ts)、[QuickInput.tsx](src/app/(dashboard)/records/components/QuickInput.tsx) |
| 生命周期 UI | [QuickInput.tsx](src/app/(dashboard)/records/components/QuickInput.tsx)、[RecordsClient.tsx](src/app/(dashboard)/records/RecordsClient.tsx) |
| 时间轴与详情展示 | [RecordList.tsx](src/app/(dashboard)/records/components/RecordList.tsx)、[RecordItem.tsx](src/app/(dashboard)/records/components/RecordItem.tsx)、[RecordEditDrawer.tsx](src/app/(dashboard)/records/components/RecordEditDrawer.tsx)（**仅展示**，不重做解析主链） |

---

## 实现顺序建议

1. **record-unit-mapper**：扩展/固化 `resolveTemporalFields`（优先级 + duration→end + 单测或 story 注释）。  
2. **classify-input**：多 unit 锚点继承 + 与 mapper 对齐；互斥锚点 issue 保持并验证不入库。  
3. **inputs POST + answer**：改为仅调用统一时间入口；审计 batch/links。  
4. **clarification-planner + answer + types/inputs**：为 `PendingQuestion` 增加 **`clarify_class`**（及可选 `clarify_subtype`），与现有 **`kind`（控件）** 分离；`primary_unit_id`；`keep_single` 实现；**[skip/route.ts](src/app/api/v2/inputs/[id]/skip/route.ts)** 返回的 `next.question` 须带相同字段。  
5. **RecordsClient + QuickInput**：`inputId` + **单会话槽位**生命周期；`failed` 收束（补 4）；废除 `defer:` 双卡。  
6. **RecordItem / RecordList / RecordEditDrawer**：时间显示优先级 `occurred_at` / `occurred_at_end` / `time_text`；原文与起止时刻在详情可见。

---

## 验收场景

**可执行清单见上文「补 5」**（每条须勾 UI / 接口 / 入库三类）。完成后在「执行状态」下追加自测表。

---

## 风险与注意点

- **模型行为**：`is_compound` 与 unit 数不一致时，依赖 **classify 侧继承与冲突检测** 兜底。  
- **会话恢复**：`deferred` 同卡依赖 `sessionStorage` + `inputId`；若刷新丢失，须在实现说明中标注「刷新后是否需 GET input」（本次可不做 API，但须在回报中写清限制）。  
- **类型**：以 [src/types/teto.ts](src/types/teto.ts)、[src/types/inputs.ts](src/types/inputs.ts) 为准扩展 **`PendingQuestion.clarify_class`**（及 `POST inputs` 的 `primary_unit_id`、`PendingInputDraft.lifecycle`）；**勿误改** `PendingQuestion.kind` 语义除非已同时引入 `widget` 并完成全仓替换。

---

## 执行状态

- [ ] 待用户确认本计划后进入 Agent 模式实施  
- [ ] 实施完成后在本文件末尾追加「节点改动清单 / 按文件改动 / 保留与删除 / 9 场景自测 / 未通过项」
