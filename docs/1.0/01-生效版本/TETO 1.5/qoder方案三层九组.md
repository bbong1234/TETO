# qoder方案三层九组

# 记录结构"三层九组"模型重构方案

## 一、现状差距分析

### 当前 records 表字段（约 35 列）

|现有字段|对应 GPT 方案|问题|
| -----------------------------------------| -----------------------------------| -------------------------------------------|
|﻿﻿raw\_input﻿|L1-A﻿raw\_text﻿|名称不一致|
|﻿﻿content﻿|无直接对应|与 raw\_input 边界模糊|
|﻿﻿type﻿|L2-C﻿record\_type﻿|TS 枚举仅 4 种，DB 已有 7 种 CHECK|
|﻿﻿occurred\_at﻿|L2-B﻿occurred\_at\_start﻿|仅单一时间点，缺结束时间|
|﻿﻿duration\_minutes﻿|L2-B﻿duration\_minutes﻿|存在但无 time\_text/time\_precision|
|﻿﻿status﻿|L2-E﻿state﻿|语义混层（运行状态 vs 生命周期）|
|﻿﻿mood﻿|L2-E﻿mood﻿|存在|
|﻿﻿energy﻿|L2-E﻿energy﻿|存在|
|﻿﻿result﻿|L2-G﻿result\_text﻿|存在但缺 outcome\_type/direction|
|﻿﻿location﻿|L2-H﻿place\_text﻿|存在但缺 place\_type|
|﻿﻿people﻿(TEXT[])|L2-H﻿participants﻿|扁平数组，缺角色信息|
|﻿﻿cost﻿|L2-I﻿money\_amount﻿|存在但缺 currency/direction|
|﻿﻿metric\_value/unit/name﻿|L2-I﻿metrics﻿|单条扁平，不支持多指标|
|﻿﻿note﻿|L3-J﻿note﻿|存在|
|﻿﻿item\_id/sub\_item\_id﻿|L3-J|存在|
|﻿﻿is\_starred﻿|L3-J|存在|
|﻿﻿parsed\_semantic﻿(JSONB)|L1-A﻿parse\_snapshot﻿|存在但缺 parse\_version|
|﻿﻿time\_anchor\_date﻿|L2-B 部分|仅日期，缺原文/精度/跨天标记|
|﻿﻿batch\_id/lifecycle\_status﻿|L3-J 附加|存在|

### 五大核心缺口

1. ​**主链断裂**​：缺 action\_text/event\_text/object\_text（发生主干），行为信息锁在 parsed\_semantic JSON 里
2. ​**时间不完整**​：缺 occurred\_at\_end / time\_text / time\_precision / is\_cross\_day
3. ​**因果与意图全缺**​：缺 cause\_text / trigger\_text / intention\_text / deviation\_text
4. ​**结果层薄弱**​：result 存在但缺 outcome\_type / outcome\_direction / goal\_closeness / completion\_ratio\_text
5. ​**L1 保真层不完整**​：缺 normalized\_text / input\_source / parse\_version

---

## 二、字段映射总表（50 字段 → 分三类）

### A 类：已存在，需要重命名或语义对齐（15 个）

|#|GPT 目标字段|当前字段|处理方式|
| ----| ---------------------------------| ---------------------------------| -------------------------------------------------------------|
|1|﻿﻿raw\_text﻿|﻿﻿raw\_input﻿|重命名|
|2|﻿﻿record\_date﻿|record\_day.date（关联查询）|保持现状，record\_date 由 record\_day\_id 关联得到|
|3|﻿﻿occurred\_at\_start﻿|﻿﻿occurred\_at﻿|重命名|
|4|﻿﻿duration\_minutes﻿|﻿﻿duration\_minutes﻿|保持|
|5|﻿﻿record\_type﻿|﻿﻿type﻿|重命名（需同步改 TS 枚举 + DB CHECK）|
|6|﻿﻿mood﻿|﻿﻿mood﻿|保持|
|7|﻿﻿energy﻿|﻿﻿energy﻿|保持|
|8|﻿﻿state﻿|﻿﻿status﻿|重命名 + 语义对齐|
|9|﻿﻿result\_text﻿|﻿﻿result﻿|重命名|
|10|﻿﻿place\_text﻿|﻿﻿location﻿|重命名|
|11|﻿﻿money\_amount﻿|﻿﻿cost﻿|重命名|
|12|﻿﻿item\_id﻿|﻿﻿item\_id﻿|保持|
|13|﻿﻿sub\_item\_id﻿|﻿﻿sub\_item\_id﻿|保持|
|14|﻿﻿note﻿|﻿﻿note﻿|保持|
|15|﻿﻿is\_starred﻿|﻿﻿is\_starred﻿|保持|

