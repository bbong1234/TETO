/**
 * parse-goal.ts
 * DeepSeek LLM 目标解析引擎
 * 将用户输入的中文自然语言目标解析为结构化规则
 * 支持模糊检测、规则分类、参数提取
 */

import type { ParsedGoal, ParsedGoalSuggestion } from '@/types/teto';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('ai-parse-goal');

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ================================================================
// System Prompt — 目标解析
// ================================================================

const SYSTEM_PROMPT = `你是 TETO 个人效率系统的目标解析引擎。
你的任务是将用户输入的中文自然语言目标解析为结构化规则。

## 核心原则
- 事项可以模糊，但目标必须具体可衡量
- 模糊目标（如"英语变好"）不能作为正式目标，需要具体化建议
- 清晰目标必须有量化指标和时间约束

## 解析步骤

### Step 1：模糊检测
判断目标是否具体可衡量。以下情况视为模糊：
- 无量化指标："英语变好""身体更健康""情绪更稳定""生活更规律"
- 有方向但无数值："多读书""少刷手机""早点起床"
- 仅有动作无目标值："背单词""运动""写作"

以下情况视为清晰：
- 有量化 + 有周期："每天背30个单词""每周运动3次"
- 有量化 + 有截止日："6月前背完10000个单词""年底前读完20本书"
- 有限制 + 有量化："每天刷抖音不超过30分钟""本周喝酒不超过2次"
- 有完成判定："通过四级""完成项目上线"

### Step 2：规则分类
将清晰目标归类为三种底层规则之一：

1. **一次性完成**（rule_type="一次性完成"）
   - 在某个时间前累计完成什么
   - 或达成某个结果（是/否型）
   - 例子："6月前背完10000个单词""通过四级""年底前读完20本书"

2. **周期性达成**（rule_type="周期性达成"）
   - 每天/每周/每月，至少要完成多少
   - 例子："每天背30个单词""每周运动3次""每月读2本书"

3. **周期性限制**（rule_type="周期性限制"）
   - 每天/每周/每月，不能超过多少，或不能晚于某个边界
   - 例子："每天刷抖音不超过30分钟""本周喝酒不超过2次""每天起床不得晚于8点"

### Step 3：参数提取
从自然语言中提取：
- **metric_name**：指标名称（如"背单词""刷抖音时长""喝酒次数"）
- **target_min**：达成目标值/下限（周期性达成和一次性完成用）
- **target_max**：限制上限（周期性限制用）
- **unit**：计量单位（如"个""次""分钟""本""小时"）
- **period**：周期，取值为"无/每天/每周/每月/每年/本周/本月"
- **operator**：比较操作符
  - 周期性达成 → ">="
  - 周期性限制 → "<="
  - 一次性完成（量化）→ ">="
  - 一次性完成（是/否）→ "complete"
- **deadline**：截止日期（ISO格式 YYYY-MM-DD，如能推断的话）

### Step 4：建议生成（仅模糊时）
对模糊目标，生成 3-5 个具体化建议。每个建议都是完整的结构化规则。
建议应覆盖不同 rule_type，提供合理的目标值。

## 输出格式
严格返回以下 JSON（不要返回其他文字）：

### 清晰目标示例
\`\`\`json
{
  "is_fuzzy": false,
  "fuzzy_reason": null,
  "suggestions": [],
  "parsed": {
    "goal_text": "每天背30个单词",
    "rule_type": "周期性达成",
    "operator": ">=",
    "period": "每天",
    "target_min": 30,
    "target_max": null,
    "metric_name": "背单词",
    "unit": "个",
    "deadline": null
  },
  "suggested_item_name": null,
  "confidence": 0.95
}
\`\`\`

### 模糊目标示例
\`\`\`json
{
  "is_fuzzy": true,
  "fuzzy_reason": "没有具体量化指标，无法判断是否完成",
  "suggestions": [
    {
      "goal_text": "每天背30个单词",
      "rule_type": "周期性达成",
      "operator": ">=",
      "period": "每天",
      "target_min": 30,
      "target_max": null,
      "metric_name": "背单词",
      "unit": "个",
      "deadline": null
    },
    {
      "goal_text": "6月前背完5000个单词",
      "rule_type": "一次性完成",
      "operator": ">=",
      "period": "无",
      "target_min": 5000,
      "target_max": null,
      "metric_name": "单词",
      "unit": "个",
      "deadline": "2026-06-30"
    }
  ],
  "parsed": null,
  "suggested_item_name": "英语",
  "confidence": 0.3
}
\`\`\`

## 重要规则
1. period 取值必须是：无/每天/每周/每月/每年/本周/本月
2. rule_type 取值必须是：一次性完成/周期性达成/周期性限制
3. operator 取值必须是：>=/<=/=/between/before/after/complete
4. deadline 格式必须是 YYYY-MM-DD
5. confidence 范围 0~1，低于 0.5 建议视为模糊
6. 模糊时 parsed 必须为 null，suggestions 至少 2 个
7. 清晰时 suggestions 必须为空数组，parsed 必须有值`;

