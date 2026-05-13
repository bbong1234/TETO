/**
 * parseNaturalInput.ts
 * 本地规则解析器：把自然语言输入解析成结构化字段候选值
 * 不接 AI，纯正则 + 关键词匹配
 * 所有识别结果都是"候选值"，不强绑定，用户可修正
 *
 * P2: 时间锚点解析（"明天"→具体日期）
 * P7: 规则兜底层（生成 ParsedSemantic 供离线使用）
 */

import type { ParsedSemantic, TimeAnchor } from '@/types/semantic';
import { RULES } from '@/lib/rules';

export type RecordType = '发生' | '计划' | '想法' | '总结';

export interface ParsedInput {
  /** 识别出的金额（元） */
  cost?: number;
  /** 识别出的时长（分钟） */
  duration?: number;
  /** 识别出的统计数值 */
  metric_value?: number;
  /** 识别出的统计单位 */
  metric_unit?: string;
  /** 识别出的统计对象描述 */
  metric_object?: string;
  /** 身体状态推断 */
  body_state_hint?: string;
  /** 识别出的时间（HH:mm 格式） */
  time_hint?: string;
  /** 时间精度提示（本地规则推断） */
  time_precision_hint?: 'exact' | 'approx' | 'fuzzy' | 'unknown';
  /** 时间段名称（如"早上"、"下午"），仅当 time_precision_hint='fuzzy' 时有值 */
  time_period_label?: string;
  /** 推断的记录类型 */
  type_hint?: RecordType;
  /** 推断的内容主题（简化版，供 content 字段候选） */
  content_hint?: string;
  /** 推荐关联的事项 ID（模糊匹配） */
  suggested_item_id?: string;
  /** 推荐关联的事项名称（展示用） */
  suggested_item_name?: string;
  /** 心情推断 */
  mood_hint?: string;
  /** 能量推断 */
  energy_hint?: string;
  /** 状态推断 */
  status_hint?: string;
  /** P2: 时间锚点 — 解析后的目标日期（ISO date, 如 2026-04-21） */
  date_hint?: string;
  /** P2: 时间锚点对象 */
  time_anchor?: TimeAnchor;
  /** P7: 识别出的地点 */
  location_hint?: string;
  /** P7: 识别出的关系人 */
  people_hint?: string[];
  /** P7: 规则兜底层生成的 ParsedSemantic（离线 fallback） */
  parsed_semantic?: ParsedSemantic;
  /** 检测到的复合句拆分建议 */
  split_suggestion?: {
    parts: Array<{
      text: string;        // 拆分后的子句原文
      type_hint: RecordType; // 该子句推断的类型
      content_hint?: string; // 该子句的主题
    }>;
  };
}

interface MatchableItem {
  id: string;
  title: string;
}

/**
 * 主解析函数
 * @param input 用户输入的原始文字
 * @param items 当前用户的事项列表（用于模糊匹配）
 */