### B 类：新增，需要 ALTER TABLE 加列（26 个）

|#|GPT 字段|归属组|优先级|
| ----| -------------------------------------| --------| ---------------------------------------------------|
|16|﻿﻿normalized\_text﻿|L1-A|P1|
|17|﻿﻿input\_source﻿|L1-A|P1|
|18|﻿﻿parse\_snapshot﻿|L1-A|P2（parsed\_semantic 语义调整）|
|19|﻿﻿parse\_version﻿|L1-A|P2|
|20|﻿﻿occurred\_at\_end﻿|L2-B|P1|
|21|﻿﻿time\_text﻿|L2-B|P1|
|22|﻿﻿time\_precision﻿|L2-B|P1|
|23|﻿﻿is\_cross\_day﻿|L2-B|P2|
|24|﻿﻿action\_text﻿|L2-D|**P0**|
|25|﻿﻿event\_text﻿|L2-D|P1|
|26|﻿﻿object\_text﻿|L2-D|P1|
|27|﻿﻿active\_passive﻿|L2-D|P2|
|28|﻿﻿planned\_flag﻿|L2-D|P2|
|29|﻿﻿importance\_level﻿|L2-D|P2|
|30|﻿﻿body\_state﻿|L2-E|P2|
|31|﻿﻿stress\_level﻿|L2-E|P3|
|32|﻿﻿cause\_text﻿|L2-F|P1|
|33|﻿﻿trigger\_text﻿|L2-F|P2|
|34|﻿﻿intention\_text﻿|L2-F|P2|
|35|﻿﻿deviation\_text﻿|L2-F|P2|
|36|﻿﻿outcome\_type﻿|L2-G|**P0**|
|37|﻿﻿outcome\_direction﻿|L2-G|P1|
|38|﻿﻿goal\_closeness﻿|L2-G|P2|
|39|﻿﻿completion\_ratio\_text﻿|L2-G|P2|
|40|﻿﻿place\_type﻿|L2-H|P1|
|41|﻿﻿money\_currency﻿|L2-I|P2|
|42|﻿﻿money\_direction﻿|L2-I|P1|
|43|﻿﻿metrics﻿|L2-I|P1（JSONB 数组，取代 metric\_value/unit/name）|
|44|﻿﻿resource\_cost\_text﻿|L2-I|P2|
|45|﻿﻿review\_status﻿|L3-J|P1|
|46|﻿﻿confidence\_level﻿|L3-J|P1|

### C 类：已有替代方案，不新增独立列（9 个）

|#|GPT 字段|替代方案|
| ----| ----------------------------------| -------------------------------------------------------------|
|47|﻿﻿participants﻿(JSONB)|保留﻿people﻿(TEXT[]) + 新增﻿relation\_roles﻿(TEXT[])|
|48|﻿﻿relation\_roles﻿|新增列（B 类已计入）|
|49|﻿﻿related\_record\_ids﻿|已有 record\_links 表，不改|
|50|﻿﻿tags﻿|已有 record\_tags 表，不改|

---

## 三、重命名策略

> **核心原则：DB 列名不改，TypeScript 层做别名映射。**
>
> 理由：Supabase 客户端直接映射 DB 列名，重命名列 \= 全量数据迁移 + 所有查询改写，风险极大。改为 TS 侧用新名称，内部映射到旧列名。

具体做法：

