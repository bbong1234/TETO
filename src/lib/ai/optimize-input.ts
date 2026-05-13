/**
 * optimize-input.ts
 * 优化输入引擎 — 在 AI 语义解析之前，将模糊输入预处理为清晰的行格式
 *
 * 模糊输入三分法（TETO 1.5）：
 *   A类：无法理解（表达太碎、缺主语缺动作）
 *   B类：可理解但信息不足（缺关键信息）
 *   C类：结构不合理（内容太多/时间冲突/计划结果混杂）
 */

import type { OptimizeInputResult, OptimizedLine, OptimizeIssue, FuzzyType, RiskLevel } from '@/types/semantic';

// ================================================================
// System Prompt
// ================================================================

const OPTIMIZE_SYSTEM_PROMPT = `你是 TETO 个人效率系统的输入优化引擎。
你的任务是将用户输入的模糊/混乱的自然语言，转换为清晰、一行一条的记录格式。

## 模糊输入三分法

### A类：无法理解
- 表达太碎（如"那个"、"一下"）
- 缺主语缺动作（如"了"、"好"）
- 拼音/乱码/纯符号
处理：标记为A类，要求用户澄清或重新表述

### B类：可理解但信息不足
- 缺时间（如"跑步了"→什么时候？）
- 缺关键对象（如"学了"→学了什么？）
- 缺数量（如"背了单词"→背了多少个？）
处理：标记为B类，允许低精度落地，但标注缺失字段

### C类：结构不合理
- 内容太多，多件事混杂在一句中
- 时间冲突（如"早上开会"和"凌晨开会"在同一句）
- 计划和结果混杂（如"打算跑步结果睡了"）
处理：标记为C类，拆分为多行清晰的记录

## 工作步骤

第1步：判断输入是否模糊
- 如果输入已经清晰完整，fuzzy_type 返回 null，optimized_lines 直接返回整理后的文本
- 如果输入模糊，判断属于 A/B/C 哪一类

第2步：将输入整理为清晰的行格式
- 每行一条独立的记录
- 复合句必须拆开（不同动作、不同事项、不同时间段 → 不同行）
- 每行应包含：动作 + 对象 + 关键修饰（时间/地点/情绪等）
- 保持原有语义完整性，不添加原文没有的信息
- 缺失的关键信息在 missing_fields 中标注

第3步：检测问题
- 时间冲突：同一句中出现矛盾的时间描述
- 逻辑矛盾：计划和结果混杂、因果不成立
- 信息缺失：缺动作、缺对象、缺时间等关键信息
- 每个问题给出具体的修复建议

第4步：评估风险等级
- low：优化结果确定，用户确认即可
- medium：优化结果有合理推断，需要用户确认
- high：输入过于模糊，必须用户补充信息后才能继续

## 输出格式
严格返回以下 JSON（不要返回其他文字）：
{
  "fuzzy_type": "A" | "B" | "C" | null,
  "risk_level": "low" | "medium" | "high",
  "optimized_lines": [
    {
      "text": "清晰的记录文本",
      "type_hint": "发生" | "计划" | "想法" | "总结",
      "missing_fields": ["时间", "事项"]
    }
  ],
  "issues": [
    {
      "line_index": 0,
      "field": "时间",
      "description": "缺少具体时间",
      "suggestion": "可以补充大致时段，如"早上"、"下午""
    }
  ],
  "summary": "优化摘要：将复合句拆分为3条清晰记录，标注了2个缺失字段"
}

## 关键例子

例1（清晰输入，无需优化）：
输入："下午背了30个单词"
→ fuzzy_type=null, risk_level="low",
  optimized_lines=[{text:"下午背了30个单词", type_hint:"发生", missing_fields:[]}]

例2（B类，信息不足）：
输入："跑步了"
→ fuzzy_type="B", risk_level="medium",
  optimized_lines=[{text:"跑步了", type_hint:"发生", missing_fields:["时间","时长"]}],
  issues=[{line_index:0, field:"时间", description:"没有时间信息", suggestion:"补充\"早上\"\"晚上\"等时段"}],
  summary="输入可理解但缺少时间和时长信息"

例3（C类，结构不合理—复合句）：
输入："早上开会讨论了项目进度，下午又写了2小时代码，晚上跑了3公里"
→ fuzzy_type="C", risk_level="low",
  optimized_lines=[
    {text:"早上开会讨论项目进度", type_hint:"发生", missing_fields:[]},
    {text:"下午写了2小时代码", type_hint:"发生", missing_fields:[]},
    {text:"晚上跑了3公里", type_hint:"发生", missing_fields:[]}
  ],
  summary="复合句拆分为3条独立记录"

例4（A类，无法理解）：
输入："那个一下"
→ fuzzy_type="A", risk_level="high",
  optimized_lines=[{text:"那个一下", type_hint:"发生", missing_fields:["动作","对象"]}],
  issues=[{line_index:0, field:"动作", description:"无法识别具体动作", suggestion:"请重新表述，如\"整理了文件\"\"看了一下邮件\""}],
  summary="输入过于模糊，无法理解具体内容，需要重新表述"

例5（C类，计划结果混杂）：
输入："打算跑步结果在家躺了一天"
→ fuzzy_type="C", risk_level="medium",
  optimized_lines=[
    {text:"计划跑步", type_hint:"计划", missing_fields:["时间"]},
    {text:"在家躺了一天", type_hint:"发生", missing_fields:[]}
  ],
  issues=[{line_index:0, field:"时间", description:"计划时间不确定", suggestion:"补充\"打算早上跑步\"等"}],
  summary="将计划与实际发生拆分为2条记录"

## 注意事项
- 只返回 JSON，不要加 markdown 代码块标记
- optimized_lines 不能为空，至少包含一条
- fuzzy_type 为 null 表示输入已足够清晰，无需额外处理
- 所有文本必须使用中文
- 不要编造原文没有的信息，缺失信息放入 missing_fields
- risk_level 为 high 时，issues 中必须包含至少一条建议`;

