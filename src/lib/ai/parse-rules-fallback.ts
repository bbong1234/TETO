/**
 * parse-rules-fallback.ts
 * 1.5 规则兜底层：当 AI 解析不可用时提供本地基础解析能力
 *
 * 核心原则：
 * 1. AI 不可用时，系统可以变笨，但不能瘫
 * 2. 手动录入不断
 * 3. 基础字段可手动填写
 * 4. 简单时间识别仍可用
 * 5. 事项允许用户手选
 * 6. 已学习的本地归类规则仍尽量生效
 *
 * 降级后最低可用标准：
 * - 手动录入不断
 * - 基础字段可手动填写
 * - 简单时间识别仍可用
 * - 不复杂的复合句不自动拆，整条录入
 * - 事项允许用户手选
 */

import type { ParsedSemantic, ParsedResult, TimeAnchor } from '@/types/semantic';

/** 用户规则简易类型（用于降级模式匹配） */
export interface SimpleUserRule {
  trigger_pattern: string;
  target_id: string | null;
  target_type: 'item' | 'sub_item' | null;
  rule_type: string;
}

// ================================
// 降级模式结果类型
// ================================

export interface FallbackResult {
  /** 是否处于降级模式 */
  is_fallback: true;
  /** 降级原因 */
  fallback_reason: 'ai_timeout' | 'ai_error' | 'ai_unavailable' | 'api_key_missing';
  /** 本地基础解析结果（比 AI 解析简单得多） */
  parsed: ParsedResult;
  /** type_hint 列表（每个 unit 一个） */
  type_hints: string[];
}

// ================================
// 基础时间锚点解析
// ================================

const TIME_ANCHOR_MAP: Array<{ keywords: string[]; offsetDays: number; direction: 'past' | 'present' | 'future' }> = [
  { keywords: ['前天'], offsetDays: -2, direction: 'past' },
  { keywords: ['昨天', '昨日'], offsetDays: -1, direction: 'past' },
  { keywords: ['今天', '今日', '当天'], offsetDays: 0, direction: 'present' },
  { keywords: ['明天', '明日'], offsetDays: 1, direction: 'future' },
  { keywords: ['后天'], offsetDays: 2, direction: 'future' },
  { keywords: ['大后天'], offsetDays: 3, direction: 'future' },
  { keywords: ['上周', '上礼拜'], offsetDays: -7, direction: 'past' },
  { keywords: ['下周', '下礼拜'], offsetDays: 7, direction: 'future' },
  { keywords: ['上个月'], offsetDays: -30, direction: 'past' },
  { keywords: ['下个月'], offsetDays: 30, direction: 'future' },
];

function resolveDate(baseDate: string, offsetDays: number): string {
  const base = new Date(baseDate + 'T00:00:00');
  base.setDate(base.getDate() + offsetDays);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeAnchor(input: string, baseDate: string): TimeAnchor | null {
  const lower = input.toLowerCase();

  // 1. 关键词匹配
  for (const { keywords, offsetDays, direction } of TIME_ANCHOR_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return {
          raw: kw,
          resolved_date: resolveDate(baseDate, offsetDays),
          direction,
        };
      }
    }
  }

  // 2. "X月Y号/日" 格式
  const dateMatch = input.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    const base = new Date(baseDate + 'T00:00:00');
    const target = new Date(base.getFullYear(), month - 1, day);
    if (target.getMonth() < base.getMonth() - 5) {
      target.setFullYear(target.getFullYear() + 1);
    }
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    const resolved = `${y}-${m}-${d}`;
    return {
      raw: dateMatch[0],
      resolved_date: resolved,
      direction: resolved < baseDate ? 'past' : resolved > baseDate ? 'future' : 'present',
    };
  }

  return null;
}

// ================================
// 基础量化字段解析
// ================================

function parseBasicMetric(input: string): ParsedSemantic['metric'] {
  // "N个单词" / "N个" / "N次" / "N公里" 等
  const metricPatterns: Array<{ pattern: RegExp; unit: string; name?: string }> = [
    { pattern: /(\d+(?:\.\d+)?)\s*(?:单词|词)/, unit: '个', name: '单词' },
    { pattern: /(\d+(?:\.\d+)?)\s*公里/, unit: '公里', name: '距离' },
    { pattern: /(\d+(?:\.\d+)?)\s*km\b/i, unit: '公里', name: '距离' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:道题|道|题)/, unit: '道', name: '题目' },
    { pattern: /(\d+(?:\.\d+)?)\s*页/, unit: '页', name: '页' },
    { pattern: /(\d+(?:\.\d+)?)\s*次/, unit: '次' },
    { pattern: /(\d+(?:\.\d+)?)\s*个/, unit: '个' },
    { pattern: /(\d+(?:\.\d+)?)\s*遍/, unit: '遍' },
    { pattern: /(\d+(?:\.\d+)?)\s*篇/, unit: '篇' },
    { pattern: /(\d+(?:\.\d+)?)\s*章/, unit: '章' },
    { pattern: /(\d+(?:\.\d+)?)\s*节/, unit: '节' },
  ];

  for (const { pattern, unit, name } of metricPatterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit,
        name: name || '',
      };
    }
  }
  return null;
}

