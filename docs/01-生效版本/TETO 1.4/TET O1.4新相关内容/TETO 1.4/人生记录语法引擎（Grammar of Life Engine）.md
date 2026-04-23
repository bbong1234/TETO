# 人生记录语法引擎（Grammar of Life Engine）

> 核心思路：每条记录不再是 text + 标签，而是一个​**结构化断言**​。  
> 解析引擎从纯正则升级为 **LLM 语义解析 + 规则兜底** 的混合架构。

---

## 第一层：语义模型定义（Schema）

### 1.1 单条记录的语法结构

一条自然语言输入解析后，应产出以下结构（对应主谓宾定状补）：

ts

```
interface ParsedSemantic {
  // === 核心断言 ===
  subject: string | null;       // 主语："我"、"爸妈"、"小明"
  action: string;               // 谓语/动作："吃"、"考试"、"跑步"
  object: string | null;        // 宾语："猪脚饭"、"驾照科目一"

  // === 上下文修饰（状语/定语）===
  time_anchor: {
    raw: string;                // 原文时间表达："明天"、"上周三"、"3月15号"
    resolved_date: string;      // 解析后的 ISO 日期："2026-04-21"
    direction: 'past' | 'present' | 'future';  // 时间指向
  } | null;
  location: string | null;      // 地点："在公司"、"公园"
  people: string[];             // 关系人：["小明", "同事"]
  mood: string | null;          // 心情修饰："开心"、"烦躁"
  energy: string | null;        // 能量状态："累"、"精力充沛"
  manner: string | null;        // 方式状语："匆忙地"、"认真地"

  // === 量化数据（从原 parseNaturalInput 继承）===
  cost: number | null;
  duration_minutes: number | null;
  metric: { value: number; unit: string; name: string } | null;

  // === 关联意图 ===
  record_link_hint: string | null;  // "上周考试" → 搜索关键词，用于回溯关联
  item_hint: string | null;         // 推荐关联事项的关键词
}
```

### 1.2 复合句拆分后的输出

ts

```
interface ParsedResult {
  /** 是否为复合句 */
  is_compound: boolean;
  /** 拆分后的语义单元（单句时只有 1 个） */
  units: ParsedSemantic[];
  /** 各单元之间的关系 */
  relations: Array<{
    from: number;  // units 索引
    to: number;
    type: 'sequence' | 'contrast' | 'cause' | 'parallel';  // 顺承/转折/因果/并列
  }>;
  /** 整句的置信度 */
  confidence: number;  // 0~1，低于阈值时提示用户确认
}
```

---

## 第二层：解析引擎架构

### 2.1 双轨管道（Pipeline）

```
plaintext用户输入
    |
    v
[规则预处理层] ──→ 提取明确的数值型数据（金额/时长/指标）
    |                （这部分正则准确率高，不浪费 LLM token）
    v
[LLM 语义解析层] ──→ 发送 prompt + 用户输入 → 返回 ParsedResult JSON
    |
    v
[后处理层]
    ├─ 时间锚点解析：将 "明天"/"上周三" 解析为具体日期
    ├─ 记录回溯关联：time_anchor.direction=past 时，搜索历史记录做匹配
    ├─ 事项模糊匹配：用 item_hint 匹配用户事项列表
    └─ 置信度检查：confidence < 0.7 时，UI 提示用户确认/修正
```

### 2.2 LLM Prompt 设计要点

- ​**角色**：你是 TETO 记录系统的语义解析器
- ​**输入**：用户原始文本 + 当前日期 + 用户事项列表（可选）
- ​**输出**：严格的 JSON Schema（ParsedResult）
- ​**规则**：
- - 识别时间表达并标注 direction
  - 识别关系人（"和XX"、"跟XX"、"XX一起"）
  - 识别地点（"在XX"、"去XX"）
  - 复合句按动作主体和时间锚点拆分
  - mood/energy 从修饰语中提取，不是独立标签
  - 无法确定的字段填 null，不猜测

### 2.3 规则兜底层

当 LLM 不可用（网络异常/API 限额）时，fallback 到增强版的现有 ﻿parseNaturalInput.ts﻿：

