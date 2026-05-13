/**
 * rules/index.ts — TETO 规则中心 (RULES)
 *
 * 统一声明系统中所有规则定义，其他模块只认这个接口。
 * 不含运行时逻辑，纯声明层。
 *
 * 5 大分类：
 * 1. record_type — 记录类型枚举与映射
 * 2. parsing — 解析规则（时间锚点、情绪/能量/身体、量化、类型推断）
 * 3. classification — 分类规则（事项匹配阈值、自动归类）
 * 4. lifecycle — 生命周期规则（终态定义、校验枚举）
 * 5. fallback — 降级规则（置信度阈值、降级条件）
 *
 * 与 P1-P5 的关系：P1-P5 是运行时执行层（引擎），RULES 是声明层（仪表盘）。
 * P1-P5 从 RULES 读取规则定义来执行，而不是各自硬编码。
 */

import { RECORD_TYPES, LIFECYCLE_STATUSES } from '@/types/teto';

// ═══════════════════════════════════════════════════════════
// 版本号（TETO 1.6）
// ═══════════════════════════════════════════════════════════

/** 规则中心语义版本号 */
export const RULES_VERSION = '1.6.0';

// ================================
// 1. record_type — 记录类型
// ================================

export const RULES_RECORD_TYPES = RECORD_TYPES;
/** 旧类型到新类型的映射 */
export const RULES_LEGACY_TYPE_MAP: Record<string, string> = {
  '情绪': '发生',
  '花费': '发生',
  '结果': '发生',
};

// ================================
// 2. parsing — 解析规则
// ================================

/** 时间锚点关键词 → 日期偏移 */
export const RULES_TIME_ANCHOR_MAP: ReadonlyArray<{
  keywords: readonly string[];
  offsetDays: number;
  direction: 'past' | 'present' | 'future';
}> = [
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

/** 心情推断关键词映射（合并自 parse-rules-fallback + parseNaturalInput） */
export const RULES_MOOD_MAP: ReadonlyArray<{
  keywords: readonly string[];
  value: string;
}> = [
  { keywords: ['开心', '高兴', '快乐', '爽', '棒', '太好了', '兴奋', '激动', '愉快'], value: '开心' },
  { keywords: ['平静', '还行', '一般', '还好', '普通', '淡定'], value: '平静' },
  { keywords: ['烦', '郁闷', '烦死', '糟', '崩溃', '烦躁', '气死', '恼火', '抓狂', '不爽'], value: '烦躁' },
  { keywords: ['焦虑', '紧张', '担心', '不安', '着急', '慌'], value: '焦虑' },
  { keywords: ['伤心', '难过', '哭', '失落', '失望', '沮丧'], value: '难过' },
  { keywords: ['感动', '暖心', '温馨', '幸福'], value: '感动' },
];

/** 身体状态推断关键词映射 */
export const RULES_BODY_STATE_MAP: ReadonlyArray<{
  keywords: readonly string[];
  value: string;
}> = [
  { keywords: ['累', '好累', '太累了', '疲惫', '精疲力竭', '乏力', '没力'], value: '累' },
  { keywords: ['困', '犯困', '想睡', '打瞌睡'], value: '困' },
  { keywords: ['饿', '好饿', '肚子饿'], value: '饿' },
  { keywords: ['头疼', '头痛', '偏头痛'], value: '头疼' },
  { keywords: ['没精神', '无精打采'], value: '没精神' },
];

/** 能量推断关键词映射 */
export const RULES_ENERGY_MAP: ReadonlyArray<{
  keywords: readonly string[];
  value: string;
}> = [
  { keywords: ['累', '好累', '太累了', '疲惫', '精疲力竭', '乏力', '没力', '困', '没精神', '没劲', '低落'], value: '低' },
  { keywords: ['精力充沛', '精神', '有劲', '活力', '充满干劲', '精神抖擞', '很有精神', '能量满满'], value: '高' },
  { keywords: ['一般', '还行', '凑合'], value: '中' },
];

/** 状态推断关键词映射 */
export const RULES_STATUS_MAP: ReadonlyArray<{
  keywords: readonly string[];
  value: string;
}> = [
  { keywords: ['正在', '在进行', '在写', '在做', '在跑'], value: '进行中' },
  { keywords: ['完成了', '完了', '搞定了', '结束', '已完', '做完了'], value: '已完成' },
  { keywords: ['搁置', '暂停', '等一下', '先停'], value: '已暂停' },
];

/** 量化单位识别规则（合并自 parse-rules-fallback + parseNaturalInput） */
export const RULES_METRIC_PATTERNS: ReadonlyArray<{
  pattern: string;
  unit: string;
  name?: string;
}> = [
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*公里', unit: '公里', name: '距离' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*km\\b', unit: '公里', name: '距离' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:米|m)(?![a-zA-Z])', unit: '米', name: '距离' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:单词|词)', unit: '个', name: '单词' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:道题|道|题)', unit: '道', name: '题目' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*页', unit: '页', name: '页' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*次', unit: '次' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*个', unit: '个' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*遍', unit: '遍' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*篇', unit: '篇' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*章', unit: '章' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*节', unit: '节' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:组|套)', unit: '组' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:本|册)', unit: '本' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*杯', unit: '杯' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*碗', unit: '碗' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*份', unit: '份' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:km|KG|kg|Kg)\\b', unit: 'kg', name: '重量' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:公斤|斤)', unit: 'kg', name: '重量' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:ML|ml|Ml)\\b', unit: 'ml', name: '容量' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:毫升|升)', unit: 'ml', name: '容量' },
];