// ================================================================
// DeepSeek API 调用（复用 parse-semantic 的格式）
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
      temperature: 0.15,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
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
// 结果校验与修正
// ================================================================

function validateOptimizeResult(raw: Record<string, unknown>): OptimizeInputResult {
  // fuzzy_type
  const fuzzyType = (raw.fuzzy_type === 'A' || raw.fuzzy_type === 'B' || raw.fuzzy_type === 'C')
    ? raw.fuzzy_type as FuzzyType
    : null;

  // risk_level
  const riskLevel = (raw.risk_level === 'low' || raw.risk_level === 'medium' || raw.risk_level === 'high')
    ? raw.risk_level as RiskLevel
    : 'medium';

  // optimized_lines
  const rawLines = Array.isArray(raw.optimized_lines) ? raw.optimized_lines : [];
  const optimizedLines: OptimizedLine[] = rawLines
    .filter((l: unknown): l is Record<string, unknown> => l != null && typeof l === 'object')
    .map((l) => ({
      text: typeof l.text === 'string' ? l.text : '',
      type_hint: (['发生', '计划', '想法', '总结'].includes(l.type_hint as string)
        ? l.type_hint as OptimizedLine['type_hint']
        : '发生'),
      missing_fields: Array.isArray(l.missing_fields)
        ? (l.missing_fields as unknown[]).filter((f: unknown): f is string => typeof f === 'string')
        : [],
    }))
    .filter(l => l.text.length > 0);

  // 如果优化结果为空，用原文兜底
  if (optimizedLines.length === 0) {
    optimizedLines.push({
      text: typeof raw._original_input === 'string' ? raw._original_input : '',
      type_hint: '发生',
      missing_fields: fuzzyType === 'A' ? ['动作', '对象'] : [],
    });
  }

  // issues
  const rawIssues = Array.isArray(raw.issues) ? raw.issues : [];
  const issues: OptimizeIssue[] = rawIssues
    .filter((i: unknown): i is Record<string, unknown> => i != null && typeof i === 'object')
    .map((i) => ({
      line_index: typeof i.line_index === 'number' ? i.line_index : -1,
      field: typeof i.field === 'string' ? i.field : '',
      description: typeof i.description === 'string' ? i.description : '',
      suggestion: typeof i.suggestion === 'string' ? i.suggestion : '',
    }));

  // summary
  const summary = typeof raw.summary === 'string' ? raw.summary : '';

  return {
    fuzzy_type: fuzzyType,
    risk_level: riskLevel,
    optimized_lines: optimizedLines,
    issues,
    summary,
  };
}

// ================================================================
// 对外接口
// ================================================================

/**
 * 调用 DeepSeek 优化模糊输入
 * @param input 用户输入的原始文本
 * @param todayDate 当前日期（ISO string，用于 prompt 上下文）
 * @returns 优化结果
 */
export async function optimizeInput(
  input: string,
  todayDate?: string,
): Promise<OptimizeInputResult> {
  const dateCtx = todayDate || new Date().toISOString().split('T')[0];

  const userMessage = `今天是 ${dateCtx}。请优化以下输入：\n\n${input}`;

  const content = await callDeepSeek([
    { role: 'system', content: OPTIMIZE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(content);
  } catch {
    throw new Error(`LLM 返回的内容不是有效 JSON: ${content.slice(0, 200)}`);
  }

  // 传入原始输入用于兜底
  rawJson._original_input = input;

  return validateOptimizeResult(rawJson);
}