- 保留当前的金额/时长/指标/时间词提取
- 保留事项模糊匹配
- 复合句拆分退化为连接词切分
- UI 标注"离线解析模式，准确度有限"

---

## 第三层：数据模型扩展

### 3.1 records 表新增字段（SQL 迁移）

sql

```
ALTER TABLE records ADD COLUMN parsed_semantic jsonb DEFAULT NULL;
-- 存储 ParsedSemantic 的完整 JSON，用于回显、二次编辑、洞察聚合

ALTER TABLE records ADD COLUMN time_anchor_date date DEFAULT NULL;
-- 时间锚点解析后的目标日期，用于跨日关联查询

ALTER TABLE records ADD COLUMN linked_record_id uuid DEFAULT NULL REFERENCES records(id);
-- 记录间关联：如"上周考试90分"关联到上周的那条考试记录

ALTER TABLE records ADD COLUMN location text DEFAULT NULL;
-- 地点

ALTER TABLE records ADD COLUMN people text[] DEFAULT NULL;
-- 关系人数组
```

### 3.2 TypeScript 类型同步

在 ﻿Record﻿ interface 中新增对应字段：

```
tsparsed_semantic: ParsedSemantic | null;
time_anchor_date: string | null;
linked_record_id: string | null;
location: string | null;
people: string[] | null;
```

---

## 第四层：前端交互升级

### 4.1 QuickInput 改造

```
plaintext用户输入 → debounce 500ms → 调用 /api/v2/parse（LLM 解析）
    |
    v
[语义卡片区]（替代当前的芯片区）
    ├─ 主体行：[主语] [动作] [宾语]
    ├─ 上下文行：[时间锚点 → 4/21] [地点：公司] [和：小明]
    ├─ 修饰行：[心情：开心] [能量：高]
    ├─ 数据行：[花费 ¥30] [时长 2h]（继承现有芯片）
    └─ 关联行：[→ 关联到：上周的"考试"记录] [→ 事项：学习]

复合句时：
    [检测到 2 个事件]
    事件 1：[吃饭] 发生 → 今天中午
    事件 2：[写作业] 计划 → 今天下午
    [全部提交] [逐条确认] [取消拆分]
```

### 4.2 记录卡片展示增强

RecordItem 中展示解析出的结构化信息：

- 时间锚点不同于当前日期时，显示指向标记（→ 明天 / ← 上周）
- 有 linked\_record\_id 时，显示关联链接
- 有 people 时，显示关系人标签
- 有 location 时，显示地点标签

---

## 第五层：API 新增

### 5.1 POST /api/v2/parse

- ​**输入**​：﻿{ text: string, current\_date: string, items?: {id,title}[] }﻿
- ​**输出**：﻿ParsedResult﻿
- ​**逻辑**：
- 1. 规则预处理（提取金额/时长/指标）
  2. 调用 LLM API（Gemini 或 GPT）
  3. 合并结果
  4. 时间锚点解析
  5. 返回

### 5.2 POST /api/v2/records/link

- ​**输入**​：﻿{ record\_id: string, search\_keyword: string, date\_hint: string }﻿
- ​**输出**：候选关联记录列表
- ​**逻辑**​：按 date\_hint 范围 + keyword 模糊搜索历史记录

---

## 执行阶段建议

|阶段|内容|依赖|
| ------| -------------------------------------------------------| ------------------|
|P0|定义 ParsedSemantic / ParsedResult 的 TypeScript 类型|无|
|P1|实现 /api/v2/parse（LLM 调用 + prompt 工程）|P0 + LLM API Key|
|P2|时间锚点解析器（"明天"→具体日期）|P0|
|P3|数据库迁移 + Record 类型扩展|P0|
|P4|QuickInput 改造为语义卡片 UI|P1 + P3|
|P5|记录回溯关联（/api/v2/records/link）|P3|
|P6|RecordItem 展示增强|P3|
|P7|规则兜底层（离线 fallback）|P0|

> 注：事项目标字段和洞察功能暂搁置，等记录层语义解析稳定后再推进。