- ﻿﻿raw\_input﻿ → TS 中同时暴露 ﻿raw\_text﻿（getter 映射到 ﻿raw\_input﻿）
- ﻿﻿type﻿ → TS 中暴露 ﻿record\_type﻿（getter 映射到 ﻿type﻿）
- ﻿﻿occurred\_at﻿ → TS 中暴露 ﻿occurred\_at\_start﻿（getter 映射到 ﻿occurred\_at﻿）
- ﻿﻿status﻿ → TS 中暴露 ﻿state﻿（getter 映射到 ﻿status﻿）
- ﻿﻿result﻿ → TS 中暴露 ﻿result\_text﻿（getter 映射到 ﻿result﻿）
- ﻿﻿location﻿ → TS 中暴露 ﻿place\_text﻿（getter 映射到 ﻿location﻿）
- ﻿﻿cost﻿ → TS 中暴露 ﻿money\_amount﻿（getter 映射到 ﻿cost﻿）

**仅当新名称语义确实更好且迁移可控时，才考虑 DB 列重命名。**  当前建议 Phase 4 统一评估是否做列重命名。

---

## 四、分四期实施

### Phase 1：主链补齐（P0 字段 + record\_type 扩展）

​**目标**：补齐"时间 → 发生 → 状态 → 结果"主链，让记录可独立统计。

​**SQL 迁移**​：﻿004\_record\_backbone\_fields.sql﻿

新增列：

sql

```
-- L2-B 时间组
ALTER TABLE records ADD COLUMN IF NOT EXISTS occurred_at_end TIMESTAMPTZ;
ALTER TABLE records ADD COLUMN IF NOT EXISTS time_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS time_precision TEXT
  CHECK(time_precision IS NULL OR time_precision IN ('exact','approx','fuzzy','unknown'));

-- L2-D 发生主干组（核心新增）
ALTER TABLE records ADD COLUMN IF NOT EXISTS action_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS event_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS object_text TEXT;

-- L2-G 结果组
ALTER TABLE records ADD COLUMN IF NOT EXISTS outcome_type TEXT
  CHECK(outcome_type IS NULL OR outcome_type IN ('done','progress','recovered','maintained','interrupted','stagnant','consumed','deviated','no_change'));
-- DB 存英文枚举，前端通过 OUTCOME_TYPE_LABELS 映射中文，AI 解析对英文更稳定
ALTER TABLE records ADD COLUMN IF NOT EXISTS outcome_direction TEXT
  CHECK(outcome_direction IS NULL OR outcome_direction IN ('positive','neutral','negative'));
-- 同理：DB 英文，前端映射

-- L2-F 因果组（核心）
ALTER TABLE records ADD COLUMN IF NOT EXISTS cause_text TEXT;

-- L2-H 地点组
ALTER TABLE records ADD COLUMN IF NOT EXISTS place_type TEXT
  CHECK(place_type IS NULL OR place_type IN ('home','office','commuting','transport','shop','hospital','school','outdoor','online','other'));
-- DB 英文，前端映射: home=家, office=公司, commuting=路上, transport=交通中, shop=店铺, hospital=医院, school=学校, outdoor=户外, online=线上, other=其他

-- L2-I 量化组
ALTER TABLE records ADD COLUMN IF NOT EXISTS money_direction TEXT
  CHECK(money_direction IS NULL OR money_direction IN ('expense','income','none'));
-- DB 英文，前端映射: expense=支出, income=收入, none=无
ALTER TABLE records ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '[]'::jsonb;
-- 默认空数组 []，非 NULL。理由：避免前端/TS 处理 NULL 时出错，空数组=无指标 ≠ NULL=未知
  -- 格式: [{"name":"时长","value":40,"unit":"分钟"},{"name":"步数","value":6000,"unit":"步"}]

-- L2-H 人物组
ALTER TABLE records ADD COLUMN IF NOT EXISTS relation_roles TEXT[];
  -- 例: ['同事','家人','客户','朋友','领导']

-- L3-J 组织组
ALTER TABLE records ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unchecked'
  CHECK(review_status IN ('unchecked','confirmed','corrected'));
-- DB 英文: unchecked=未检查, confirmed=已确认, corrected=已纠错
ALTER TABLE records ADD COLUMN IF NOT EXISTS confidence_level TEXT
  CHECK(confidence_level IS NULL OR confidence_level IN ('low','medium','high'));
-- DB 英文: low=低, medium=中, high=高

-- L1-A 原始层
ALTER TABLE records ADD COLUMN IF NOT EXISTS input_source TEXT DEFAULT 'manual'
  CHECK(input_source IN ('manual','ai','quick','edit','import'));
-- 英文枚举，无需中文映射
```