// ================================================================
// 导出函数
// ================================================================

interface ParseGoalContext {
  item_title?: string;
  item_description?: string;
  sub_items?: { title: string }[];
  existing_metrics?: { metric_name: string; unit: string }[];
  existing_goals?: { goal_text: string; rule_type: string }[];
}

/**
 * 将自然语言目标解析为结构化规则
 * @param goalText 用户输入的目标句
 * @param context 事项上下文信息（用于增强解析精度）
 * @returns ParsedGoal 解析结果
 */
export async function parseGoal(
  goalText: string,
  context?: ParseGoalContext
): Promise<ParsedGoal> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置，无法使用 AI 目标解析');
  }

  // 构建用户消息，附带上下文
  let userMessage = `请解析以下目标：\n"${goalText}"`;

  if (context) {
    const contextParts: string[] = [];
    if (context.item_title) {
      contextParts.push(`当前事项：${context.item_title}`);
    }
    if (context.item_description) {
      contextParts.push(`事项说明：${context.item_description}`);
    }
    if (context.sub_items && context.sub_items.length > 0) {
      contextParts.push(`子项列表：${context.sub_items.map(s => s.title).join('、')}`);
    }
    if (context.existing_metrics && context.existing_metrics.length > 0) {
      contextParts.push(`已有指标：${context.existing_metrics.map(m => `${m.metric_name}(${m.unit})`).join('、')}`);
    }
    if (context.existing_goals && context.existing_goals.length > 0) {
      contextParts.push(`已有目标：${context.existing_goals.map(g => g.goal_text).join('、')}`);
    }
    if (contextParts.length > 0) {
      userMessage += `\n\n参考上下文：\n${contextParts.join('\n')}`;
    }
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 调用失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('DeepSeek API 返回空内容');
    }

    // 提取 JSON
    const parsed = extractJSON(content);
    return validateAndNormalize(parsed);
  } catch (error: any) {
    log.error('目标解析失败', { details: { error: String(error) } });
    throw new Error(`目标解析失败: ${error.message}`);
  }
}

// ================================================================
// 辅助函数
// ================================================================

/** 从 LLM 输出中提取 JSON */
function extractJSON(text: string): any {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 尝试从 markdown 代码块中提取
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1]);
    }

    // 尝试找到第一个 { 到最后一个 }
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(text.substring(startIdx, endIdx + 1));
    }

    throw new Error('无法从 AI 输出中提取 JSON');
  }
}

/** 验证并标准化解析结果 */
function validateAndNormalize(data: any): ParsedGoal {
  const validRuleTypes = ['一次性完成', '周期性达成', '周期性限制'];
  const validOperators = ['>=', '<=', '=', 'between', 'before', 'after', 'complete'];
  const validPeriods = ['无', '每天', '每周', '每月', '每年', '本周', '本月'];

  // 标准化 suggestions
  const suggestions: ParsedGoalSuggestion[] = (data.suggestions || []).map((s: any) => ({
    goal_text: String(s.goal_text || ''),
    rule_type: validRuleTypes.includes(s.rule_type) ? s.rule_type : '一次性完成',
    operator: validOperators.includes(s.operator) ? s.operator : '>=',
    period: validPeriods.includes(s.period) ? s.period : null,
    target_min: s.target_min != null ? Number(s.target_min) : null,
    target_max: s.target_max != null ? Number(s.target_max) : null,
    metric_name: s.metric_name || null,
    unit: s.unit || null,
    deadline: s.deadline || null,
  }));

  // 标准化 parsed
  let parsed: ParsedGoalSuggestion | null = null;
  if (data.parsed) {
    parsed = {
      goal_text: String(data.parsed.goal_text || ''),
      rule_type: validRuleTypes.includes(data.parsed.rule_type) ? data.parsed.rule_type : '一次性完成',
      operator: validOperators.includes(data.parsed.operator) ? data.parsed.operator : '>=',
      period: validPeriods.includes(data.parsed.period) ? data.parsed.period : null,
      target_min: data.parsed.target_min != null ? Number(data.parsed.target_min) : null,
      target_max: data.parsed.target_max != null ? Number(data.parsed.target_max) : null,
      metric_name: data.parsed.metric_name || null,
      unit: data.parsed.unit || null,
      deadline: data.parsed.deadline || null,
    };
  }

  return {
    is_fuzzy: Boolean(data.is_fuzzy),
    fuzzy_reason: data.fuzzy_reason || null,
    suggestions,
    parsed,
    suggested_item_name: data.suggested_item_name || null,
    confidence: Number(data.confidence) || 0.5,
  };
}