function parseBasicCost(input: string): number | null {
  const patterns = [
    /[¥￥]\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:元|块|块钱)/,
    /(?:花了|花费|消费|付了|付款|支付)\s*(\d+(?:\.\d+)?)(?![\d分钟小时半])/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function parseBasicDuration(input: string): number | null {
  const cnNumMap: Record<string, number> = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const parseCnNum = (s: string): number => cnNumMap[s] ?? 1;

  const patterns: Array<{ pattern: RegExp; calc: (m: RegExpMatchArray) => number }> = [
    { pattern: /(\d+(?:\.\d+)?)\s*分钟/, calc: m => Math.round(parseFloat(m[1])) },
    { pattern: /(\d+(?:\.\d+)?)\s*小时/, calc: m => Math.round(parseFloat(m[1]) * 60) },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:hr|hrs|h)\b/i, calc: m => Math.round(parseFloat(m[1]) * 60) },
    { pattern: /([一二两三四五六七八九十\d]+)个半小时/, calc: m => parseCnNum(m[1]) * 60 + 30 },
    { pattern: /([一二两三四五六七八九十\d]+)个?小时/, calc: m => parseCnNum(m[1]) * 60 },
    { pattern: /半小时/, calc: () => 30 },
  ];

  for (const { pattern, calc } of patterns) {
    const match = input.match(pattern);
    if (match) return calc(match);
  }
  return null;
}

// ================================
// 基础类型推断
// ================================

function inferType(input: string): string {
  const lower = input.toLowerCase();

  // 计划型关键词
  const planKeywords = ['明天', '后天', '下周', '打算', '准备', '计划', '要', '将会', '预定'];
  for (const kw of planKeywords) {
    if (lower.includes(kw)) return '计划';
  }

  // 想法型关键词
  const ideaKeywords = ['想到', '觉得', '感觉', '突然觉得', '灵光', '忽然', '也许', '可能', '或许', '要不要'];
  for (const kw of ideaKeywords) {
    if (lower.includes(kw)) return '想法';
  }

  // 总结型关键词
  const summaryKeywords = ['总结', '回顾', '总的来说', '总体', '整个', '这段时间', '复盘', '归纳'];
  for (const kw of summaryKeywords) {
    if (lower.includes(kw)) return '总结';
  }

  // 默认：发生
  return '发生';
}

// ================================
// 基础事项关键词匹配
// ================================

function matchItemHint(
  input: string,
  items: Array<{ id: string; title: string }>
): { item_hint: string; matched_item_id?: string } | null {
  const lower = input.toLowerCase();

  // 精确匹配 → 包含匹配 → 被包含匹配
  for (const item of items) {
    if (lower.includes(item.title.toLowerCase())) {
      return { item_hint: item.title, matched_item_id: item.id };
    }
  }

  // 子串匹配：事项名包含在输入中
  for (const item of items) {
    if (item.title.length >= 2 && lower.includes(item.title.toLowerCase().slice(0, 2))) {
      return { item_hint: item.title, matched_item_id: item.id };
    }
  }

  return null;
}

// ================================
// 基础情绪/能量推断
// ================================

function inferMood(input: string): string | null {
  const moodMap: Record<string, string[]> = {
    '开心': ['开心', '高兴', '快乐', '愉快', '爽', '太好了'],
    '烦躁': ['烦躁', '烦', '郁闷', '不爽', '抓狂'],
    '焦虑': ['焦虑', '紧张', '担心', '不安', '慌'],
    '疲惫': ['累', '疲惫', '困', '没精神', '乏力', '精疲力竭'],
    '平静': ['平静', '淡定', '还好', '一般'],
  };

  for (const [mood, keywords] of Object.entries(moodMap)) {
    for (const kw of keywords) {
      if (input.includes(kw)) return mood;
    }
  }
  return null;
}

function inferEnergy(input: string): string | null {
  const energyMap: Record<string, string[]> = {
    '精力充沛': ['精力充沛', '精力旺盛', '很有精神', '状态好', '能量满满'],
    '一般': ['一般', '还行', '凑合'],
    '低': ['低落', '没劲', '疲惫', '累', '困', '没精神'],
  };

  for (const [energy, keywords] of Object.entries(energyMap)) {
    for (const kw of keywords) {
      if (input.includes(kw)) return energy;
    }
  }
  return null;
}

// ================================
// 核心兜底解析函数
// ================================