/** 金额识别规则 */
export const RULES_COST_PATTERNS: ReadonlyArray<{
  pattern: string;
}> = [
  { pattern: '[¥￥]\\s*(\\d+(?:\\.\\d+)?)' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:元|块|块钱|钱|rmb|RMB)' },
  { pattern: '(?:花了|花费|消费|付了|付款|支付)\\s*(\\d+(?:\\.\\d+)?)(?![\\d分钟小时半])' },
];

/** 时长识别规则 */
export const RULES_DURATION_PATTERNS: ReadonlyArray<{
  pattern: string;
  resultUnit: 'minutes';
}> = [
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*分钟', resultUnit: 'minutes' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*小时', resultUnit: 'minutes' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*(?:hr|hrs|h)\\b', resultUnit: 'minutes' },
  { pattern: '(\\d+(?:\\.\\d+)?)\\s*min\\b', resultUnit: 'minutes' },
  { pattern: '([一二两三四五六七八九十\\d]+)个半小时', resultUnit: 'minutes' },
  { pattern: '([一二两三四五六七八九十\\d]+)个?小时', resultUnit: 'minutes' },
  { pattern: '半小时', resultUnit: 'minutes' },
  { pattern: '半天', resultUnit: 'minutes' },
  { pattern: '([一二两三四五六七八九十]+)分钟', resultUnit: 'minutes' },
];

/** 时间段关键词 → 近似时间 + 时段名称 */
export const RULES_TIME_PERIOD_MAP: ReadonlyArray<{
  keywords: readonly string[];
  time: string;
  label: string;
}> = [
  { keywords: ['早上', '早晨', '清晨', '上午'], time: '08:00', label: '早上' },
  { keywords: ['中午', '午饭', '午休'], time: '12:00', label: '中午' },
  { keywords: ['下午'], time: '15:00', label: '下午' },
  { keywords: ['傍晚', '黄昏'], time: '18:00', label: '傍晚' },
  { keywords: ['晚上', '夜晚', '晚饭', '夜里'], time: '20:00', label: '晚上' },
  { keywords: ['深夜', '凌晨'], time: '23:00', label: '深夜' },
];

/** 记录类型推断关键词 */
export const RULES_TYPE_KEYWORDS: {
  plan: readonly string[];
  idea: readonly string[];
  summary: readonly string[];
  completion: readonly string[];
} = {
  plan: ['打算', '计划', '准备', '想要', '要去', '明天', '下次', '待会', '等下', '要', '将会', '预定', 'will ', 'gonna ', 'plan'],
  idea: ['感觉', '觉得', '想到', '突然', '好像', '也许', '应该', '如果', '灵光', '忽然', '可能', '或许', '要不要', 'maybe', 'think', 'guess'],
  summary: ['总结', '回顾', '今天', '这周', '这个月', '复盘', '总的来说', '总体', '整个', '这段时间', '归纳', '整体来说', 'summary', 'review'],
  completion: ['吃了', '去了', '做了', '看了', '到了', '完了', '过了', '搞定了', '写完了', '跑完了', '完成了'],
};