​**TypeScript 改动**：

1. ﻿﻿src/types/teto.ts﻿ — Record 接口新增字段：

typescript

```
export interface Record {
  // ... 现有字段保留 ...
  // Phase 1 新增
  occurred_at_end?: string | null;
  time_text?: string | null;
  time_precision?: 'exact' | 'approx' | 'fuzzy' | 'unknown' | null;
  action_text?: string | null;
  event_text?: string | null;
  object_text?: string | null;
  outcome_type?: OutcomeType | null;
  outcome_direction?: 'positive' | 'neutral' | 'negative' | null;
  cause_text?: string | null;
  place_type?: PlaceType | null;
  money_direction?: 'expense' | 'income' | 'none' | null;
  metrics?: SemanticMetric[];  // JSONB 数组，默认 []
  relation_roles?: string[] | null;
  review_status?: 'unchecked' | 'confirmed' | 'corrected';
  confidence_level?: 'low' | 'medium' | 'high' | null;
  input_source?: 'manual' | 'ai' | 'quick' | 'edit' | 'import';
}
```

2. ﻿﻿src/types/teto.ts﻿ — 扩展 RECORD\_TYPES：

```
typescript﻿﻿export const﻿﻿ RECORD_TYPES = [﻿﻿'发生', ﻿﻿'计划', ﻿﻿'想法', ﻿﻿'总结', ﻿﻿'情绪', ﻿﻿'花费', ﻿﻿'结果'] ﻿﻿as const﻿﻿;﻿
```

3. ﻿﻿src/types/teto.ts﻿ — 新增枚举标签映射（DB 存英文，前端显示中文）：

typescript

```
export const OUTCOME_TYPE_LABELS: Record<string, string> = {
  done: '完成',
  progress: '推进',
  recovered: '恢复',
  maintained: '维持',
  interrupted: '被打断',
  stagnant: '停滞',
  consumed: '消耗',
  deviated: '偏离',
  no_change: '无明显结果',
};

export const OUTCOME_DIRECTION_LABELS: Record<string, string> = {
  positive: '正向',
  neutral: '中性',
  negative: '负向',
};

export const PLACE_TYPE_LABELS: Record<string, string> = {
  home: '家', office: '公司', commuting: '路上', transport: '交通中',
  shop: '店铺', hospital: '医院', school: '学校', outdoor: '户外',
  online: '线上', other: '其他',
};

export const MONEY_DIRECTION_LABELS: Record<string, string> = {
  expense: '支出', income: '收入', none: '无',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  unchecked: '未检查', confirmed: '已确认', corrected: '已纠错',
};

export const CONFIDENCE_LEVEL_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高',
};
```

3. ﻿﻿src/types/semantic.ts﻿ — ParsedSemantic 新增字段：

typescript

```
export interface ParsedSemantic {
  // ... 现有字段保留（subject/action/object/manner/cost/duration_minutes/metric 等） ...
  // Phase 1 新增
  action_text?: string | null;         // 更完整的动作描述（比 action 更丰富）
  event_text?: string | null;          // 事件表达
  object_text?: string | null;         // 动作/事件指向对象（比 object 更丰富）
  outcome_type?: string | null;        // 英文枚举: done/progress/recovered/...
  outcome_direction?: string | null;   // 英文枚举: positive/neutral/negative
  cause_text?: string | null;
  time_text?: string | null;           // 原文时间表达（"昨晚"、"下班路上"）
  time_precision?: string | null;      // exact/approx/fuzzy/unknown
  place_type?: string | null;          // 英文枚举: home/office/...
  money_direction?: string | null;     // 英文枚举: expense/income/none
  relation_roles?: string[] | null;    // ["同事","朋友","领导"]
}
```

