/**
 * parse-semantic.ts
 * DeepSeek LLM 语义解析引擎
 * 调用 DeepSeek API（兼容 OpenAI 格式）解析自然语言输入为 ParsedSemantic
 */

import type { ParsedSemantic, TimeAnchor, ParsedResult, ClauseRelation, RecordLinkHint } from '@/types/semantic';
import { RULES } from '@/lib/rules';
import { genDecisionId, genBehaviorId } from '@/lib/observability/id-registry';
import { getBehaviorDescription } from '@/lib/observability/behavior-registry';
import { logClassification } from '@/lib/observability/decision-logger';

// ================================================================
// System Prompt — 定义 LLM 的解析任务
// 由 RULES 记录类型、解析规则动态生成
// ================================================================

const _types = (RULES.record_type.types as readonly string[]);
const _legacyKeysStr = Object.keys(RULES.record_type.legacy_type_map).map(t => `"${t}"`).join('、');
const _moodValues = RULES.parsing.mood_map.map(m => m.value).join('、');
const _bodyStateValues = RULES.parsing.body_state_map.map(m => m.value).join('、');
const _energyValues = RULES.parsing.energy_map.map(m => m.value).join('、');

const SYSTEM_PROMPT = `你是 TETO 个人效率系统的语义解析引擎。
你的任务是将用户输入的中文自然语言句子**先拆解、再填字段**。

⚠️ 最常见错误：把整句话塞进 action_text。必须避免！
action_text 只能是2-4个字的核心动词，如"开会"、"通勤"、"躺着"。

## 解析顺序（必须严格按此顺序工作）

第 1 步：判定主类型（只允许 ${_types.length} 种：${_types.join('、')}）
- 发生：现实已发生的事情/状态/体验/经过/遭遇
- 计划：未来准备做/打算做/待做的事
- 想法：脑子里的疑问/念头/观点/感慨/怀疑
- 总结：对一段时间/一组事情的回顾/归纳/总结性表达

判断优先级：
A. 明显未来意图、待做、打算、准备、明天/之后去做 → 计划
B. 明显观点、怀疑、感慨、疑问、念头 → 想法
C. 明显回顾、整体评价、归纳某段时间 → 总结
D. 默认落到现实已发生或现实状态 → 发生

**绝对禁止**使用${_legacyKeysStr}作为主类型。它们是附属属性，不是主类型。

第 2 步：拆解句子成分（最重要的一步！）
在 thinking 字段中，按以下格式逐一写出拆解结果：
- 核心动词是什么？（只取2-4个字）→ action_text
- 动作指向什么对象？→ object_text
- 事件的情境/背景描述是什么？→ event_text
- 原因是什么？（有"因为/由于/导致/所以"时必须提取）→ cause_text
- 结果/后果是什么？→ result_text
- 时间？地点？人物？心情？身体？状态？

第 3 步：根据拆解结果填入各字段
- 严格按照第2步的拆解结果填写，不要跳过任何已识别的成分

第 4 步：自检（输出前必须检查）
- action_text 超过4个字？→ 你错了，重新提炼核心动词
- 原句有"因为/导致/所以"但 cause_text 为 null？→ 你漏了，必须提取
- 原句描述了后果但 result_text 为 null？→ 你漏了，必须提取
- 原句有情境描述但 event_text 为 null？→ 你漏了，必须提取

第 5 步：不确定时留空
- 原文没有就不猜，不明确就不硬填

## 输出格式
严格返回以下 JSON（不要返回其他文字）：
{
  "is_compound": false,
  "units": [
    {
      "subject": null,
      "action": null,
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
      "field_confidence": {},
      "thinking": "拆解：核心动词=_, 对象=_, 情境=_, 原因=_, 结果=_, 时间=_, 地点=_, 人物=_, 心情=_, 身体=_, 状态=_",
      "main_text": null,
      "action_text": null,
      "event_text": null,
      "object_text": null,
      "result_text": null,
      "cause_text": null,
      "time_text": null,
      "time_precision": null,
      "place_text": null,
      "place_type": null,
      "body_state": null,
      "state": null,
      "money_amount": null,
      "money_direction": null,
      "money_currency": null,
      "relation_roles": [],
      "outcome_type": null,
      "outcome_direction": null
    }
  ],
  "relations": [],
  "confidence": 0.9
}

## 字段说明

### L1 原文与主表达
- main_text: 从原句提炼的核心主表达/主句，不是原文备份
  例："我在家躺着，整个人特别累" → main_text="在家躺着"
  例："今天午饭花了32元，吃完心情好一点" → main_text="午饭花了32元"
  例："我怀疑现在这个记录结构还是有问题" → main_text="怀疑记录结构有问题"
- type_hint: 主类型，只允许 "发生"|"计划"|"想法"|"总结"

### L2 主链区域
- action: 【已废弃，留空即可】不再使用，用 action_text 替代
- object: 【已废弃，留空即可】不再使用，用 object_text 替代
- time_anchor: 时间锚点 {"raw":"原文","direction":"past|present|future"}，resolved_date 留空
- time_text: 原文时间表达，如"昨晚"、"下班路上"、"下午"
- time_precision: 时间精度 exact/approx/fuzzy/unknown
- location (= place_text): 原文地点表达，如"家"、"公司"、"地铁上"。只写位置，不写情绪和状态
- place_type: 地点类型 home/office/commuting/transport/shop/hospital/school/outdoor/online/other
- action_text: 【核心字段】实际动作描述，只写核心动词/行为词。2-4个字。如"开会"、"通勤"、"背单词"、"吃饭"、"躺着"。绝不写时间、地点、人物、结果
- event_text: 事件/情境描述。提取原句中对事件状态的描述。如"会议太长"、"地铁很挤"、"效率不错"、"客户临时改需求"
- object_text: 动作/事件指向的对象。如"会议"、"咖啡"、"单词书"。不要和 metric.name 冲突
- cause_text: 原因。写为什么发生，不是写感受。"焦虑"不属于原因，属于 mood。多个原因用中文分号"；"连接。如"因为客户临时改需求"、"没睡好；天气差"
- result_text: 最后结果/后果/产出/推进情况。多个结果用中文分号"；"连接。如"拖延了进度"、"迟到了20分钟；被领导批评"。允许为空，不要强迫填写
- outcome_type: 结果类型 done/progress/recovered/maintained/interrupted/stagnant/consumed/deviated/no_change（允许为空）
- outcome_direction: 结果方向 positive/neutral/negative（允许为空）

### L3 附属属性
- mood: 主观情绪。如开心、烦、焦虑、烦躁、失落、平静。不是原因也不是身体状态
- energy: 精力高低，只取：很高/高/中/低/很低。"累"不归 energy，归 body_state
- body_state: 身体状态。如累、困、饿、头疼、没精神。"累"优先归 body_state
- state (= DB status): 运转状态。如专注、低效、混乱、被打断、恢复中、拖延
- cost (= money_amount): 金额数字，单位元
- money_direction: 资金方向 expense/income/none
- money_currency: 币种，默认 "CNY"
- duration_minutes: 时长分钟数。"半小时"=30，"一个小时"=60
- metric: 量化数据 {"value":数字,"unit":"单位","name":"指标名称"}，没有就 null
- people: 具体人名，如["小明"]
- relation_roles: 关系角色，如["同事","朋友"]。与 people 不同

### L4 关联意图
- record_link_hint: 与近期记录的语义关联。只有明确因果/完成关系才返回
  {"target_id":"xxx","link_type":"completes|related_to|derived_from","reason":"简短理由"}
- item_hint: 推测关联事项名称。**必须从事项列表中精确选择一个完整的事项标题**，不要返回片段、缩写或自己编造的名称。如果事项列表中没有任何匹配的事项，返回 null。宁可返回 null 也不要猜测
- sub_item_hint: 推测关联子项名称
- shared_context: 共享但无法分配的修饰语

## 字段边界规则（必须遵守）

规则1：main_text 不是原文备份。main_text 是提炼后的主句
规则2：主类型只能有一个。情绪/花费/结果都不是主类型
规则3：地点只写位置，不写状态。"家里很烦" → location="家", mood="烦"
规则4：action_text 只写核心动作词（2-4个字），绝不写整个句子。"昨天下午在公司开会" → action_text="开会"，不是"昨天下午在公司开了"
规则5：原因只写为什么，不写感受。"焦虑"归 mood，不归 cause_text
规则6：mood/energy/body_state/state 必须分开：mood=烦躁, energy=低, body_state=累, state=混乱
规则7：metric 的 name 叫"指标名称"，不用"对象"，避免和 object_text 冲突
规则8：金额叫 money_amount，支出/收入叫 money_direction
规则9：result_text 允许为空，不是所有记录都必须有结果。但有明确结果时必须填写
规则10：原文没有的信息不允许生成，不允许脑补
规则11：outcome_type/outcome_direction 允许为空，不要强迫分析
规则12：action 和 object 字段已废弃，必须留空为 null。只使用 action_text 和 object_text
规则13：event_text 不是可选字段，原句包含对事件状态/情境的描述时必须提取
规则14：cause_text 不是可选字段，原句包含"因为""由于""导致""所以"等因果词时必须提取
规则15：cause_text 和 result_text 可以包含多个原因/结果，用中文分号"；"连接。不要只取第一个
规则16：所有文本字段（main_text/action_text/object_text/event_text/cause_text/result_text/time_text等）必须使用中文汉字，禁止使用拼音或英文音译。例如"西瓜"不能写成"xi gua"，"吃"不能写成"chi"

## 关键例子（必须按此口径实现）

例1："我在家躺着，整个人特别累"
→ type_hint=发生, main_text="在家躺着", location="家", place_type="home", action_text="躺着", body_state="累", mood=null, energy=null, result_text=null, event_text=null, cause_text=null

例2："明天去复查，想到这个我有点紧张"
→ type_hint=计划, main_text="明天去复查", time_text="明天", action_text="去复查", mood="紧张", cause_text=null, result_text=null, event_text=null

例3："今天午饭花了32元，吃完心情好一点"
→ type_hint=发生, main_text="午饭花了32元", cost=32, money_direction="expense", mood="心情好一点", action_text="吃午饭", object_text="午饭", result_text=null, event_text=null, cause_text=null

例4："我怀疑现在这个记录结构还是有问题"
→ type_hint=想法, main_text="怀疑记录结构有问题", object_text="记录结构", result_text=null, mood=null, action_text=null, event_text=null

例5："今天整体效率一般，主要是上午一直被打断"
→ type_hint=总结, main_text="今天整体效率一般", state="被打断", cause_text="上午一直被打断", result_text="效率一般", action_text=null, event_text=null

例6（复合句，多个独立动作必须拆分）："昨天下午在公司和同事小明开了2小时的会，因为客户临时改需求导致会议太长，拖延了进度，花了35元买咖啡，整个人又累又烦，状态很混乱"
→ is_compound=true, units=[Unit0, Unit1], relations=[{"from":0,"to":1,"type":"parallel"}]

Unit 0（主体事件：开会）：
  type_hint=发生, main_text="在公司开会"
  action_text="开会", event_text="客户临时改需求导致会议太长", object_text="会议"
  cause_text="客户临时改需求", result_text="拖延了进度"
  outcome_type="interrupted", outcome_direction="negative"
  location="公司", place_type="office"
  time_text="昨天下午", time_precision="approx"
  people=["小明"], relation_roles=["同事"]
  duration_minutes=120, metric={"value":3,"unit":"个","name":"问题"}
  mood="烦躁", energy="低", body_state="累", state="混乱"

Unit 1（独立行为：买咖啡）：
  type_hint=发生, main_text="买咖啡"
  action_text="买咖啡", object_text="咖啡"
  cost=35, money_direction="expense", money_currency="CNY"
  mood="烦躁", body_state="累"（整体状态描述，两个 unit 都携带）

  ⚠️ 注意：action_text="开会"，绝不是"昨天下午在公司和同事小明开了"！

例7（附属花费，不拆）："午饭吃了碗面花了15块"
→ is_compound=false, 单条记录, action_text="吃午饭", cost=15, money_direction="expense"
  花费是吃面这个动作的附属成本，不需要拆分。

例8（独立消费行为，必须拆）："开了2小时会，花28块买了杯咖啡"
→ is_compound=true
  Unit 0: action_text="开会", duration_minutes=120
  Unit 1: action_text="买咖啡", object_text="咖啡", cost=28, money_direction="expense"
  "花了X元买Y"是独立消费行为（有独立动作"买"），必须拆为独立 unit。

例9（多因多果）："因为没睡好加上天气太差，今天上班迟到了20分钟还被领导批评了"
→ type_hint=发生, cause_text="没睡好；天气太差", result_text="迟到了20分钟；被领导批评"

## field_confidence（置信度分级）
对以下字段，你必须在 field_confidence 中标注是 "certain" 还是 "guess"：
- mood、energy、body_state、state、item_hint、record_link_hint、type_hint、location、people

规则：
- "certain" = 文本中有明确词汇证据
- "guess" = 通过语境、语气推测得出
- 只有填写了的非 null 字段才需要标注

## 复合句处理（强制拆分）
如果输入包含多个独立事件（不同时空、不同动作、不同属性），必须设 is_compound=true，units 数组放多个对象。
每个 unit 都应独立设置 type_hint。
每个 unit 也应独立判断 record_link_hint。
relations 描述单元间关系：[{"from":0,"to":1,"type":"sequence|contrast|cause|parallel"}]

### 拆分规则1：同事项不同指标必须拆
同一事项下的不同量化指标，必须拆成独立 units。
正例："背了50个单词，听了30分钟英语" → 2 个 units，metric 各自独立。

### 拆分规则2：花费 vs 指标 vs 时长的区分
- 指标（metric）是主体动作的直接产出
- 花费（cost）是做这件事附带的金钱成本
- 时长（duration_minutes）是做这件事花费的时间
**关键区分**："花了X分钟/小时"是 duration_minutes，"花了X块/元/钱"才是 cost。

### 拆分规则3：属性归属与共享
- 专属属性（cost、duration_minutes、metric、location）只归属产生它的那个 unit
- 整体状态描述（mood、energy、body_state、state）如果是对整段经历的概括，每个 unit 都应携带
- 判断标准：问"这个属性是因为哪个具体动作产生的？"
  - 如果答案明确指向某 unit，只归该 unit
  - 如果是整体感受，所有 unit 共享
- ⚠️ "花了X元买Y"是独立消费行为，必须拆为独立 unit；"午饭花了X元"是动作附属成本，不拆
- ⚠️ 同一句里先写会议/工作/学习（可含时长），再写「花了X买咖啡/水/东西」的，**必须** is_compound=true 拆成多 unit，不可合并成一条。

## 注意事项
- 只返回 JSON，不要加 markdown 代码块标记
- 所有字段如果识别不出就填 null 或空数组
- confidence 表示解析置信度（0~1）
- record_link_hint: 只有「近期记忆」上下文被提供时才能返回 target_id 对象
- type_hint 只允许：${_types.join('、')}
- mood 只允许：${_moodValues}
- body_state 只允许：${_bodyStateValues}
- energy 只允许：${_energyValues}
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
  genBehaviorId('B-002'); // callDeepSeek LLM 调用追踪
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
      max_tokens: 2048,
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
    location: typeof raw.location === 'string' ? raw.location
      : typeof raw.place_text === 'string' ? raw.place_text : null,
    people: Array.isArray(raw.people) ? raw.people.filter((p): p is string => typeof p === 'string') : [],
    mood: typeof raw.mood === 'string' ? raw.mood : null,
    energy: typeof raw.energy === 'string' ? raw.energy : null,
    manner: typeof raw.manner === 'string' ? raw.manner : null,
    cost: typeof raw.cost === 'number' ? raw.cost
      : typeof raw.money_amount === 'number' ? raw.money_amount : null,
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
    type_hint: typeof raw.type_hint === 'string'
      ? (['发生', '计划', '想法', '总结'].includes(raw.type_hint) ? raw.type_hint
        : ['情绪', '花费', '结果'].includes(raw.type_hint) ? '发生' : '发生')
      : undefined,
    confidence: overallConfidence,
    // === 1.5 录入结构对齐新增 ===
    main_text: typeof raw.main_text === 'string' ? raw.main_text : null,
    result_text: typeof raw.result_text === 'string' ? raw.result_text : null,
    place_text: typeof raw.place_text === 'string' ? raw.place_text : null,
    state: typeof raw.state === 'string' ? raw.state : null,
    body_state: typeof raw.body_state === 'string' ? raw.body_state : null,
    money_amount: typeof raw.money_amount === 'number' ? raw.money_amount : null,
    money_currency: typeof raw.money_currency === 'string' ? raw.money_currency : null,
    // === 三层九组结构化字段 ===
    action_text: typeof raw.action_text === 'string' ? raw.action_text : null,
    event_text: typeof raw.event_text === 'string' ? raw.event_text : null,
    object_text: typeof raw.object_text === 'string' ? raw.object_text : null,
    outcome_type: typeof raw.outcome_type === 'string' && ['done', 'progress', 'recovered', 'maintained', 'interrupted', 'stagnant', 'consumed', 'deviated', 'no_change'].includes(raw.outcome_type) ? raw.outcome_type : null,
    outcome_direction: typeof raw.outcome_direction === 'string' && ['positive', 'neutral', 'negative'].includes(raw.outcome_direction) ? raw.outcome_direction : null,
    cause_text: typeof raw.cause_text === 'string' ? raw.cause_text : null,
    time_text: typeof raw.time_text === 'string' ? raw.time_text : null,
    time_precision: typeof raw.time_precision === 'string' && ['exact', 'approx', 'fuzzy', 'unknown'].includes(raw.time_precision) ? raw.time_precision : null,
    place_type: typeof raw.place_type === 'string' && ['home', 'office', 'commuting', 'transport', 'shop', 'hospital', 'school', 'outdoor', 'online', 'other'].includes(raw.place_type) ? raw.place_type : null,
    money_direction: typeof raw.money_direction === 'string' && ['expense', 'income', 'none'].includes(raw.money_direction) ? raw.money_direction : null,
    relation_roles: Array.isArray(raw.relation_roles) ? raw.relation_roles.filter((r): r is string => typeof r === 'string') : null,
  };
}

// ================================================================
// 4.4 LLM 输出 vs 规则中心校验对比
// ================================================================

/** LLM 输出违背规则中心的单条违规记录 */
export interface RuleViolation {
  /** 违规字段名 */
  field: string;
  /** LLM 输出的原始值 */
  llmValue: unknown;
  /** 规则中心的合法值范围 */
  allowedSet: string;
  /** 违规严重程度 */
  severity: 'error' | 'warning';
  /** 执行的修正动作描述 */
  action: string;
}

/** 对单个 unit 的 LLM 输出做规则中心受控词汇校验 */
function validateAgainstRules(
  rawUnit: Record<string, unknown>,
  fixedTypeHint: string | undefined,
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // ── 1. type_hint 受控词汇校验 ──
  const allowedTypes = (RULES.record_type.types as readonly string[]);
  const legacyTypes = Object.keys(RULES.record_type.legacy_type_map);
  const rawTypeHint = rawUnit.type_hint;
  if (typeof rawTypeHint === 'string') {
    if (legacyTypes.includes(rawTypeHint)) {
      violations.push({
        field: 'type_hint',
        llmValue: rawTypeHint,
        allowedSet: allowedTypes.join('、'),
        severity: 'error',
        action: `LLM 输出了已废弃类型"${rawTypeHint}"，已自动修正为"${fixedTypeHint ?? '发生'}"`,
      });
    } else if (!allowedTypes.includes(rawTypeHint)) {
      violations.push({
        field: 'type_hint',
        llmValue: rawTypeHint,
        allowedSet: allowedTypes.join('、'),
        severity: 'error',
        action: `LLM 输出了非法类型"${rawTypeHint}"，已降级为"${fixedTypeHint ?? '发生'}"`,
      });
    }
  }

  // ── 2. mood 受控词汇校验 ──
  const rawMood = rawUnit.mood;
  if (typeof rawMood === 'string' && rawMood.trim()) {
    const allowedMoods = RULES.parsing.mood_map.map(m => m.value);
    if (!allowedMoods.includes(rawMood)) {
      violations.push({
        field: 'mood',
        llmValue: rawMood,
        allowedSet: allowedMoods.join('、'),
        severity: 'warning',
        action: `LLM 输出了非标准心情值"${rawMood}"，结果已保留但建议确认`,
      });
    }
  }

  // ── 3. body_state 受控词汇校验 ──
  const rawBodyState = rawUnit.body_state;
  if (typeof rawBodyState === 'string' && rawBodyState.trim()) {
    const allowedBodyStates = RULES.parsing.body_state_map.map(m => m.value);
    if (!allowedBodyStates.includes(rawBodyState)) {
      violations.push({
        field: 'body_state',
        llmValue: rawBodyState,
        allowedSet: allowedBodyStates.join('、'),
        severity: 'warning',
        action: `LLM 输出了非标准身体状态"${rawBodyState}"，结果已保留但建议确认`,
      });
    }
  }

  // ── 4. energy 受控词汇校验 ──
  const rawEnergy = rawUnit.energy;
  if (typeof rawEnergy === 'string' && rawEnergy.trim()) {
    const allowedEnergies = RULES.parsing.energy_map.map(m => m.value);
    if (!allowedEnergies.includes(rawEnergy)) {
      violations.push({
        field: 'energy',
        llmValue: rawEnergy,
        allowedSet: allowedEnergies.join('、'),
        severity: 'warning',
        action: `LLM 输出了非标准精力值"${rawEnergy}"，结果已保留但建议确认`,
      });
    }
  }

  return violations;
}

// ================================================================
// 对外接口
// ================================================================

export interface ParseSemanticResult {
  parsed: ParsedResult;
  /** 每个 unit 对应的 type_hint */
  type_hints: string[];
  /** 每个 unit 的 LLM thinking（推理过程），未提供时为空字符串 */
  thinking: string[];
  /** 规则中心校验违规记录（空数组表示完全合规） */
  violations: RuleViolation[];
  /** 是否存在任何 error 级别的违规（标记为降级） */
  degraded: boolean;
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
  genBehaviorId('B-001'); // parseSemantic 入口追踪
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
    genDecisionId('AI_FALLBACK');
    throw new Error(`LLM 返回的内容不是有效 JSON: ${content.slice(0, 200)}`);
  }

  genDecisionId('PARSE');

  const isCompound = rawJson.is_compound === true;
  const rawUnits = Array.isArray(rawJson.units) ? rawJson.units : [rawJson];
  const confidence = typeof rawJson.confidence === 'number' ? rawJson.confidence : 0.5;

  const units: ParsedSemantic[] = [];
  const typeHints: string[] = [];
  const thinking: string[] = [];
  const violations: RuleViolation[] = [];

  for (const rawUnit of rawUnits) {
    // 4.1: 在 validateAndFixSemantic 前提取 thinking，防止丢失
    const rawThinking = (rawUnit as Record<string, unknown>).thinking;
    thinking.push(typeof rawThinking === 'string' ? rawThinking : '');

    const fixed = validateAndFixSemantic(rawUnit as Record<string, unknown>, confidence);
    const { type_hint, ...semantic } = fixed;
    units.push(semantic);
    typeHints.push(type_hint || '发生');

    // 4.4: LLM 输出 vs 规则中心约束对比校验
    const unitViolations = validateAgainstRules(rawUnit as Record<string, unknown>, type_hint);
    for (const v of unitViolations) {
      violations.push(v);
      genDecisionId('LLM_RULE_VIOLATION');
    }

    // 5.4: 分类原因日志 — 记录 LLM 为什么判定此 type_hint
    logClassification(undefined, units.length - 1, type_hint || '发生',
      thinking[thinking.length - 1]?.slice(0, 200) || '(无 thinking)');
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

  const hasErrors = violations.some(v => v.severity === 'error');

  return {
    parsed: {
      is_compound: isCompound,
      units,
      relations,
      confidence: hasErrors ? Math.max(confidence - 0.15, 0.1) : confidence,
    },
    type_hints: typeHints,
    thinking,
    violations,
    degraded: hasErrors,
  };
}
