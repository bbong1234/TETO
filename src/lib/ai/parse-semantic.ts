/**
 * parse-semantic.ts
 * DeepSeek LLM 语义解析引擎
 * 调用 DeepSeek API（兼容 OpenAI 格式）解析自然语言输入为 ParsedSemantic
 */

import type { ParsedSemantic, TimeAnchor, ParsedResult, ClauseRelation, RecordLinkHint } from '@/types/semantic';

// ================================================================
// System Prompt — 定义 LLM 的解析任务
// ================================================================

const SYSTEM_PROMPT = `你是 TETO 个人效率系统的语义解析引擎。
你的任务是将用户输入的中文自然语言句子解析为结构化 JSON。

## 输出格式
严格返回以下 JSON（不要返回其他文字）：
{
  "is_compound": false,
  "units": [
    {
      "subject": null,
      "action": "动词/行为",
      "object": null,
      "time_anchor": null,
      "location": null,
      "people": [],
      "mood": null,
      "energy": null,
      "manner": null,
      "cost": null,
      "duration_minutes": null,
      "metric": null,
      "record_link_hint": null,
      "item_hint": null,
      "sub_item_hint": null,
      "shared_context": null,
      "type_hint": "发生",
      "risk_level": "low",
      "fuzzy_category": null,
      "fuzzy_hint": null,
      "field_confidence": {},
      "reasoning": "简要说明为什么这么归类，匹配了什么关键词/上下文"
    }
  ],
  "relations": [],
  "confidence": 0.9
}

## 字段说明
- subject: 主语，默认 null 表示"我"
- action: 核心动作/谓语，尽量提取动词短语
- object: 宾语
- time_anchor: 如果句中有时间词（明天、昨天、上周三、3月15号等），返回 {"raw":"原文","direction":"past|present|future"}；注意 resolved_date 留空字符串，由后端计算
- location: 提取地点（在哪里）
- people: 提取相关人物，数组格式
- mood: 情绪词（开心、烦躁、焦虑等），没有就 null
- energy: 能量状态（累、精力充沛等），没有就 null
- manner: 方式状语（匆忙地、认真地等），没有就 null
- cost: 金额数字，单位元
- duration_minutes: 时长分钟数。注意提取常见表达："半小时"=30，"一个小时"=60，"两个半小时"=150，"1.5h"=90，"练了一个小时"=60，"吃半小时饭"=30
- metric: 量化数据 {"value":数字,"unit":"单位","name":"对象"}，没有就 null
- record_link_hint: 如果你判断当前输入与「近期记忆」中的某条记录有语义关联，返回对象 {"target_id":"xxx","link_type":"completes","reason":"简短理由"};
  link_type 可选值: completes(完成计划), related_to(相关事件), derived_from(派生);
  如果无关联则返回 null。
  **重要约束**：只有存在明确的因果或完成关系才返回 record_link_hint：
  - completes: 当前输入明确完成了某条计划（如"考试考了90分"完成了"明天的考试"）
  - derived_from: 当前输入明确派生自某条记录
  - related_to: 仅当有明确的时间指代关系时才使用（如"昨天考试"中的"昨天"指向某条记录），同一天同一事项下的并发记录（如"背了50个单词"和"又背了60个"）不要关联
  不要因为两条记录属于同一事项或同一天就建立关联，它们可能只是并发事件
- item_hint: 推测关联的事项/项目名称。如果有「事项列表」上下文，请优先从列表中选择匹配的事项名称（完全一致）。如果列表中没有合适的，再自行推测。
- sub_item_hint: 推测关联的子项名称。当同一事项下有多个子项（如"英语单词复习"和"英语单词新学"），根据 metric.name 和 action 判断应归属哪个子项。
  匹配逻辑：metric.name 相同或相近时，根据 action 区分子项。例如：
  - metric.name="单词" 且 action 包含"新学""新背""新" → sub_item_hint 指向新学类子项
  - metric.name="单词" 且 action 包含"复习""温习""重背" → sub_item_hint 指向复习类子项
  - 如果没有明显区分动作，直接用 metric.name 作为 sub_item_hint
  **复合句中每个 unit 都必须独立判断 sub_item_hint，不要只匹配第一个。**
- shared_context: 当一个复合句包含共享的时长/花费/地点等修饰语，且无法确定属于哪个子行动时，不要把共享修饰语强行分配给某个unit，也不要丢弃。在每个unit中放入 shared_context 数组，记录共享但无法分配的修饰语。
  格式: [{"field":"duration_minutes","value":60,"raw":"花了一个小时"}]
  例如:"新学了90个单词，复习了30个，花了一个小时"
  -> 两个unit的duration_minutes都为null
  -> 两个unit都有 shared_context: [{"field":"duration_minutes","value":60,"raw":"花了一个小时"}]
  "在地铁上背了单词，然后看了会儿书" -> location='地铁'只属于第一个unit，第二个unit不继承
  如果不能确定修饰语属于哪个行动，就不分配，放入shared_context
- type_hint: 推断记录类型，取值 "发生"|"计划"|"想法"|"总结"
  - 已完成的事用"发生"
  - 将来打算做的用"计划"
  - 感想/灵感用"想法"
  - 回顾/总结性质用"总结"
- reasoning: 简要说明你的归类理由，格式为："归到[事项名]因为[匹配原因]，类型[XX]因为[判断原因]"。示例："归到英语因为匹配事项列表中的'英语'，类型发生因为是已完成的行为"
  这条理由会被展示给用户看，帮助他们理解AI为什么这样归类，也能帮助他们发现归类错误
- fuzzy_category: 当输入模糊时，设为 "unintelligible"（无法理解）| "insufficient_info"（信息不足）| "unreasonable"（不合理）。信息充分的输入不设此字段。
- fuzzy_hint: 当 fuzzy_category 不为 null 时，给出简洁具体的提示语，帮助用户补充信息或改写。

## risk_level（风险等级）
对每条 unit，判断自动处理的风险等级：
- "low": 信息明确、归类无歧义（如"今天学了英语"）→ 可直接落地
- "medium": 有一定模糊性但不严重（如"最近状态不太好"、"搞了会儿那个"）→ 建议用户确认
- "high": 错误代价大、涉及历史概括/批量推断（如"去年基本都是8:30上班"、"那段时间每天7:40起床"）→ 必须用户确认

## field_confidence（置信度分级）
对以下字段，你必须在 field_confidence 中标注是 "certain" 还是 "guess"：
- mood、energy、item_hint、record_link_hint、type_hint、location、people

规则：
- "certain" = 文本中有明确词汇证据（如"开心"→mood:开心 是 certain）
- "guess" = 你通过语境、语气推测得出（如从"又加班到凌晨"推断 energy:累 是 guess）
- 只有你填写了的非 null 字段才需要标注，未填写的不要加入 field_confidence

## 复合句拆分原则（核心：按可独立统计的行为单元拆）

> 拆分的目标是让每条记录可以独立统计。如果两个片段的量化数据（时长/数量/金额）需要分开统计，就必须拆开；如果拆开后某个片段失去了独立的统计意义，就不该拆。

### 必须拆开的情况（满足任一即拆）
1. **不同动作**：学了英语，还健身了 → 拆（两个独立行为，各自可统计时长）
2. **不同事项**：处理工作，又复习英语 → 拆（归属不同事项）
3. **不同时间段**：上午开会，晚上跑步 → 拆（时间不同，需分开统计）
4. **不同统计对象**：学了2小时英语，花了100元买资料 → 拆（学习行为 vs 消费行为，统计维度不同）
5. **不同记录类型**：今天学了英语，明天打算跑步 → 拆（发生 vs 计划）

### 禁止拆开的情况（即使有逗号/连词也不拆）
1. **同一行为的补充说明**：背了30个单词，感觉状态不错 → 不拆（"感觉状态不错"是对背单词的评价，不是独立行为）
2. **情绪/评价附着主记录**：开了个会，挺烦 → 不拆（"挺烦"是情绪修饰，不独立统计）
3. **效果说明附着主记录**：学了英语1小时，效率一般 → 不拆（"效率一般"是效果评价，附属于学英语）
4. **量化数据是同一行为的细分**：新学了90个单词，复习了30个 → 不拆（都是"背单词"行为，可合并为 metric_value=120）
   但如果明确区分了统计口径（如事项下有"新学"和"复习"两个子项），则拆为两条
5. **共享修饰语**：在图书馆学了2小时英语和1小时数学 → 拆为两条，但 location="图书馆" 都保留

### 拆分判断决策流程
遇到含逗号/连词的句子，按以下顺序判断：
1. 后半句是否是独立行为（有自己的动作动词）？ → 不是则不拆
2. 后半句是否可独立统计（有独立时长/数量/金额）？ → 不能则不拆
3. 后半句是否属于不同事项？ → 不是则不拆
4. 后半句是否属于不同时间段？ → 不是则不拆
5. 通过以上检查 → 拆分

### 拆分示例
✅ 拆："学了英语还健身了" → 2条（学英语 + 健身，不同动作不同事项）
✅ 拆："上午开会，晚上跑步" → 2条（不同时间段）
✅ 拆："学了2小时英语，花了100元买资料" → 2条（学习行为 vs 消费行为）
✅ 拆："今天背了50个单词，明天要复习语法" → 2条（发生 vs 计划）

❌ 不拆："背了30个单词，感觉状态不错" → 1条（感觉是评价，不是独立行为）
❌ 不拆："学了英语1小时，效率一般" → 1条（效率是效果评价）
❌ 不拆："开了个会，挺烦" → 1条（烦是情绪修饰）
❌ 不拆："跑步5公里，出了很多汗" → 1条（出汗是跑步的附属效果）

如果输入包含多个独立事件，必须设 is_compound=true，units 数组放多个对象。
每个 unit 都应独立设置 type_hint（可能一个是"发生"、另一个是"计划"或"想法"）。
每个 unit 也应独立判断 record_link_hint。
每个 unit 也应独立判断 risk_level。
例如："上午开会，下午去医院" → 拆分为 2 个 units。
"今天吃了火锅，明天要去跑步，突然想到一个好主意" → 3 个 units，分别是发生/计划/想法。
relations 描述单元间关系：[{"from":0,"to":1,"type":"sequence|contrast|cause|parallel"}]

### 拆分规则1：同事项不同统计口径必须拆
同一事项下的不同量化指标，如果统计口径不同（时长 vs 数量 vs 金额），必须拆成独立 units。
正例："背了50个单词，听了30分钟英语" → 2 个 units，一个是"背单词"（metric），一个是"听英语"（duration），属于同一事项但统计口径不同。
正例："学了2小时英语，花了100元买资料" → 2 个 units，一个是学英语（duration），一个是买资料（cost），统计口径完全不同。
反例："背了30个单词，感觉状态不错" → 不拆，1 个 unit。"感觉状态不错"是评价，没有独立统计口径。

### 拆分规则2：同行为同口径不拆
如果多个片段属于同一个行为、同一个统计口径，即使有多个数据点也不拆，合并为一条记录。
正例："新学了90个单词，复习了30个" → 如果事项下没有"新学"和"复习"的区分子项，则不拆，合并为1条记录。
正例："早上跑了3公里，下午又跑了2公里" → 1条记录，metric_value=5，备注中说明分段。
例外：如果事项下有"新学"和"复习"的区分子项，则拆为2条分别归属不同子项。

### 拆分规则3：花费 vs 指标 vs 时长的区分
指标（metric）是主体动作的直接产出。花费（cost）是做这件事附带的金钱成本。时长（duration_minutes）是做这件事花费的时间。
判断标准：看主体动作是什么。
- "背单词100个，花了30块" → metric={name:"单词",value:100,unit:"个"}, cost=30
- "买了一杯咖啡30块" → cost=30, 不需要 metric（消费行为的产出不是量化指标）
- 如果主体动作是"消费/购买"，花费就是事件本身；如果主体主体是"学习/运动"，花费只是附带成本。
反例："单词书花了30块" → cost=30, metric=空。不要把"单词书"误解析为 metric_name。
**关键区分**："花了X分钟/小时"是 duration_minutes，不是 cost！"花了X块/元/钱"才是 cost。
- "花了100分钟" → duration_minutes=100, cost=null
- "花了100块" → cost=100, duration_minutes=null
- "新学了39个单词，复习了23个，花了100分钟" → 两个unit，duration_minutes 都为 null（共享时长无法分配），shared_context: [{"field":"duration_minutes","value":100,"raw":"花了100分钟"}]

## 注意事项
- 只返回 JSON，不要加 markdown 代码块标记
- 所有字段如果识别不出就填 null 或空数组
- confidence 表示你对解析结果的置信度（0~1）
- 关于 record_link_hint: 只有当「近期记忆」上下文被提供时才能返回 target_id 对象；如果没有近期记忆上下文，可以返回关键词字符串供后端搜索

## 概括性历史识别规则
判断输入是否为"概括性历史"——用户用一句话描述了一段时期的重复规律，而非某天某次的精确事实。

### 必须识别为规律的条件
输入同时满足以下条件：
1. 描述的是一个**重复性**行为/状态（"基本每天"、"大多"、"一般都"、"通常"、"一直"、"经常"）
2. 指向**一段过去时间**而非某一天（"那段时间"、"去年"、"之前那段"、"那阵子"、"一段时间里"）
3. 无法精确定位到具体某天某次

如果识别为规律记录，设置：
- is_period_rule = true
- period_frequency = "daily" / "weekly" / "monthly" / "irregular"
- period_start_date / period_end_date = 如果能推断出时间范围则填，否则 null
- data_nature = "fact"（规律记录本身是事实描述，不是推断）
- risk_level = "high"（规律记录的错误代价高，必须用户确认）

### 不算规律的例子
- "昨天晚上跑了步" → 普通补录（用户能逐条明确表达）
- "上周三去办了签证" → 普通补录（精确到某天）
- "前天开了个会" → 普通补录

### 算规律的例子
- "那段时间基本每天7:40起床" → is_period_rule=true, period_frequency=daily
- "去年大多8:30上班" → is_period_rule=true, period_frequency=daily
- "之前基本每周跑3次步" → is_period_rule=true, period_frequency=weekly
- "那阵子经常学到半夜" → is_period_rule=true, period_frequency=irregular

## 模糊输入3类区分规则
判断输入是否属于"模糊"，并区分为3种不同类型。不是所有模糊都该同样处理。

### A. 无法理解（unintelligible）
条件：表达太碎、缩写太多、缺主语缺动作、语义冲突，你完全无法确定用户在说什么。
示例："那个"、"搞了"、"嗯"、"算了"
处理：设 fuzzy_category="unintelligible"，risk_level="high"，fuzzy_hint 给出澄清提示（如"请补充你做了什么"）

### B. 信息不足（insufficient_info）
条件：你能理解大概在做什么，但缺少关键归类信息（事项、类型、量化数据等）。
示例："搞了会儿那个"、"处理了一些工作"、"学了一会儿"、"今天状态一般"
处理：设 fuzzy_category="insufficient_info"，risk_level="medium"，fuzzy_hint 给出补信息提示（如"请补充是哪个事项"）
允许低精度落地，但标记为需要后续补充。

### C. 不合理（unreasonable）
条件：一条输入里塞了太多不相关内容，或时间明显冲突，或计划和结果混成一条。
示例："今天学英语明天健身后天开会还买了杯咖啡花了30块"（太多不相关内容塞成一条）
处理：设 fuzzy_category="unreasonable"，risk_level="medium"，fuzzy_hint 给出拆分/改写提示（如"建议拆分为多条记录"）

### 不算模糊的例子
- "背了30个单词" → 信息充分，不算模糊
- "明天去跑步" → 信息充分，不算模糊
- "最近状态不太好" → 算B类（信息不足），但可以先收为低精度

### 重要规则
1. 只有确实模糊时才设 fuzzy_category，信息充分的输入不设
2. fuzzy_hint 是给用户看的提示，应简洁具体
3. 模糊输入仍然要尽量填充你能确定的字段（如 type_hint、action），不要全部留空
`;