/** 内容主题推断映射 */
export const RULES_CONTENT_HINT_MAP: ReadonlyArray<{
  keywords: readonly string[];
  hint: string;
}> = [
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

/** 中文数字映射 */
export const RULES_CN_NUM_MAP: Readonly<Record<string, number>> = {
  '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

/** 星期映射 */
export const RULES_WEEKDAY_MAP: Readonly<Record<string, number>> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
};

/** 低能量类身体状态 → 映射为能量 "低" */
export const RULES_LOW_ENERGY_BODY_STATES: readonly string[] = ['累', '困', '没精神'];

// ================================
// 3. classification — 分类规则
// ================================

/** 事项匹配：精确子串命中阈值 */
export const RULES_AUTO_CLASSIFY_THRESHOLD = 0.85;

// ================================
// 4. lifecycle — 生命周期规则
// ================================

/** 终态定义：这些状态不可再执行生命周期操作 */
export const RULES_TERMINAL_STATUSES = ['completed', 'postponed', 'cancelled'] as const;

/** 合法 data_nature 枚举 */
export const RULES_VALID_DATA_NATURES = ['fact', 'inferred'] as const;

/** 合法 period_frequency 枚举 */
export const RULES_VALID_PERIOD_FREQUENCIES = ['daily', 'weekly', 'monthly', 'irregular'] as const;

// ================================
// 5. fallback — 降级规则
// ================================

/** 低置信度阈值：低于此值视为低置信度 */
export const RULES_LOW_CONFIDENCE_THRESHOLD = 0.7;

/** 降级模式统一置信度 */
export const RULES_FALLBACK_CONFIDENCE = 0.3;

/** 用户输入最大长度 */
export const RULES_MAX_INPUT_LENGTH = 2000;

/** 降级原因 → 用户提示 */
export const RULES_FALLBACK_MESSAGES: Record<string, string> = {
  ai_timeout: '智能解析响应超时，已切换基础模式',
  ai_error: '智能解析暂时不可用，已切换基础模式',
  ai_unavailable: '智能解析服务暂不可用，已切换基础模式',
  api_key_missing: 'AI 解析未配置，当前为基础模式',
};

// ================================
// 6. rule_id 编号体系
// ================================

/** 规则模块编号（5 大分类） */
export const RULE_MODULE_IDS = {
  record_type: 'R-MOD-001',
  parsing: 'R-MOD-002',
  classification: 'R-MOD-003',
  lifecycle: 'R-MOD-004',
  fallback: 'R-MOD-005',
} as const;

/**
 * Domain Invariant 规则编号映射
 *
 * 每个不变式检查的 rule_code → rule_id，
 * 便于在 API 响应、日志、审计中反查规则来源。
 */
export const RULE_IDS: Record<string, string> = {
  // ── 记录纯逻辑不变式 (R-RECORD-xxx) ──
  RECORD_SUB_ITEM_REQUIRES_ITEM: 'R-RECORD-001',
  RECORD_PHASE_REQUIRES_ITEM: 'R-RECORD-002',
  RECORD_INFERRED_NO_SOURCE: 'R-RECORD-003',
  RECORD_DERIVED_FROM_PERIOD: 'R-RECORD-004',
  RECORD_PERIOD_RULE_INCOMPLETE: 'R-RECORD-005',
  RECORD_CANCELLED: 'R-RECORD-006',
  RECORD_UNCHECKED: 'R-RECORD-007',
  RECORD_INVALID_TYPE: 'R-RECORD-008',
  RECORD_INVALID_LIFECYCLE: 'R-RECORD-009',
  RECORD_INVALID_DATA_NATURE: 'R-RECORD-010',
  RECORD_INVALID_PERIOD_FREQUENCY: 'R-RECORD-011',
  RECORD_NO_TIME_ANCHOR: 'R-RECORD-012',

  // ── 记录关系不变式 (R-REL-xxx) ──
  ITEM_NOT_FOUND: 'R-REL-001',
  ITEM_SHELVED: 'R-REL-002',
  SUB_ITEM_NOT_FOUND: 'R-REL-003',
  SUB_ITEM_ITEM_MISMATCH: 'R-REL-004',
  PHASE_NOT_FOUND: 'R-REL-005',
  PHASE_ITEM_MISMATCH: 'R-REL-006',

  // ── 生命周期不变式 (R-LIFE-xxx) ──
  LIFECYCLE_COMPLETE_REQUIRES_PLAN: 'R-LIFE-001',
  LIFECYCLE_POSTPONE_REQUIRES_PLAN: 'R-LIFE-002',
  LIFECYCLE_CANCEL_REQUIRES_PLAN: 'R-LIFE-003',
  LIFECYCLE_ALREADY_TERMINAL: 'R-LIFE-004',
  LIFECYCLE_POSTPONE_REQUIRES_DATE: 'R-LIFE-005',

  // ── 写入操作规则 (R-WRITE-xxx) ──
  RECORD_CREATE_FAILED: 'R-WRITE-001',
  RECORD_UPDATE_FAILED: 'R-WRITE-002',
  RECORD_COMPLETE_FAILED: 'R-WRITE-003',
  RECORD_POSTPONE_FAILED: 'R-WRITE-004',
  RECORD_CANCEL_FAILED: 'R-WRITE-005',
  BATCH_EMPTY: 'R-WRITE-006',
  BATCH_TOO_LARGE: 'R-WRITE-007',
  BATCH_MISSING_CONTENT: 'R-WRITE-008',
  BATCH_MISSING_DATE: 'R-WRITE-009',
  BATCH_CREATE_FAILED: 'R-WRITE-010',
  BATCH_DELETE_FAILED: 'R-WRITE-011',

  // ── 记录链接规则 (R-LINK-xxx) ──
  LINK_MISSING_RECORD_ID: 'R-LINK-001',
  LINK_SELF_REFERENCE: 'R-LINK-002',
  LINK_TARGET_NOT_FOUND: 'R-LINK-003',
  LINK_UPDATE_FAILED: 'R-LINK-004',

  // ── AI 增强规则 (R-AI-xxx) ──
  AI_ENHANCE_FETCH_FAILED: 'R-AI-001',
  AI_ENHANCE_UPDATE_FAILED: 'R-AI-002',

  // ── 事项不变式 (R-ITEM-xxx) ──
  ITEM_TITLE_REQUIRED: 'R-ITEM-001',
  ITEM_TITLE_TOO_LONG: 'R-ITEM-002',
  ITEM_INVALID_STATUS: 'R-ITEM-003',
  ITEM_ARCHIVED_IMMUTABLE: 'R-ITEM-004',
  ITEM_ENDED_BEFORE_STARTED: 'R-ITEM-005',
  ITEM_DESCRIPTION_TOO_LONG: 'R-ITEM-006',
  ITEM_COLOR_INVALID: 'R-ITEM-007',
  ITEM_DUPLICATE_ACTIVE_TITLE: 'R-ITEM-008',

  // ── 事项关系不变式 (R-ITEM-REL-xxx) ──
  ITEM_FOLDER_NOT_FOUND: 'R-ITEM-REL-001',
  ITEM_FOLDER_WRONG_USER: 'R-ITEM-REL-002',
  ITEM_HAS_ACTIVE_PHASES: 'R-ITEM-REL-003',
  ITEM_HAS_ACTIVE_GOALS: 'R-ITEM-REL-004',

  // ── 目标不变式 (R-GOAL-xxx) ──
  GOAL_TITLE_REQUIRED: 'R-GOAL-001',
  GOAL_INVALID_STATUS: 'R-GOAL-002',
  GOAL_INVALID_RULE_TYPE: 'R-GOAL-003',
  GOAL_INVALID_OPERATOR: 'R-GOAL-004',
  GOAL_INVALID_PERIOD: 'R-GOAL-005',
  GOAL_COMPLETED_LOCKED: 'R-GOAL-006',
  GOAL_TARGET_REQUIRED: 'R-GOAL-007',
  GOAL_DEADLINE_PAST: 'R-GOAL-008',
  GOAL_SOURCE_INVALID: 'R-GOAL-009',
  GOAL_CONFIRM_ONLY_DRAFT: 'R-GOAL-010',

  // ── 目标关系不变式 (R-GOAL-REL-xxx) ──
  GOAL_ITEM_NOT_FOUND: 'R-GOAL-REL-001',
  GOAL_PHASE_NOT_FOUND: 'R-GOAL-REL-002',
  GOAL_SUB_ITEM_NOT_FOUND: 'R-GOAL-REL-003',
  GOAL_PHASE_WRONG_ITEM: 'R-GOAL-REL-004',

  // ── 阶段不变式 (R-PHASE-xxx) ──
  PHASE_TITLE_REQUIRED: 'R-PHASE-001',
  PHASE_ITEM_REQUIRED: 'R-PHASE-002',
  PHASE_INVALID_STATUS: 'R-PHASE-003',
  PHASE_DATE_RANGE_INVALID: 'R-PHASE-004',
  PHASE_TITLE_TOO_LONG: 'R-PHASE-005',
  PHASE_ENDED_IMMUTABLE: 'R-PHASE-006',

  // ── 阶段关系不变式 (R-PHASE-REL-xxx) ──
  PHASE_ITEM_NOT_FOUND: 'R-PHASE-REL-001',
  PHASE_OVERLAPPING: 'R-PHASE-REL-002',
  PHASE_ITEM_ARCHIVED: 'R-PHASE-REL-003',

  // ── 标签不变式 (R-TAG-xxx) ──
  TAG_NAME_REQUIRED: 'R-TAG-001',
  TAG_TYPE_INVALID: 'R-TAG-002',
  TAG_DUPLICATE_NAME: 'R-TAG-003',

  // ── 子事项不变式 (R-SUBITEM-xxx) ──
  SUBITEM_TITLE_REQUIRED: 'R-SUBITEM-001',
  SUBITEM_ITEM_REQUIRED: 'R-SUBITEM-002',
  SUBITEM_ITEM_NOT_FOUND: 'R-SUBITEM-003',
  SUBITEM_SELF_REFERENCE: 'R-SUBITEM-004',
} as const;

/** 根据 rule_code 获取 rule_id */
export function getRuleId(code: string): string | undefined {
  return RULE_IDS[code];
}

// ================================
// 聚合导出：RULES 常量对象
// ================================

/**
 * RULES — 规则中心统一接口
 *
 * 所有模块通过 RULES.xxx 读取规则定义，
 * 不再直接硬编码 magic number / 关键词映射。
 */
export const RULES = {
  version: RULES_VERSION,
  module_ids: RULE_MODULE_IDS,
  rule_ids: RULE_IDS,
  record_type: {
    types: RULES_RECORD_TYPES,
    legacy_type_map: RULES_LEGACY_TYPE_MAP,
  },
  parsing: {
    time_anchor_map: RULES_TIME_ANCHOR_MAP,
    time_period_map: RULES_TIME_PERIOD_MAP,
    mood_map: RULES_MOOD_MAP,
    body_state_map: RULES_BODY_STATE_MAP,
    energy_map: RULES_ENERGY_MAP,
    status_map: RULES_STATUS_MAP,
    metric_patterns: RULES_METRIC_PATTERNS,
    cost_patterns: RULES_COST_PATTERNS,
    duration_patterns: RULES_DURATION_PATTERNS,
    type_keywords: RULES_TYPE_KEYWORDS,
    content_hint_map: RULES_CONTENT_HINT_MAP,
    cn_num_map: RULES_CN_NUM_MAP,
    weekday_map: RULES_WEEKDAY_MAP,
    low_energy_body_states: RULES_LOW_ENERGY_BODY_STATES,
  },
  classification: {
    auto_classify_threshold: RULES_AUTO_CLASSIFY_THRESHOLD,
  },
  lifecycle: {
    terminal_statuses: RULES_TERMINAL_STATUSES,
    lifecycle_statuses: LIFECYCLE_STATUSES,
    valid_data_natures: RULES_VALID_DATA_NATURES,
    valid_period_frequencies: RULES_VALID_PERIOD_FREQUENCIES,
  },
  fallback: {
    low_confidence_threshold: RULES_LOW_CONFIDENCE_THRESHOLD,
    fallback_confidence: RULES_FALLBACK_CONFIDENCE,
    max_input_length: RULES_MAX_INPUT_LENGTH,
    fallback_messages: RULES_FALLBACK_MESSAGES,
  },
} as const;