export function parseNaturalInput(input: string, items: MatchableItem[] = []): ParsedInput {
  const result: ParsedInput = {};
  // 统一转小写做匹配（保留原始 input 用于事项匹配）
  const lower = input.toLowerCase();

  // ================================
  // 1. 识别金额
  // ================================
  const costPatterns = [
    /[¥￥]\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:元|块|块钱|钱|rmb|RMB)/i,
    /(?:花了|花费|消费|付了|付款|支付)\s*(\d+(?:\.\d+)?)(?![\d分钟小时半])/,
  ];
  for (const pattern of costPatterns) {
    const match = input.match(pattern);
    if (match) {
      result.cost = parseFloat(match[1]);
      break;
    }
  }

  // ================================
  // 2. 识别时长
  // ================================
  // 中文数字映射
  const cnNumMap = RULES.parsing.cn_num_map;
  const parseCnNum = (s: string): number => {
    if (/^\d+/.test(s)) return parseFloat(s);
    return cnNumMap[s] ?? 1;
  };

  const durationPatterns: Array<{ pattern: RegExp; calc: (m: RegExpMatchArray) => number }> = [
    // 精确数字: 30分钟, 1.5小时
    { pattern: /(\d+(?:\.\d+)?)\s*分钟/, calc: m => Math.round(parseFloat(m[1])) },
    { pattern: /(\d+(?:\.\d+)?)\s*小时/, calc: m => Math.round(parseFloat(m[1]) * 60) },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:hr|hrs|h)\b/i, calc: m => Math.round(parseFloat(m[1]) * 60) },
    { pattern: /(\d+(?:\.\d+)?)\s*min\b/i, calc: m => Math.round(parseFloat(m[1])) },
    // 中文数字: 一个半小时, 两个小时, 三个半小时
    { pattern: /([一二两三四五六七八九十\d]+)个半小时/, calc: m => parseCnNum(m[1]) * 60 + 30 },
    { pattern: /([一二两三四五六七八九十\d]+)个?小时/, calc: m => parseCnNum(m[1]) * 60 },
    // 半小时
    { pattern: /半小时/, calc: () => 30 },
    { pattern: /半天/, calc: () => 240 },
    // 中文数字分钟: 三十分钟, 五十分钟
    { pattern: /([一二两三四五六七八九十]+)分钟/, calc: m => parseCnNum(m[1]) },
  ];
  for (const { pattern, calc } of durationPatterns) {
    const match = input.match(pattern);
    if (match) {
      result.duration = calc(match);
      break;
    }
  }

  // ================================
  // 3. 识别统计数值（非金额、非时长）
  // ================================
  const metricPatterns: Array<{ pattern: RegExp; unit: string; object?: string }> = [
    { pattern: /(\d+(?:\.\d+)?)\s*公里/i, unit: '公里', object: '距离' },
    { pattern: /(\d+(?:\.\d+)?)\s*km\b/i, unit: '公里', object: '距离' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:米|m)(?![a-zA-Z])/i, unit: '米', object: '距离' },
    { pattern: /(\d+(?:\.\d+)?)\s*个/, unit: '个' },
    { pattern: /(\d+(?:\.\d+)?)\s*次/, unit: '次' },
    { pattern: /(\d+(?:\.\d+)?)\s*页/, unit: '页', object: '页' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:单词|词)/, unit: '个', object: '单词' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:道题|道|题)/, unit: '道', object: '题目' },
    { pattern: /(\d+(?:\.\d+)?)\s*章/, unit: '章' },
    { pattern: /(\d+(?:\.\d+)?)\s*节/, unit: '节' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:组|套)/, unit: '组' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:本|册)/, unit: '本' },
    { pattern: /(\d+(?:\.\d+)?)\s*篇/, unit: '篇' },
    { pattern: /(\d+(?:\.\d+)?)\s*遍/, unit: '遍' },
    { pattern: /(\d+(?:\.\d+)?)\s*杯/, unit: '杯' },
    { pattern: /(\d+(?:\.\d+)?)\s*碗/, unit: '碗' },
    { pattern: /(\d+(?:\.\d+)?)\s*份/, unit: '份' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:km|KG|kg|Kg)\b/i, unit: 'kg', object: '重量' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:公斤|斤)/, unit: 'kg', object: '重量' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:ML|ml|Ml)\b/i, unit: 'ml', object: '容量' },
    { pattern: /(\d+(?:\.\d+)?)\s*(?:毫升|升)/, unit: 'ml', object: '容量' },
  ];
  for (const { pattern, unit, object } of metricPatterns) {
    const match = input.match(pattern);
    if (match) {
      result.metric_value = parseFloat(match[1]);
      result.metric_unit = unit;
      if (object) result.metric_object = object;
      break;
    }
  }

  // ================================
  // 4. 识别时间词
  // ================================
  // 时间段关键词 → 仅用于排序的近似时间 + 显示用的时段名称
  // 不应将"早上"映射为"08:00"显示，这是误导性的假精确时间
  const timeMap = RULES.parsing.time_period_map;
  // 精确时间优先："14:30"、"2点半"、"14点"、"下午3点"
  const halfHourMatch = input.match(/(\d{1,2})\s*点半/);
  const exactTimeMatch = input.match(/(\d{1,2})[：:点](\d{1,2})/);
  const hourOnlyMatch = input.match(/(\d{1,2})\s*点(?![半钟])/);

  let detectedHour: number | null = null;
  let detectedMinute = 0;

  if (halfHourMatch) {
    detectedHour = parseInt(halfHourMatch[1]);
    detectedMinute = 30;
  } else if (exactTimeMatch) {
    detectedHour = parseInt(exactTimeMatch[1]);
    detectedMinute = parseInt(exactTimeMatch[2]) || 0;
  } else if (hourOnlyMatch) {
    detectedHour = parseInt(hourOnlyMatch[1]);
    detectedMinute = 0;
  }

  if (detectedHour !== null && detectedHour >= 0 && detectedHour <= 23) {
    // 如果有"下午/晚上"修饰且小时<=12，自动+12修正
    if (detectedHour <= 12) {
      if (/(?:下午|晚上|夜晚|夜里|傍晚|pm|PM)/.test(input) && detectedHour !== 12) {
        detectedHour += 12;
      } else if (/(?:凌晨|am|AM)/.test(input) && detectedHour === 12) {
        detectedHour = 0;
      }
    }
    result.time_hint = `${String(detectedHour).padStart(2, '0')}:${String(detectedMinute).padStart(2, '0')}`;
    // "下午3点"有精确时间修饰，不是模糊时段
  } else {
    // "刚刚"/"刚才" → 用当前时间（精确到分钟）
    if (/(?:刚刚|刚才|刚)/.test(input)) {
      const now = new Date();
      result.time_hint = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      result.time_precision_hint = 'approx'; // 模糊时间，非精确
    } else {
      // 匹配时间段词（早上/中午/晚上等）→ 标记为 fuzzy
      // time_hint 仍设近似值（仅用于排序），但 time_precision_hint='fuzzy'
      // 表示不应在UI上显示假精确时间，而应显示时段名称
      for (const { keywords, time, label } of timeMap) {
        if (keywords.some(kw => input.includes(kw))) {
          result.time_hint = time; // 保留用于排序
          result.time_precision_hint = 'fuzzy';
          result.time_period_label = label; // 时段名称，供 UI 显示
          break;
        }
      }
      // 不根据活动内容推断时间：用户没提到时间，occurred_at 应为空
    }
  }

  // ================================
  // 5. 推断记录类型（改进版：完成体标记优先 + 复合句按子句推断）
  // ================================
  const planKeywords = RULES.parsing.type_keywords.plan;
  const ideaKeywords = RULES.parsing.type_keywords.idea;
  const summaryKeywords = RULES.parsing.type_keywords.summary;
  const completionKeywords = RULES.parsing.type_keywords.completion;

  // 复合句连接词模式：匹配"A的时候B"、"A然后B"等结构
  const compoundPatterns: Array<{ pattern: RegExp; splitIdx: [number, number] }> = [
    // "A的时候打算/准备/想要B" — A是发生，B是计划
    { pattern: /([\s\S]*?)(的时候|同时|期间)(打算|准备|想要|计划|要去|待会|等下)([\s\S]*)/, splitIdx: [1, 4] },
    // "A然后/接着/而且/并且B" — 顺序连接
    { pattern: /([\s\S]*?)(然后|接着|之后|后来)([\s\S]*)/, splitIdx: [1, 3] },
    // "A而且/并且B" — 并列连接
    { pattern: /([\s\S]*?)(而且|并且|同时)([\s\S]*)/, splitIdx: [1, 3] },
    // "A想到/觉得B" — A发生，B想法
    { pattern: /([\s\S]*?)(的时候?)(想到|觉得|感觉)([\s\S]*)/, splitIdx: [1, 4] },
  ];

  let compoundParts: Array<{ text: string; type_hint: RecordType; content_hint?: string }> | null = null;

  for (const { pattern, splitIdx } of compoundPatterns) {
    const match = input.match(pattern);
    if (match && match[splitIdx[0]]?.trim() && match[splitIdx[1]]?.trim()) {
      const part1Text = match[splitIdx[0]].trim();
      const part2Text = match[splitIdx[1]].trim();

      // 分别推断各子句类型
      const inferType = (text: string): RecordType => {
        const textLower = text.toLowerCase();
        if (completionKeywords.some(kw => text.includes(kw))) return '发生';
        if (planKeywords.some(kw => textLower.includes(kw.toLowerCase()))) return '计划';
        if (ideaKeywords.some(kw => textLower.includes(kw.toLowerCase()))) return '想法';
        if (summaryKeywords.some(kw => textLower.includes(kw.toLowerCase()))) return '总结';
        return '发生'; // 默认发生
      };

      const part1Type = inferType(part1Text);
      const part2Type = inferType(part2Text);

      // 只有当两个子句推断出不同类型时，才生成拆分建议
      if (part1Type !== part2Type) {
        compoundParts = [
          { text: part1Text, type_hint: part1Type },
          { text: part2Text, type_hint: part2Type },
        ];
      }

      // type_hint 取第一个子句的类型（主事件优先）
      result.type_hint = part1Type;
      break;
    }
  }

  // 如果没有匹配到复合句，走原来的逻辑（但加上完成体优先级）
  if (!compoundParts) {
    if (completionKeywords.some(kw => input.includes(kw))) {
      result.type_hint = '发生';
    } else if (planKeywords.some(kw => lower.includes(kw.toLowerCase()))) {
      result.type_hint = '计划';
    } else if (ideaKeywords.some(kw => lower.includes(kw.toLowerCase()))) {
      result.type_hint = '想法';
    } else if (summaryKeywords.some(kw => lower.includes(kw.toLowerCase()))) {
      result.type_hint = '总结';
    } else {
      result.type_hint = '发生';
    }
  }

  if (compoundParts) {
    result.split_suggestion = { parts: compoundParts };
  }

  // ================================
  // 6. 推断内容主题（content_hint）
  // ================================
  const actionMap = RULES.parsing.content_hint_map;
  for (const { keywords, hint } of actionMap) {
    if (keywords.some(kw => lower.includes(kw))) {
      result.content_hint = hint;
      break;
    }
  }

  // 复合句拆分部分的 content_hint 补充
  if (compoundParts) {
    for (const part of compoundParts) {
      if (!part.content_hint) {
        for (const { keywords, hint } of actionMap) {
          if (keywords.some(kw => part.text.toLowerCase().includes(kw.toLowerCase()))) {
            part.content_hint = hint;
            break;
          }
        }
      }
    }
  }

  // ================================
  // 7. 词典碰撞匹配（Item Keyword Match）
  // 优先级：精确子串命中 > 模糊相似度
  // ================================
  if (items.length > 0) {
    let bestScore = 0;
    let bestItem: MatchableItem | null = null;

    for (const item of items) {
      const score = substringMatchScore(input, item.title);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    // 仅强匹配（精确子串 >= 阈值）才自动关联，避免误归类
    if (bestItem && bestScore >= RULES.classification.auto_classify_threshold) {
      result.suggested_item_id = bestItem.id;
      result.suggested_item_name = bestItem.title;
    }
  }

  // ================================
  // 8. P2: 时间锚点解析
  // ================================
  const anchor = resolveTimeAnchor(input);
  if (anchor) {
    result.time_anchor = anchor;
    result.date_hint = anchor.resolved_date;
  }

  // ================================
  // 9. P7: 地点识别
  // ================================
  const loc = extractLocation(input);
  if (loc) result.location_hint = loc;

  // ================================
  // 10. P7: 关系人识别
  // ================================
  const ppl = extractPeople(input);
  if (ppl.length > 0) result.people_hint = ppl;

  // ================================
  // 11. 识别心情 / 能量 / 状态
  // ================================
  const moodMap = RULES.parsing.mood_map;
  const bodyStateMap = RULES.parsing.body_state_map;
  const energyMap = RULES.parsing.energy_map;
  const statusMap = RULES.parsing.status_map;

  for (const { keywords, value } of moodMap) {
    if (keywords.some(kw => input.includes(kw))) {
      result.mood_hint = value;
      break;
    }
  }
  for (const { keywords, value } of bodyStateMap) {
    if (keywords.some(kw => input.includes(kw))) {
      result.body_state_hint = value;
      break;
    }
  }
  for (const { keywords, value } of energyMap) {
    if (keywords.some(kw => input.includes(kw))) {
      result.energy_hint = value;
      break;
    }
  }
  for (const { keywords, value } of statusMap) {
    if (keywords.some(kw => input.includes(kw))) {
      result.status_hint = value;
      break;
    }
  }

  // ================================
  // 12. P7: 生成 ParsedSemantic 兜底
  // ================================
  result.parsed_semantic = buildSemanticFallback(input, result);

  return result;
}