/**
 * 本地规则兜底解析
 * 当 AI 不可用时，提供基础的本地解析能力
 *
 * @param input 用户输入文本
 * @param baseDate 当前日期 (YYYY-MM-DD)
 * @param items 用户事项列表（用于关键词匹配）
 * @param reason 降级原因
 * @returns FallbackResult
 */
export function parseWithFallback(
  input: string,
  baseDate: string,
  items: Array<{ id: string; title: string }> = [],
  reason: FallbackResult['fallback_reason'] = 'ai_unavailable',
  userRules: SimpleUserRule[] = []
): FallbackResult {
  const trimmed = input.trim();
  const timeAnchor = parseTimeAnchor(trimmed, baseDate);
  const metric = parseBasicMetric(trimmed);
  const cost = parseBasicCost(trimmed);
  const durationMinutes = parseBasicDuration(trimmed);
  const typeHint = inferType(trimmed);
  const itemMatch = matchItemHint(trimmed, items);

  // 优先使用用户规则匹配事项（降级模式下仍生效的已学习偏好）
  let ruleItemHint: { item_hint: string; matched_item_id?: string } | null = null;
  for (const rule of userRules) {
    if (rule.rule_type === 'item_mapping' && rule.target_type === 'item' && rule.target_id) {
      // trigger_pattern 匹配输入中的关键词
      if (trimmed.includes(rule.trigger_pattern)) {
        const matchedItem = items.find(i => i.id === rule.target_id);
        if (matchedItem) {
          ruleItemHint = { item_hint: matchedItem.title, matched_item_id: matchedItem.id };
          break;
        }
      }
    }
  }
  const effectiveItemMatch = ruleItemHint || itemMatch;

  // 用户规则匹配子项
  let ruleSubItemHint: string | null = null;
  for (const rule of userRules) {
    if (rule.rule_type === 'sub_item_mapping' && rule.target_type === 'sub_item') {
      if (trimmed.includes(rule.trigger_pattern)) {
        ruleSubItemHint = rule.trigger_pattern; // 使用触发模式作为提示
        break;
      }
    }
  }
  const mood = inferMood(trimmed);
  const energy = inferEnergy(trimmed);

  // 提取基础 action（取第一个动词短语，简陋但可用）
  const actionMatch = trimmed.match(/^[\s]*([^\s,，。、]+?[了着过])/);
  const action = actionMatch ? actionMatch[1] : '';

  // 构建语义单元（不拆分复合句，整条录入）
  const unit: ParsedSemantic = {
    subject: null,
    action,
    object: null,
    time_anchor: timeAnchor,
    location: null,
    people: [],
    mood,
    energy,
    manner: null,
    cost,
    duration_minutes: durationMinutes,
    metric,
    record_link_hint: null,
    item_hint: effectiveItemMatch?.item_hint ?? null,
    sub_item_hint: ruleSubItemHint,
    shared_context: null,
    field_confidence: {
      // 降级模式下所有字段都是 guess
      ...(mood ? { mood: 'guess' as const } : {}),
      ...(energy ? { energy: 'guess' as const } : {}),
      ...(itemMatch ? { item_hint: 'guess' as const } : {}),
    },
    confidence: 0.3, // 降级模式统一低置信度
  };

  return {
    is_fallback: true,
    fallback_reason: reason,
    parsed: {
      is_compound: false, // 降级模式不拆分复合句
      units: [unit],
      relations: [],
      confidence: 0.3,
    },
    type_hints: [typeHint],
  };
}

// ================================
// 降级判断辅助
// ================================

/**
 * 判断是否应该进入降级模式
 * @param error AI 调用抛出的错误
 * @returns 降级原因，null 表示不需要降级
 */
export function shouldFallback(error: unknown): FallbackResult['fallback_reason'] | null {
  if (!error) return null;

  const message = error instanceof Error ? error.message : String(error);

  // API Key 未配置
  if (message.includes('DEEPSEEK_API_KEY') || message.includes('API_KEY 未配置')) {
    return 'api_key_missing';
  }

  // API 超时
  if (message.includes('timeout') || message.includes('超时') || message.includes('ETIMEDOUT')) {
    return 'ai_timeout';
  }

  // API 错误（4xx/5xx）
  if (message.includes('DeepSeek API 错误') || message.includes('API 错误')) {
    return 'ai_error';
  }

  // 网络不可用
  if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED')) {
    return 'ai_unavailable';
  }

  // 默认：AI 出错就降级
  return 'ai_error';
}

/**
 * 获取降级模式的用户提示文本
 */
export function getFallbackMessage(reason: FallbackResult['fallback_reason']): string {
  const messages: Record<FallbackResult['fallback_reason'], string> = {
    ai_timeout: '智能解析响应超时，已切换基础模式',
    ai_error: '智能解析暂时不可用，已切换基础模式',
    ai_unavailable: '智能解析服务暂不可用，已切换基础模式',
    api_key_missing: 'AI 解析未配置，当前为基础模式',
  };
  return messages[reason];
}
