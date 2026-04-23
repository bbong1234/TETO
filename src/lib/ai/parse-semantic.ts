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
      "type_hint": "发生",
      "field_confidence": {}
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
- record_link_hint: 如果你判断当前输入与「近期记忆」中的某条记录有语义关联，返回对象 {"target_id":"xxx","link_type":"related_to","reason":"简短理由"};
  link_type 可选值: completes(完成计划), related_to(相关事件), derived_from(派生);
  如果无关联则返回 null。关联判断不需要关键词完全匹配，而是基于语义理解（如"这顿饭花了500"关联到"和王总在海底捞谈事"）
- item_hint: 推测关联的事项/项目名称。如果有「事项列表」上下文，请优先从列表中选择匹配的事项名称（完全一致）。如果列表中没有合适的，再自行推测。
- type_hint: 推断记录类型，取值 "发生"|"计划"|"想法"|"总结"
  - 已完成的事用"发生"
  - 将来打算做的用"计划"
  - 感想/灵感用"想法"
  - 回顾/总结性质用"总结"

## field_confidence（置信度分级）
对以下字段，你必须在 field_confidence 中标注是 "certain" 还是 "guess"：
- mood、energy、item_hint、record_link_hint、type_hint、location、people

规则：
- "certain" = 文本中有明确词汇证据（如"开心"→mood:开心 是 certain）
- "guess" = 你通过语境、语气推测得出（如从"又加班到凌晨"推断 energy:累 是 guess）
- 只有你填写了的非 null 字段才需要标注，未填写的不要加入 field_confidence

## 复合句处理（强制拆分）
如果输入包含多个独立事件（不同时空、不同动作、不同属性），必须设 is_compound=true，units 数组放多个对象。
每个 unit 都应独立设置 type_hint（可能一个是“发生”、另一个是“计划”或“想法”）。
每个 unit 也应独立判断 record_link_hint。
例如：“上午开会，下午去医院” → 拆分为 2 个 units。
“今天吃了火锅，明天要去跑步，突然想到一个好主意” → 3 个 units，分别是发生/计划/想法。
relations 描述单元间关系：[{"from":0,"to":1,"type":"sequence|contrast|cause|parallel"}]

## 注意事项
- 只返回 JSON，不要加 markdown 代码块标记
- 所有字段如果识别不出就填 null 或空数组
- confidence 表示你对解析结果的置信度（0~1）
- 关于 record_link_hint: 只有当「近期记忆」上下文被提供时才能返回 target_id 对象；如果没有近期记忆上下文，可以返回关键词字符串供后端搜索
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

function validateAndFixSemantic(raw: Record<string, unknown>): ParsedSemantic & { type_hint?: string } {
  return {
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    action: typeof raw.action === 'string' ? raw.action : '未知',
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
      ? {
          value: (raw.metric as Record<string, unknown>).value as number || 0,
          unit: (raw.metric as Record<string, unknown>).unit as string || '',
          name: (raw.metric as Record<string, unknown>).name as string || '',
        }
      : null,
    record_link_hint: raw.record_link_hint && typeof raw.record_link_hint === 'object'
      ? {
          target_id: (raw.record_link_hint as Record<string, unknown>).target_id as string || '',
          link_type: (raw.record_link_hint as Record<string, unknown>).link_type as string || 'related_to',
          reason: (raw.record_link_hint as Record<string, unknown>).reason as string || '',
        } as RecordLinkHint
      : typeof raw.record_link_hint === 'string' ? raw.record_link_hint : null,
    item_hint: typeof raw.item_hint === 'string' ? raw.item_hint : null,
    field_confidence: raw.field_confidence && typeof raw.field_confidence === 'object'
      ? Object.fromEntries(
          Object.entries(raw.field_confidence as Record<string, unknown>)
            .filter(([, v]) => v === 'certain' || v === 'guess')
            .map(([k, v]) => [k, v as 'certain' | 'guess'])
        )
      : undefined,
    type_hint: typeof raw.type_hint === 'string' ? raw.type_hint : undefined,
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
  items?: Array<{ id: string; title: string }>
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
    const fixed = validateAndFixSemantic(rawUnit as Record<string, unknown>);
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

  return {
    parsed: {
      is_compound: isCompound,
      units,
      relations,
      confidence,
    },
    type_hints: typeHints,
  };
}