// ================================================================
// P2: 时间锚点解析器
// ================================================================

/** 解析时间锚点关键词，返回 TimeAnchor 或 null */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveTimeAnchor(input: string): TimeAnchor | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const anchors = RULES.parsing.time_anchor_map;

  for (const { keywords, offsetDays, direction } of anchors) {
    for (const kw of keywords) {
      if (input.includes(kw)) {
        const target = new Date(today);
        target.setDate(target.getDate() + offsetDays);
        return {
          raw: kw,
          resolved_date: formatLocalDate(target),
          direction,
        };
      }
    }
  }

  // 匹配 "X月Y号/日" 格式
  const dateMatch = input.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    const year = today.getFullYear();
    const target = new Date(year, month - 1, day);
    const direction: TimeAnchor['direction'] = target < today ? 'past' : target > today ? 'future' : 'present';
    return {
      raw: dateMatch[0],
      resolved_date: formatLocalDate(target),
      direction,
    };
  }

  // 匹配 "周X" 格式
  const weekdayMap = RULES.parsing.weekday_map;
  const weekdayMatch = input.match(/(?:这|本)\s*(?:周|礼拜)\s*([一二三四五六日天])/);
  if (weekdayMatch) {
    const targetDay = weekdayMap[weekdayMatch[1]];
    if (targetDay !== undefined) {
      const currentDay = today.getDay();
      const diff = targetDay - currentDay;
      const target = new Date(today);
      target.setDate(target.getDate() + diff);
      const direction: TimeAnchor['direction'] = diff < 0 ? 'past' : diff > 0 ? 'future' : 'present';
      return {
        raw: weekdayMatch[0],
        resolved_date: formatLocalDate(target),
        direction,
      };
    }
  }

  return null;
}

