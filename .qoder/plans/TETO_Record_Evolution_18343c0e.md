# TETO Record 架构演进 — 一次性交付计划

## Task 1: 数据层 — 新建 record_links 关联表 + batch_id 字段

**SQL 迁移文件**: `sql/008_record_links_and_batch.sql`

```sql
-- 1. record_links 关联表（独立表 + 类型枚举）
CREATE TABLE record_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN (
    'completes',       -- source 完成了 target（计划→发生）
    'derived_from',    -- source 衍生自 target（同源拆分）
    'postponed_from',  -- source 是 target 的推迟版
    'related_to'       -- 通用双向关联
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, link_type)
);
CREATE INDEX idx_record_links_source ON record_links(source_id);
CREATE INDEX idx_record_links_target ON record_links(target_id);

-- 2. records 表新增 batch_id（同一输入拆分出的记录共享）
ALTER TABLE records ADD COLUMN IF NOT EXISTS batch_id UUID NULL;
CREATE INDEX idx_records_batch_id ON records(batch_id) WHERE batch_id IS NOT NULL;
```

**类型定义扩展** (`src/types/teto.ts`):
- 新增 `RecordLink` 接口: `{ id, source_id, target_id, link_type, created_at }`
- 新增 `RecordLinkType` 字面量类型
- Record 接口添加 `batch_id?: string | null` 和 `linked_records?: RecordLink[]`
- 新增 `CreateRecordLinkPayload` / `UpdateRecordPayload` 增加 batch_id

---

## Task 2: DB 层 — record-links CRUD 函数

**文件**: `src/lib/db/record-links.ts`（新建）

- `createRecordLink(userId, { source_id, target_id, link_type })` — 创建关联
- `getLinksForRecord(userId, recordId)` — 获取某条记录的所有关联（双向）
- `deleteRecordLink(userId, linkId)` — 删除关联

**修改** `src/lib/db/records.ts`:
- `listRecords` 返回时附带 linked_records 概要信息（可选，通过 query 参数控制）
- `createRecord` 支持 batch_id 字段

---

## Task 3: AI Prompt 增强 — 置信度分级 + 强制拆分

**文件**: `src/lib/ai/parse-semantic.ts`

修改 SYSTEM_PROMPT，在每个 unit 中新增：
```json
{
  "field_confidence": {
    "mood": "certain|guess",
    "energy": "certain|guess",
    "item_hint": "certain|guess",
    "record_link_hint": "certain|guess",
    "type_hint": "certain|guess"
  }
}
```

规则说明添加：
- `certain` = 文本中有明确证据（如"开心"→mood:开心 是 certain）
- `guess` = AI 推测/联想得出（如语气推断"应该很累"→energy:低 是 guess）
- 复合句时 `is_compound=true` 必须拆分为独立 units

**类型更新** (`src/types/semantic.ts`):
- ParsedSemantic 新增 `field_confidence?: Record<string, 'certain' | 'guess'>`

---

## Task 4: 异步 AI 增强改造 — 支持多条创建 + 关联

**文件**: `src/app/(dashboard)/records/components/QuickInput.tsx` — `enhanceWithAi()`

当前逻辑：AI 返回 units[0] 更新原记录。

改造为：
1. 若 `is_compound=true && units.length > 1`:
   - 原记录用 units[0] 更新
   - 为 units[1..N] 分别 POST 创建新记录（共享同一个 batch_id）
   - 创建 record_links: 新记录 → 原记录，link_type = `derived_from`
2. 对每个 unit 的 field_confidence 中 `guess` 类字段，标记为 `ai_suggestions`（存入 parsed_semantic 或新字段）
3. 已有的 Auto-Threading 逻辑保留

---

## Task 5: Todo 生命周期 — 完成/推迟 操作

**核心逻辑**：`type='计划' && occurred_at > now()` 的记录视为 Todo。

**新建 API**: `POST /api/v2/records/[id]/complete`
- 验证原记录类型为"计划"
- 新建一条"发生"记录（content 相同，occurred_at = now）
- 创建 record_link: 新记录 → 原记录，link_type = `completes`
- 原记录 status 标记为"已完成"
- 返回新创建的记录

**新建 API**: `POST /api/v2/records/[id]/postpone`
- body: `{ new_date: string }`
- 新建一条"计划"记录（内容相同，time_anchor_date = new_date）
- 创建 record_link: 新记录 → 原记录，link_type = `postponed_from`
- 原记录 status 标记为"已推迟"
- 返回新创建的记录

---

## Task 6: RecordItem UI 改造 — 建议态 + Todo 操作

**文件**: `src/app/(dashboard)/records/components/RecordItem.tsx`

1. **Todo 操作按钮**：当 record.type === '计划' 且 time_anchor_date >= 今天：
   - 显示 "完成" 按钮（绿色勾）和 "推迟" 按钮
   - 点击完成 → 调用 `/api/v2/records/{id}/complete`
   - 点击推迟 → 弹出日期选择 → 调用 `/api/v2/records/{id}/postpone`

2. **AI 建议态胶囊（黄灯）**：
   - 当 parsed_semantic 中某字段的 confidence = `guess` 时
   - 该胶囊显示为半透明/虚线风格 + 确认/拒绝小按钮
   - 用户点确认 → PUT 更新将该字段写入正式数据
   - 用户点拒绝 → 从 parsed_semantic 中移除该字段

3. **关联标识**：若 record 有 linked_records，在 TopBar 显示一个 link 图标 + 数量

---

## Task 7: 多条拆分的 UI 反馈

**文件**: `src/app/(dashboard)/records/components/RecordItem.tsx`

- 若 record.batch_id 存在，在 TopBar 显示 "批次" 标识
- 同 batch_id 的记录之间可以收展查看

**文件**: `src/app/(dashboard)/records/RecordsClient.tsx`

- AI 拆分创建新记录后，自动 refresh 列表
- 新拆分出的记录短暂高亮动画提示用户

---

## Task 8: 编译验证 + 端到端检查

- `tsc --noEmit` 零错误
- 确认所有新 API 路由可访问
- 确认 QuickInput 提交后拆分逻辑正确触发

---

## 涉及文件总览

| 操作 | 文件 |
|------|------|
| 新建 | `sql/008_record_links_and_batch.sql` |
| 新建 | `src/lib/db/record-links.ts` |
| 新建 | `src/app/api/v2/records/[id]/complete/route.ts` |
| 新建 | `src/app/api/v2/records/[id]/postpone/route.ts` |
| 修改 | `src/types/teto.ts` — RecordLink 接口 + batch_id |
| 修改 | `src/types/semantic.ts` — field_confidence |
| 修改 | `src/lib/ai/parse-semantic.ts` — 置信度 prompt |
| 修改 | `src/lib/db/records.ts` — batch_id 支持 |
| 修改 | `src/app/(dashboard)/records/components/QuickInput.tsx` — 多条拆分 |
| 修改 | `src/app/(dashboard)/records/components/RecordItem.tsx` — Todo 操作 + 建议态 |
| 修改 | `src/app/(dashboard)/records/RecordsClient.tsx` — 拆分反馈 |