// ================================================================
// DeepSeek API 调用
// ================================================================

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekChoice {
  message: { content: string };
  finish_reason: string;
}

interface DeepSeekResponse {
  choices: DeepSeekChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function callDeepSeek(messages: DeepSeekMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.1, // 低温度保证稳定输出
      max_tokens: 1024,
      response_format: { type: 'json_object' }, // 强制 JSON 输出
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`);
  }

  const data: DeepSeekResponse = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error('DeepSeek API 返回空结果');
  }

  return data.choices[0].message.content;
}

// ================================================================
// 解析结果校验与修正
// ================================================================

function validateAndFixSemantic(raw: Record<string, unknown>, overallConfidence?: number): ParsedSemantic & { type_hint?: string } {
  return {
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    action: typeof raw.action === 'string' ? raw.action : '',
    object: typeof raw.object === 'string' ? raw.object : null,
    time_anchor: raw.time_anchor && typeof raw.time_anchor === 'object'
      ? {
          raw: (raw.time_anchor as Record<string, unknown>).raw as string || '',
          resolved_date: '', // 由后端 resolveTimeAnchor 填充
          direction: ((raw.time_anchor as Record<string, unknown>).direction as TimeAnchor['direction']) || 'present',
        }
      : null,
    location: typeof raw.location === 'string' ? raw.location : null,
    people: Array.isArray(raw.people) ? raw.people.filter((p): p is string => typeof p === 'string') : [],
    mood: typeof raw.mood === 'string' ? raw.mood : null,
    energy: typeof raw.energy === 'string' ? raw.energy : null,
    manner: typeof raw.manner === 'string' ? raw.manner : null,
    cost: typeof raw.cost === 'number' ? raw.cost : null,
    duration_minutes: typeof raw.duration_minutes === 'number' ? raw.duration_minutes : null,
    metric: raw.metric && typeof raw.metric === 'object'
      ? (() => {
          const val = (raw.metric as Record<string, unknown>).value;
          if (typeof val !== 'number' || isNaN(val)) return null;
          return {
            value: val,
            unit: (raw.metric as Record<string, unknown>).unit as string || '',
            name: (raw.metric as Record<string, unknown>).name as string || '',
          };
        })()
      : null,
    record_link_hint: raw.record_link_hint && typeof raw.record_link_hint === 'object'
      ? {
          target_id: (raw.record_link_hint as Record<string, unknown>).target_id as string || '',
          link_type: (raw.record_link_hint as Record<string, unknown>).link_type as string || 'related_to',
          reason: (raw.record_link_hint as Record<string, unknown>).reason as string || '',
        } as RecordLinkHint
      : typeof raw.record_link_hint === 'string' ? raw.record_link_hint : null,
    item_hint: typeof raw.item_hint === 'string' ? raw.item_hint : null,
    sub_item_hint: typeof raw.sub_item_hint === 'string' ? raw.sub_item_hint : null,
    shared_context: Array.isArray(raw.shared_context)
      ? (raw.shared_context as Array<Record<string, unknown>>)
          .filter((item) => item != null && typeof item === 'object')
          .map((item) => ({
            field: typeof item.field === 'string' ? item.field : '',
            value: item.value ?? null,
            raw: typeof item.raw === 'string' ? item.raw : '',
          }))
          .filter((item) => item.field && item.raw)
      : null,
    field_confidence: raw.field_confidence && typeof raw.field_confidence === 'object'
      ? Object.fromEntries(
          Object.entries(raw.field_confidence as Record<string, unknown>)
            .filter(([, v]) => v === 'certain' || v === 'guess')
            .map(([k, v]) => [k, v as 'certain' | 'guess'])
        )
      : undefined,
    type_hint: typeof raw.type_hint === 'string' ? raw.type_hint : undefined,
    confidence: overallConfidence,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
    risk_level: (['low', 'medium', 'high'].includes(raw.risk_level as string)
      ? raw.risk_level as 'low' | 'medium' | 'high'
      : undefined),
    // 规律/历史字段
    is_period_rule: raw.is_period_rule === true ? true : undefined,
    period_start_date: typeof raw.period_start_date === 'string' ? raw.period_start_date : undefined,
    period_end_date: typeof raw.period_end_date === 'string' ? raw.period_end_date : undefined,
    period_frequency: (['daily', 'weekly', 'monthly', 'irregular'].includes(raw.period_frequency as string)
      ? raw.period_frequency as 'daily' | 'weekly' | 'monthly' | 'irregular'
      : undefined),
    data_nature: (['fact', 'inferred'].includes(raw.data_nature as string)
      ? raw.data_nature as 'fact' | 'inferred'
      : undefined),
    // 模糊输入分类
    fuzzy_category: (['unintelligible', 'insufficient_info', 'unreasonable'].includes(raw.fuzzy_category as string)
      ? raw.fuzzy_category as 'unintelligible' | 'insufficient_info' | 'unreasonable'
      : undefined),
    fuzzy_hint: typeof raw.fuzzy_hint === 'string' ? raw.fuzzy_hint : undefined,
  };
}

// ================================================================
// 对外接口
// ================================================================

export interface ParseSemanticResult {
  parsed: ParsedResult;
  /** 每个 unit 对应的 type_hint */
  type_hints: string[];
}

/**
 * 调用 DeepSeek 解析自然语言输入
 * @param input 用户输入文本
 * @param todayDate 当前日期 ISO string（用于 prompt 上下文）
 * @returns 解析结果
 */
export async function parseSemantic(
  input: string,
  todayDate?: string,
  recentRecords?: Array<{ id: string; content: string; date: string; type: string }>,
  items?: Array<{ id: string; title: string }>,
  subItems?: Array<{ id: string; title: string; item_id: string }>
): Promise<ParseSemanticResult> {
  const dateCtx = todayDate || new Date().toISOString().split('T')[0];

  // 构建用户消息：基本输入 + 可选近期记忆上下文
  let userMessage = `今天是 ${dateCtx}。请解析以下输入：\n\n${input}`;

  if (recentRecords && recentRecords.length > 0) {
    const memoryLines = recentRecords
      .slice(0, 30) // 最多 30 条避免 token 超限
      .map(r => `[id:${r.id}] ${r.date} ${r.type} "${r.content}"`)
      .join('\n');
    userMessage += `\n\n## 近期记忆（用户最近的记录，供你判断是否有语义关联）\n${memoryLines}`;
  }