// ================================================================
// P7: 地点提取
// ================================================================
function extractLocation(input: string): string | null {
  // 匹配 "在XX"、"到XX"、"去XX" 后面接2~6字的地点词
  const locPatterns = [
    /在([一-龥]{2,6}?)(?:里|内|中|上|旁|边|门口|附近)?(?:[，。,\s]|$)/,
    /到(?:了)?([一-龥]{2,6}?)(?:[，。,\s]|$)/,
    /去(?:了)?([一-龥]{2,6}?)(?:[，。,\s]|$)/,
  ];
  // 排除误匹配的常见动词短语（在XX里的XX是动词+宾语，不是地点）
  const excludePrefixes = [
    '在进行', '在做', '在写', '在跑', '在看', '在吃', '在想', '在说', '在听',
    '在玩', '在学', '在睡', '在练', '在考', '在聊', '在走', '在练', '在背',
    '在整理', '在复习', '在准备', '在处理', '在讨论', '在加班', '在打扫',
    '在休息', '在冥想', '在检查', '在搜索', '在研究', '在分析', '在计算',
  ];
  // 常见的非地点词汇（动词/形容词+名词组合，不是真实地点）
  const nonLocationWords = new Set([
    '工作', '学习', '考试', '健身', '锻炼', '跑步', '游泳', '瑜伽',
    '上课', '开会', '加班', '值班', '出差', '旅行', '逛街', '散步',
    '做饭', '打扫', '洗衣服', '洗浴', '洗澡', '午休', '休息',
    '读书', '看书', '写代码', '编程', '开发', '背单词', '复习',
    '吃早饭', '吃午饭', '吃晚饭', '吃夜宵', '吃早餐', '吃晚餐', '吃午餐',
    '背书', '赶路', '通勤', '上班', '下班', '回家', '出门', '起床',
  ]);

  for (const pattern of locPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const loc = match[1].trim();
      // 检查是否是误匹配
      const fullMatch = match[0];
      if (excludePrefixes.some(w => fullMatch.startsWith(w))) continue;
      if (nonLocationWords.has(loc)) continue;
      // 过滤掉纯动词性词汇（以"了/过/着"结尾的2字词）
      if (/^[\u4e00-\u9fa5][了过着]$/.test(loc)) continue;
      if (loc.length >= 2) return loc;
    }
  }
  return null;
}