4. ﻿﻿src/lib/ai/parse-semantic.ts﻿ — 更新 SYSTEM\_PROMPT，让 AI 输出新增字段
5. ﻿﻿src/lib/ai/enhance-record.ts﻿ — buildUpdateFromUnit() 函数扩展，将 AI 解析的新字段回写到记录
6. ﻿﻿src/lib/db/records.ts﻿ — createRecord/updateRecord 支持新字段
7. ﻿﻿src/app/(dashboard)/records/components/RecordItem.tsx﻿ — 展示新增胶囊（action\_text、outcome\_type 等）
8. ﻿﻿src/app/(dashboard)/records/components/RecordEditDrawer.tsx﻿ — 新增编辑字段

​**涉及文件清单**：

- ﻿﻿sql/004\_record\_backbone\_fields.sql﻿（新建）
- ﻿﻿src/types/teto.ts﻿
- ﻿﻿src/types/semantic.ts﻿
- ﻿﻿src/lib/ai/parse-semantic.ts﻿
- ﻿﻿src/lib/ai/parse-rules-fallback.ts﻿
- ﻿﻿src/lib/ai/enhance-record.ts﻿
- ﻿﻿src/lib/db/records.ts﻿
- ﻿﻿src/app/(dashboard)/records/components/RecordItem.tsx﻿
- ﻿﻿src/app/(dashboard)/records/components/RecordEditDrawer.tsx﻿
- ﻿﻿src/app/(dashboard)/records/components/QuickInput.tsx﻿
- ﻿﻿src/lib/db/insights.ts﻿（统计需适配新字段）

---

### Phase 2：L1 保真层 + L2 剩余字段

​**目标**：完善三层分离（原文/解析/确认值），补齐因果意图和完成度。

​**SQL 迁移**​：﻿005\_record\_fidelity\_and\_detail\_fields.sql﻿

新增列：

sql

```
-- L1-A
ALTER TABLE records ADD COLUMN IF NOT EXISTS normalized_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS parse_version TEXT;

-- L2-B
ALTER TABLE records ADD COLUMN IF NOT EXISTS is_cross_day BOOLEAN DEFAULT false;

-- L2-D
ALTER TABLE records ADD COLUMN IF NOT EXISTS active_passive TEXT
  CHECK(active_passive IS NULL OR active_passive IN ('active','passive','mixed','unknown'));
-- DB 英文: active=主动, passive=被动, mixed=混合, unknown=不明
ALTER TABLE records ADD COLUMN IF NOT EXISTS planned_flag BOOLEAN;
ALTER TABLE records ADD COLUMN IF NOT EXISTS importance_level TEXT
  CHECK(importance_level IS NULL OR importance_level IN ('low','medium','high'));
-- DB 英文: low=低, medium=中, high=高

-- L2-E
ALTER TABLE records ADD COLUMN IF NOT EXISTS body_state TEXT;

-- L2-F
ALTER TABLE records ADD COLUMN IF NOT EXISTS trigger_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS intention_text TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deviation_text TEXT;

-- L2-G
ALTER TABLE records ADD COLUMN IF NOT EXISTS goal_closeness TEXT
  CHECK(goal_closeness IS NULL OR goal_closeness IN ('closer','no_change','further'));
-- DB 英文: closer=更接近, no_change=无明显变化, further=更偏离
ALTER TABLE records ADD COLUMN IF NOT EXISTS completion_ratio_text TEXT;

-- L2-I
ALTER TABLE records ADD COLUMN IF NOT EXISTS money_currency TEXT DEFAULT 'CNY';
ALTER TABLE records ADD COLUMN IF NOT EXISTS resource_cost_text TEXT;

-- L2-E 可选
ALTER TABLE records ADD COLUMN IF NOT EXISTS stress_level INTEGER
  CHECK(stress_level IS NULL OR (stress_level >= 1 AND stress_level <= 5));
```

​**改动重心**：

- ﻿﻿parse\_semantic.ts﻿ SYSTEM\_PROMPT 大幅扩展，让 AI 输出所有新字段
- ﻿﻿enhance-record.ts﻿ 增加 ﻿parse\_snapshot﻿ 与 ﻿parse\_version﻿ 的分离逻辑
- ﻿﻿RecordEditDrawer.tsx﻿ 增加更多可编辑字段区域
- ﻿﻿teto.ts﻿ 新增 Phase 2 枚举映射：

typescript