  if (items && items.length > 0) {
    const itemLines = items.map(i => `- ${i.title}`).join('\n');
    userMessage += `\n\n## 事项列表（用户已创建的事项，请优先从中选择 item_hint）\n${itemLines}`;
  }

  if (subItems && subItems.length > 0) {
    const subItemLines = subItems.map(s => `- ${s.title}（属于事项: ${items?.find(i => i.id === s.item_id)?.title ?? '未知'}）`).join('\n');
    userMessage += `\n\n## 子项列表（事项下的细分行动线，请根据 metric.name 和 action 判断 sub_item_hint 应归属哪个子项）\n${subItemLines}`;
  }

  const content = await callDeepSeek([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  // 解析 JSON
  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(content);
  } catch {
    throw new Error(`LLM 返回的内容不是有效 JSON: ${content.slice(0, 200)}`);
  }

  const isCompound = rawJson.is_compound === true;
  const rawUnits = Array.isArray(rawJson.units) ? rawJson.units : [rawJson];
  const confidence = typeof rawJson.confidence === 'number' ? rawJson.confidence : 0.5;

  const units: ParsedSemantic[] = [];
  const typeHints: string[] = [];

  for (const rawUnit of rawUnits) {
    const fixed = validateAndFixSemantic(rawUnit as Record<string, unknown>, confidence);
    const { type_hint, ...semantic } = fixed;
    units.push(semantic);
    typeHints.push(type_hint || '发生');
  }

  // 解析 relations
  const rawRelations = Array.isArray(rawJson.relations) ? rawJson.relations : [];
  const relations: ParsedResult['relations'] = rawRelations
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => ({
      from: typeof r.from === 'number' ? r.from : 0,
      to: typeof r.to === 'number' ? r.to : 1,
      type: (['sequence', 'contrast', 'cause', 'parallel'].includes(r.type as string)
        ? r.type as ClauseRelation
        : 'sequence'),
    }));

