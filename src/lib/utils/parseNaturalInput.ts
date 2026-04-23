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
  /** 识别出的时间（HH:mm 格式） */
  time_hint?: string;
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
    /(?:花了|花费|消费|付了|付款|支付)\s*(\d+(?:\.\d+)?)/,
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
  const cnNumMap: Record<string, number> = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
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
  const timeMap: Array<{ keywords: string[]; time: string }> = [
    { keywords: ['早上', '早晨', '清晨', '上午'], time: '08:00' },
    { keywords: ['中午', '午饭', '午休'], time: '12:00' },
    { keywords: ['下午'], time: '15:00' },
    { keywords: ['傍晚', '黄昏'], time: '18:00' },
    { keywords: ['晚上', '夜晚', '晚饭', '夜里'], time: '20:00' },
    { keywords: ['深夜', '凌晨'], time: '23:00' },
  ];
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
  } else {
    for (const { keywords, time } of timeMap) {
      if (keywords.some(kw => input.includes(kw))) {
        result.time_hint = time;
        break;
      }
    }
  }

  // ================================
  // 5. 推断记录类型（改进版：完成体标记优先 + 复合句按子句推断）
  // ================================
  const planKeywords = ['打算', '计划', '准备', '想要', '要去', '明天', '下次', '待会', '等下', 'will ', 'gonna ', 'plan'];
  const ideaKeywords = ['感觉', '觉得', '想到', '突然', '好像', '也许', '应该', '如果', 'maybe', 'think', 'guess'];
  const summaryKeywords = ['总结', '回顾', '今天', '这周', '这个月', '复盘', '整体来说', 'summary', 'review'];
  const completionKeywords = ['吃了', '去了', '做了', '看了', '到了', '完了', '过了', '搞定了', '写完了', '跑完了', '完成了'];

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

      const inferContent = (text: string): string | undefined => {
        for (const { keywords, hint } of actionMap) {
          if (keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
            return hint;
          }
        }
        return undefined;
      };

      const part1Type = inferType(part1Text);
      const part2Type = inferType(part2Text);

      // 只有当两个子句推断出不同类型时，才生成拆分建议
      if (part1Type !== part2Type) {
        compoundParts = [
          { text: part1Text, type_hint: part1Type, content_hint: inferContent(part1Text) },
          { text: part2Text, type_hint: part2Type, content_hint: inferContent(part2Text) },
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
  const actionMap: Array<{ keywords: string[]; hint: string }> = [
    { keywords: ['吃', '午饭', '早饭', '晚饭', '吃饭', '宵夜', '午餐', '晚餐', '早餐'], hint: '吃饭' },
    { keywords: ['跑步', '跑了', '慢跑', 'run', 'running'], hint: '跑步' },
    { keywords: ['健身', '撸铁', '锻炼', '举铁', 'workout', 'gym'], hint: '健身' },
    { keywords: ['看书', '读书', '阅读', 'read'], hint: '读书' },
    { keywords: ['背单词', '背了', '单词', 'vocabulary'], hint: '背单词' },
    { keywords: ['开会', '会议', '讨论', 'meeting'], hint: '开会' },
    { keywords: ['学习', '上课', '听课', 'study'], hint: '学习' },
    { keywords: ['买', '购买', '消费', 'shopping'], hint: '购物' },
    { keywords: ['咖啡', '奶茶', '饮料', '喝茶', 'coffee', 'tea'], hint: '饮品' },
    { keywords: ['睡觉', '睡了', '午休', '休息', 'sleep'], hint: '休息' },
    { keywords: ['写代码', '编程', '开发', 'coding', 'code'], hint: '写代码' },
    { keywords: ['写作', '写文章', '写了', 'writing'], hint: '写作' },
    { keywords: ['游泳', '游泳了', 'swim'], hint: '游泳' },
    { keywords: ['骑车', '骑行', '骑了', 'cycling', 'bike'], hint: '骑行' },
    { keywords: ['瑜伽', '冥想', 'yoga', 'meditation'], hint: '瑜伽' },
    { keywords: ['做饭', '煮饭', '下厨', 'cook'], hint: '做饭' },
    { keywords: ['打扫', '收拾', '整理', 'clean'], hint: '打扫' },
    { keywords: ['洗衣服', '洗了', 'laundry'], hint: '洗衣服' },
    { keywords: ['看电影', '看了', '刷剧', 'movie', 'watch'], hint: '看剧' },
    { keywords: ['打游戏', '游戏', 'game'], hint: '游戏' },
    { keywords: ['面试', '笔试', 'interview'], hint: '面试' },
    { keywords: ['加班', '赶工', 'overtime'], hint: '加班' },
    { keywords: ['散步', '走了', '走路', 'walk'], hint: '散步' },
    { keywords: ['地铁', '公交', '通勤', 'commute'], hint: '通勤' },
    { keywords: ['打字', '码字', 'typing'], hint: '打字' },
  ];
  for (const { keywords, hint } of actionMap) {
    if (keywords.some(kw => lower.includes(kw))) {
      result.content_hint = hint;
      break;
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

    // 子串命中(>=0.8)直接关联，模糊匹配需 >=0.5
    if (bestItem && bestScore >= 0.5) {
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
  const moodMap: Array<{ keywords: string[]; value: string }> = [
    { keywords: ['开心', '高兴', '快乐', '爽', '棒', '太好了', '兴奋', '激动'], value: '开心' },
    { keywords: ['平静', '还行', '一般', '还好', '普通'], value: '平静' },
    { keywords: ['烦', '郁闷', '烦死', '糟', '崩溃', '烦躁', '气死', '恼火'], value: '烦躁' },
    { keywords: ['焦虑', '紧张', '担心', '不安', '着急', '焦虑'], value: '焦虑' },
    { keywords: ['伤心', '难过', '哭', '失落', '失望', '沮丧'], value: '难过' },
    { keywords: ['感动', '暖心', '温馨', '幸福'], value: '感动' },
  ];
  const energyMap: Array<{ keywords: string[]; value: string }> = [
    { keywords: ['累', '疲惫', '困', '没劲', '精疲力尽', '好累', '太累了', '没力', '乏力'], value: '低' },
    { keywords: ['精力充沛', '精神', '有劲', '活力', '充满干劲', '精神抖擞'], value: '高' },
  ];
  const statusMap: Array<{ keywords: string[]; value: string }> = [
    { keywords: ['正在', '在进行', '在写', '在做', '在跑'], value: '进行中' },
    { keywords: ['完成了', '完了', '搞定了', '结束', '已完', '做完了'], value: '已完成' },
    { keywords: ['搁置', '暂停', '等一下', '先停'], value: '已暂停' },
  ];

  for (const { keywords, value } of moodMap) {
    if (keywords.some(kw => input.includes(kw))) {
      result.mood_hint = value;
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

  const anchors: Array<{ keywords: string[]; offsetDays: number; direction: TimeAnchor['direction'] }> = [
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
  const weekdayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
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
    /在([\u4e00-\u9fa5]{2,6}?)(?:里|内|中|上|旁|边|门口|附近)?(?:[，。,\s]|$)/,
    /到(?:了)?([\u4e00-\u9fa5]{2,6}?)(?:[，。,\s]|$)/,
    /去(?:了)?([\u4e00-\u9fa5]{2,6}?)(?:[，。,\s]|$)/,
  ];
  // 排除误匹配的常见动词短语
  const excludeWords = ['在进行', '在做', '在写', '在跑', '在看', '在吃', '在想', '在说', '在听', '在玩', '在学', '在睡'];

  for (const pattern of locPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const loc = match[1].trim();
      // 检查是否是误匹配
      const fullMatch = match[0];
      if (excludeWords.some(w => fullMatch.startsWith(w))) continue;
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
  };
}

/**
 * 词典碰撞匹配：子串优先策略
 * - 精确子串（item名出现在输入中）→ 1.0
 * - 输入出现在item名中（反向包含）→ 0.85
 * - 连续子序列匹配 → 按比例 0.5~0.8
 * - 散碎字符命中不再计分（避免误匹配）
 */
function substringMatchScore(input: string, itemName: string): number {
  if (!itemName || !input) return 0;

  const lowerInput = input.toLowerCase();
  const lowerName = itemName.toLowerCase();

  // 优先级 1：item名是输入的子串（最强匹配）
  if (lowerInput.includes(lowerName)) return 1.0;

  // 优先级 2：输入是item名的子串（如输入"背单"匹配事项"背单词"）
  if (lowerName.includes(lowerInput) && lowerInput.length >= 2) return 0.85;

  // 优先级 3：连续子序列 — item名的连续片段出现在输入中
  // 例如 item="英语阅读", input="今天阅读了英语" → "英语"和"阅读"都命中
  let maxConsecutive = 0;
  for (let start = 0; start < lowerName.length; start++) {
    for (let end = start + 2; end <= lowerName.length; end++) {
      const fragment = lowerName.slice(start, end);
      if (lowerInput.includes(fragment) && fragment.length > maxConsecutive) {
        maxConsecutive = fragment.length;
      }
    }
  }
  if (maxConsecutive >= 2) {
    const ratio = maxConsecutive / lowerName.length;
    // 仅当覆盖率 >= 50% 时才视为有效匹配
    if (ratio >= 0.5) return 0.5 + ratio * 0.3;
  }

  return 0;
}