```
export const ACTIVE_PASSIVE_LABELS: Record<string, string> = {
  active: '主动', passive: '被动', mixed: '混合', unknown: '不明',
};

export const IMPORTANCE_LEVEL_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高',
};

export const GOAL_CLOSENESS_LABELS: Record<string, string> = {
  closer: '更接近', no_change: '无明显变化', further: '更偏离',
};
```

---

### Phase 3：字段边界规则嵌入 + AI Parser 全面升级

​**目标**：将 GPT 方案中的 7 条字段边界规则硬编码到 AI Parser 和前端校验中。

​**核心规则实现**：

1. 地点只能写位置，不写状态 → AI Prompt 约束 + 前端校验
2. 行为只能写动作，不写结果 → AI Prompt 约束
3. 原因只能写为什么，不写感受 → AI Prompt 约束
4. 状态 !\= 情绪 → 前端 UI 明确分区展示
5. metrics 不允许脱离语义 → 校验 metrics[].name 必填
6. 原文没有的信息不允许生成 → AI Prompt 约束 + field\_confidence 标记
7. AI 解析结果不能直接覆盖最终字段 → enhance-record.ts 已实现"仅填空字段"逻辑，继续强化

​**涉及改动**：

- ﻿﻿parse-semantic.ts﻿ — SYSTEM\_PROMPT 增加边界约束段落
- ﻿﻿parse-rules-fallback.ts﻿ — 降级模式也遵守边界规则
- ﻿﻿RecordEditDrawer.tsx﻿ — 前端字段分区展示 + 校验提示
- ﻿﻿enhance-record.ts﻿ — 写入前校验（如 place\_text 中含情绪词则警告）

---

### Phase 4：列名统一 + 旧字段清理（可选）

​**目标**：评估是否将 DB 列名统一为 GPT 方案命名，清理废弃字段。

​**可能的重命名**（需逐个评估影响范围）：

- ﻿﻿raw\_input﻿ → ﻿raw\_text﻿
- ﻿﻿type﻿ → ﻿record\_type﻿
- ﻿﻿occurred\_at﻿ → ﻿occurred\_at\_start﻿
- ﻿﻿status﻿ → ﻿state﻿
- ﻿﻿result﻿ → ﻿result\_text﻿
- ﻿﻿location﻿ → ﻿place\_text﻿
- ﻿﻿cost﻿ → ﻿money\_amount﻿

​**可能废弃/合并**：

- ﻿﻿metric\_value﻿ / ﻿metric\_unit﻿ / ﻿metric\_name﻿ → 由 ﻿metrics﻿ JSONB 完全取代
- ﻿﻿chain\_id﻿ → 已废弃
- ﻿﻿phase\_id﻿ / ﻿goal\_id﻿ → 评估是否从 records 移除（通过 item 关联间接获取）

​**注意**：此阶段风险最大，需要完整回归测试。建议在 Phase 1-3 稳定运行后再评估。

---

## 五、统计洞察适配要点

Phase 1 落地后，统计层需适配：

|统计主轴|依赖新字段|改动|
| --------------| ----------------------------------------------------------| ----------------------|
|行动 vs 目标|﻿﻿outcome\_type﻿,﻿completion\_ratio\_text﻿|insights.ts 新增查询|
|时间 vs 计划|﻿﻿occurred\_at\_end﻿,﻿time\_precision﻿|时间段统计更精确|
|投入 vs 效果|﻿﻿outcome\_direction﻿,﻿result\_text﻿|效果统计口径统一|
|近期时间分布|﻿﻿action\_text﻿,﻿place\_type﻿|行为分类统计|

﻿﻿metrics﻿ JSONB 落地后，消费统计 / 时长统计 / 次数统计均可通过 ﻿metrics﻿ 数组统一查询，不再依赖 ﻿metric\_value﻿ + ﻿duration\_minutes﻿ + ﻿cost﻿ 三个分散字段。

---

## 六、实施优先级总结

|优先级|内容|预估工作量|
| --------| ------------------------------------------------------------------| -------------------------|
|**Phase 1**|主链补齐（18 个新列 + record\_type 扩展 + AI 回写 + UI 展示）|大（3-5 天）|
|**Phase 2**|L1 保真 + L2 剩余字段（12 个新列 + AI Prompt 全面升级）|中（2-3 天）|
|**Phase 3**|字段边界规则嵌入|中（2 天）|
|**Phase 4**|列名统一 + 清理（可选）|大（3+ 天，视评估结果）|