  // === 拆分结果后处理校验 ===
  // 防止 AI 违反拆分规则，对不合理的拆分进行合龙
  const validatedUnits = validateSplitResult(input, units, typeHints, relations);

  return {
    parsed: {
      is_compound: validatedUnits.units.length > 1,
      units: validatedUnits.units,
      relations: validatedUnits.relations,
      confidence,
    },
    type_hints: validatedUnits.typeHints,
  };
}

// ================================================================
// 拆分结果后处理校验
// ================================================================

/** 情绪/评价美键词 — 如果后半句只含这些词，不应独立拆分 */
const MOOD_EVALUATION_PATTERNS = [
  /感觉.{0,4}(不错|还好|一般|挺好|挺好|可以|还行|舒服|爽)/,
  /挺?(烦|累|开心|高兴|焦虑|郁闷|不爽|烦躁|爽|好|不错|还行|一般|可以)/,
  /效率?(一般|不高|低|高|还行|不错)/,
  /状态?(不错|还好|一般|挺好|不行|差)/,
  /出了?很多?汗/,
  /心情?(好|不好|一般|还行|不错)/,
  /比较?(轻松|开心|累|烦|焦虑|充实)/,
  /很?(充实|满足|开心|累|烦|焦虑|爽|舒服|难)/,
  /不怎么?\s*(样|好|行)/,
  /还?可以/,
  /收获.{0,4}(很大|不少|挺多)/,
];