// ================================================================
// P7: 关系人提取
// ================================================================
function extractPeople(input: string): string[] {
  const people: string[] = [];
  // 匹配 "和XX"、"跟XX"、"与XX"、"同XX" 后面接2~4字人名/称谓
  const peoplePatterns = [
    /(?:和|跟|与|同)([\u4e00-\u9fa5]{1,4}?)(?:一起|一块|一同|说|聊|去|在|吃|做|玩|[，。,\s]|$)/g,
  ];
  // 常见称谓直接匹配
  const titlePatterns = /(?:爸|妈|爸爸|妈妈|父亲|母亲|哥|姐|弟|妹|老婆|老公|女朋友|男朋友|同事|朋友|同学|老板|老师|教练)/g;

  for (const pattern of peoplePatterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const name = match[1].trim();
      if (name && name.length >= 1 && !people.includes(name)) {
        people.push(name);
      }
    }
  }

  // 补充称谓匹配
  let titleMatch;
  while ((titleMatch = titlePatterns.exec(input)) !== null) {
    const title = titleMatch[0];
    if (!people.includes(title)) {
      people.push(title);
    }
  }

  return people;
}

// ================================================================
// P7: 规则兜底 — 生成 ParsedSemantic
// ================================================================
function buildSemanticFallback(input: string, parsed: ParsedInput): ParsedSemantic {
  return {
    subject: null, // 规则层默认不解析主语，留给 LLM
    action: parsed.content_hint || input.slice(0, 20),
    object: null,
    time_anchor: parsed.time_anchor || null,
    location: parsed.location_hint || null,
    people: parsed.people_hint || [],
    mood: parsed.mood_hint || null,
    energy: parsed.energy_hint || null,
    manner: null,
    cost: parsed.cost ?? null,
    duration_minutes: parsed.duration ?? null,
    metric: parsed.metric_value != null ? {
      value: parsed.metric_value,
      unit: parsed.metric_unit || '',
      name: parsed.metric_object || '',
    } : null,
    record_link_hint: null,
    item_hint: parsed.suggested_item_name || null,
    sub_item_hint: null,
    shared_context: null,
    // === 1.5 录入结构对齐新增 ===
    main_text: input.slice(0, 30),
    body_state: parsed.body_state_hint || null,
    money_amount: parsed.cost ?? null,
    money_currency: parsed.cost != null ? 'CNY' : null,
    result_text: null,
    place_text: parsed.location_hint || null,
    state: parsed.status_hint || null,
    // === 三层九组 Phase 1 新增（降级模式填充） ===
    action_text: parsed.content_hint || null,
    event_text: null,
    object_text: null,
    outcome_type: null,
    outcome_direction: null,
    cause_text: null,
    time_text: parsed.time_anchor?.raw || null,
    time_precision: null,
    place_type: null,
    money_direction: parsed.cost != null && parsed.cost > 0 ? 'expense' as const : null,
    relation_roles: null,
  };
}

/**
 * 词典碰撞匹配：子串优先策略
 * - 精确子串（item名出现在输入中）→ 1.0
 * - 输入出现在item名中（反向包含）→ auto_classify_threshold
 * - 连续子序列匹配 → 按比例 0.5~0.8
 * - 散碎字符命中不再计分（避免误匹配）
 */
function substringMatchScore(input: string, itemName: string): number {
  if (!itemName || !input) return 0;

  const lowerInput = input.toLowerCase();
  const lowerName = itemName.toLowerCase();

  // 优先级 1：item名完整出现在输入中（最强匹配）
  if (lowerInput.includes(lowerName)) return 1.0;

  // 优先级 2：输入是item名的子串（如输入"背单"匹配事项"背单词"）
  if (lowerName.includes(lowerInput) && lowerInput.length >= 2) return RULES.classification.auto_classify_threshold;

  // 不再使用连续子序列匹配——误匹配率过高
  // （如"英语"的片段"语"可能偶然命中无关输入）

  return 0;
}