​**Phase 1 是唯一必须立即做的**，它直接解决主链断裂和统计口径不稳这两个最核心问题。Phase 2-3 可在 Phase 1 稳定后推进。Phase 4 视情况决定是否执行。

---

## 七、枚举英文化原则（已采纳微调）

### 核心规则

> **所有新增枚举字段的 DB 存储统一使用英文标识，前端通过** ﻿\*\_LABELS﻿ **映射表展示中文。**

理由：

1. AI 解析时对英文枚举更稳定（﻿done﻿ vs ﻿完成﻿）
2. 兼容未来国际化
3. DB 层数据语义更清晰，不受自然语言歧义影响
4. 前端本地化处理更灵活

### 已英文化的枚举字段

|字段|DB 枚举值|前端映射常量|
| -----------------------------| -----------------------------------------------------------------------------------------| ----------------------------------------|
|﻿﻿outcome\_type﻿|done/progress/recovered/maintained/interrupted/stagnant/consumed/deviated/no\_change|﻿﻿OUTCOME\_TYPE\_LABELS﻿|
|﻿﻿outcome\_direction﻿|positive/neutral/negative|﻿﻿OUTCOME\_DIRECTION\_LABELS﻿|
|﻿﻿place\_type﻿|home/office/commuting/transport/shop/hospital/school/outdoor/online/other|﻿﻿PLACE\_TYPE\_LABELS﻿|
|﻿﻿money\_direction﻿|expense/income/none|﻿﻿MONEY\_DIRECTION\_LABELS﻿|
|﻿﻿review\_status﻿|unchecked/confirmed/corrected|﻿﻿REVIEW\_STATUS\_LABELS﻿|
|﻿﻿confidence\_level﻿|low/medium/high|﻿﻿CONFIDENCE\_LEVEL\_LABELS﻿|
|﻿﻿active\_passive﻿|active/passive/mixed/unknown|﻿﻿ACTIVE\_PASSIVE\_LABELS﻿|
|﻿﻿importance\_level﻿|low/medium/high|﻿﻿IMPORTANCE\_LEVEL\_LABELS﻿|
|﻿﻿goal\_closeness﻿|closer/no\_change/further|﻿﻿GOAL\_CLOSENESS\_LABELS﻿|
|﻿﻿input\_source﻿|manual/ai/quick/edit/import|无需映射|
|﻿﻿time\_precision﻿|exact/approx/fuzzy/unknown|无需映射|

### 保留中文的字段

以下字段保留中文存储（非枚举，自由文本）：

- ﻿﻿action\_text﻿ / ﻿event\_text﻿ / ﻿object\_text﻿（自由文本）
- ﻿﻿cause\_text﻿ / ﻿trigger\_text﻿ / ﻿intention\_text﻿ / ﻿deviation\_text﻿（自由文本）
- ﻿﻿time\_text﻿ / ﻿place\_text﻿（原文表达）
- ﻿﻿result\_text﻿ / ﻿completion\_ratio\_text﻿ / ﻿resource\_cost\_text﻿（自由文本）
- ﻿﻿mood﻿ / ﻿energy﻿ / ﻿state﻿ / ﻿body\_state﻿（自由文本）
- ﻿﻿relation\_roles﻿（自由标签数组）
- ﻿﻿note﻿（自由文本）

### metrics 默认空数组（已采纳微调）

```
sql﻿﻿ALTER TABLE﻿﻿ records ADD﻿﻿ COLUMN IF﻿﻿ NOT EXISTS﻿﻿ metrics JSONB DEFAULT﻿﻿ '[]'::jsonb;﻿
```

- ﻿﻿metrics﻿ 默认 ﻿[]﻿ 而非 ﻿NULL﻿
- TS 类型为 ﻿SemanticMetric[]﻿（非 ﻿SemanticMetric[] | null﻿）
- 理由：空数组 \= 无指标，NULL \= 未知。前者语义更清晰，前端处理更安全
- 零风险改动，提升健壮性