/**
 * 拆分结果后处理校验
 * 检查 AI 的拆分结果是否符合"按可独立统计的行为单元拆"的原则
 * 对不合理的拆分进行合龙
 */
function validateSplitResult(
  input: string,
  units: ParsedSemantic[],
  typeHints: string[],
  relations: ParsedResult['relations']
): { units: ParsedSemantic[]; typeHints: string[]; relations: ParsedResult['relations'] } {
  // 如果只有1条 unit，无需校验
  if (units.length <= 1) {
    return { units, typeHints, relations };
  }

  // 检查每个 unit 是否有独立的统计价值
  const shouldKeep: boolean[] = units.map((unit, _idx) => {
    const action = unit.action?.trim() || '';
    const obj = unit.object?.trim() || '';
    const hasAction = action.length > 0;

    // 检查是否只是情绪/评价（没有独立行为动词）
    const unitText = `${action} ${obj} ${unit.mood || ''} ${unit.energy || ''}`.trim();
    const isOnlyMoodEval = MOOD_EVALUATION_PATTERNS.some(p => p.test(unitText));

    // 如果只有情绪/评价，没有独立行为 → 不应独立拆分
    if (isOnlyMoodEval && !unit.metric && !unit.duration_minutes && !unit.cost && !unit.time_anchor) {
      return false;
    }

    // 如果 unit 没有 action 且没有任何量化数据 → 不应独立拆分
    if (!hasAction && !unit.metric && !unit.duration_minutes && !unit.cost) {
      return false;
    }

    return true;
  });

  // 如果所有 unit 都应保留，直接返回
  if (shouldKeep.every(Boolean)) {
    return { units, typeHints, relations };
  }

  // 合并不应独立拆分的 unit 到前一个有效 unit
  const mergedUnits: ParsedSemantic[] = [];
  const mergedTypeHints: string[] = [];
  const indexMap = new Map<number, number>(); // oldIdx -> newIdx
  let newIdx = 0;

  for (let i = 0; i < units.length; i++) {
    if (shouldKeep[i]) {
      indexMap.set(i, newIdx);
      mergedUnits.push(units[i]);
      mergedTypeHints.push(typeHints[i]);
      newIdx++;
    } else {
      // 将此 unit 的修饰信息合并到前一个有效 unit
      const prevUnit = mergedUnits[mergedUnits.length - 1];
      if (prevUnit) {
        // 合并情绪/能量
        if (units[i].mood && !prevUnit.mood) prevUnit.mood = units[i].mood;
        if (units[i].energy && !prevUnit.energy) prevUnit.energy = units[i].energy;
        // 合并 field_confidence
        if (units[i].field_confidence) {
          prevUnit.field_confidence = { ...prevUnit.field_confidence, ...units[i].field_confidence };
        }
        // 在 reasoning 中追加分拆原因
        if (units[i].action || units[i].mood || units[i].energy) {
          const extra = [units[i].action, units[i].mood, units[i].energy].filter(Boolean).join('，');
          if (extra) {
            prevUnit.reasoning = (prevUnit.reasoning || '') + `；附: ${extra}`;
          }
        }
      }
      // 映射到前一个有效 unit 的索引
      const prevValidIdx = mergedUnits.length - 1;
      if (prevValidIdx >= 0) {
        indexMap.set(i, prevValidIdx);
      }
    }
  }

  // 重建 relations（更新索引）
  const mergedRelations: ParsedResult['relations'] = [];
  for (const rel of relations) {
    const newFrom = indexMap.get(rel.from);
    const newTo = indexMap.get(rel.to);
    if (newFrom !== undefined && newTo !== undefined && newFrom !== newTo) {
      mergedRelations.push({ from: newFrom, to: newTo, type: rel.type });
    }
  }

  return {
    units: mergedUnits,
    typeHints: mergedTypeHints,
    relations: mergedRelations,
  };
}
