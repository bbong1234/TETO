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
import { RULES } from '@/lib/rules';

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

const TIME_ANCHOR_MAP = RULES.parsing.time_anchor_map;

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
  for (const { pattern, unit, name } of RULES.parsing.metric_patterns) {
    const match = input.match(new RegExp(pattern));
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
  for (const { pattern } of RULES.parsing.cost_patterns) {
    const match = input.match(new RegExp(pattern));
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function parseBasicDuration(input: string): number | null {
  const cnNumMap: Record<string, number> = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const parseCnNum = (s: string): number => cnNumMap[s] ?? 1;

  for (const { pattern } of RULES.parsing.duration_patterns) {
    const match = input.match(new RegExp(pattern));
    if (match) {
      // 识别时长值
      const val = parseFloat(match[1] || '0');
      // 中文数字转换（如果匹配到的是中文）
      const isCn = /[一二两三四五六七八九十]/.test(match[1] || '');
      const numVal = isCn ? parseCnNum(match[1]) : val;
      // 单位判断：分钟直接返回，小时转换
      if (pattern.includes('小时') || pattern.includes('hr') || pattern.includes('h\\b')) {
        return Math.round(numVal * 60);
      }
      return Math.round(numVal);
    }
  }
  return null;
}

// ================================
// 基础类型推断
// ================================

function inferType(input: string): string {
  const lower = input.toLowerCase();

  // 计划型关键词
  for (const kw of RULES.parsing.type_keywords.plan) {
    if (lower.includes(kw)) return '计划';
  }

  // 想法型关键词
  for (const kw of RULES.parsing.type_keywords.idea) {
    if (lower.includes(kw)) return '想法';
  }

  // 总结型关键词
  for (const kw of RULES.parsing.type_keywords.summary) {
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

  // 精确匹配：完整事项名出现在输入中
  for (const item of items) {
    if (lower.includes(item.title.toLowerCase())) {
      return { item_hint: item.title, matched_item_id: item.id };
    }
  }

  // 不再做前2字子串匹配（误匹配率太高），直接返回 null
  return null;
}

// ================================
// 基础情绪/能量推断
// ================================

function inferMood(input: string): string | null {
  for (const { keywords, value } of RULES.parsing.mood_map) {
    for (const kw of keywords) {
      if (input.includes(kw)) return value;
    }
  }
  return null;
}

function inferBodyState(input: string): string | null {
  for (const { keywords, value } of RULES.parsing.body_state_map) {
    for (const kw of keywords) {
      if (input.includes(kw)) return value;
    }
  }
  return null;
}

function inferEnergy(input: string, bodyState: string | null): string | null {
  // "累"优先归 body_state，energy 只记精力高低层级
  for (const { keywords, value } of RULES.parsing.energy_map) {
    for (const kw of keywords) {
      if (input.includes(kw)) return value;
    }
  }

  // 如果 body_state 是低能量类（累/困/没精神），且没有更精确的 energy 词汇，映射为"低"
  if (bodyState && RULES.parsing.low_energy_body_states.includes(bodyState)) return '低';

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
  const bodyState = inferBodyState(trimmed);
  const energy = inferEnergy(trimmed, bodyState);

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
      ...(bodyState ? { body_state: 'guess' as const } : {}),
    },
    confidence: RULES.fallback.fallback_confidence, // 降级模式统一低置信度
    // === 1.5 录入结构对齐新增 ===
    main_text: trimmed.slice(0, 30),  // 降级模式：截取前30字作为主内容
    result_text: null,
    place_text: null,
    state: null,
    body_state: bodyState,
    money_amount: cost,
    money_currency: cost != null && cost > 0 ? 'CNY' : null,
    // === 三层九组 Phase 1 新增（降级模式仅填基本值） ===
    action_text: action || null,
    event_text: null,
    object_text: null,
    outcome_type: null,
    outcome_direction: null,
    cause_text: null,
    time_text: timeAnchor?.raw || null,
    time_precision: null,
    place_type: null,
    money_direction: cost != null && cost > 0 ? 'expense' as const : null,
    relation_roles: null,
  };

  return {
    is_fallback: true,
    fallback_reason: reason,
    parsed: {
      is_compound: false, // 降级模式不拆分复合句
      units: [unit],
      relations: [],
      confidence: RULES.fallback.fallback_confidence,
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
  return RULES.fallback.fallback_messages[reason];
}
