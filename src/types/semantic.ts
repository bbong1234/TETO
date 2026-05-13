// TETO 语义解析引擎 —— 核心类型定义

/** 时间锚点 */
export interface TimeAnchor {
  raw: string;                              // 原文时间表达："明天"、"上周三"、"3月15号"
  resolved_date: string;                    // 解析后 ISO 日期："2026-04-21"
  direction: 'past' | 'present' | 'future'; // 时间指向
}

/** 量化指标（从现有 metric 体系继承） */
export interface SemanticMetric {
  value: number;
  unit: string;   // 计量单位（个、次、页、公里）
  name: string;   // 统计对象（单词、俯卧撑、阅读）
}

/** 单条记录的语法结构 */
export interface ParsedSemantic {
  // === 核心断言（主谓宾） ===
  subject: string | null;       // 主语："我"、"爸妈"、"小明"
  action: string;               // 谓语/动作："吃"、"考试"、"跑步"
  object: string | null;        // 宾语："猪脚饭"、"驾照科目一"

  // === 上下文修饰（状语/定语） ===
  time_anchor: TimeAnchor | null;
  location: string | null;      // 地点："公司"、"公园"
  people: string[];             // 关系人：["小明", "同事"]
  mood: string | null;          // 心情修饰："开心"、"烦躁"
  energy: string | null;        // 能量状态："累"、"精力充沛"
  manner: string | null;        // 方式状语："匆忙地"、"认真地"

  // === 量化数据 ===
  cost: number | null;
  duration_minutes: number | null;
  metric: SemanticMetric | null;

  // === 1.5 录入结构对齐新增 ===
  main_text?: string | null;          // 主内容/主句（从原句提炼的核心表达，与 raw_input 区分）
  result_text?: string | null;        // 结果文本（与 outcome_type/outcome_direction 配套，写最后结果/产出）
  place_text?: string | null;         // 原文地点表达（映射到 DB location 列）
  state?: string | null;              // 运转状态（映射到 DB status 列：专注/低效/混乱/被打断等）
  body_state?: string | null;         // 身体状态（累/困/饿/头疼/没精神，与 mood/energy 分离）
  money_amount?: number | null;       // 金额（映射到 DB cost 列）
  money_currency?: string | null;     // 币种（映射到 DB money_currency 列，默认 CNY）

  // === 关联意图 ===
  record_link_hint: RecordLinkHint | string | null;  // AI 语义判断的关联建议，或回溯搜索关键词
  item_hint: string | null;         // 推荐关联事项关键词
  sub_item_hint: string | null;     // 推荐关联子项关键词

  // === 共享上下文（复合句中无法分配到单一 unit 的修饰语） ===
  shared_context?: SharedContextItem[] | null;

  // === 置信度分级（AI 红绿灯机制） ===
  field_confidence?: Record<string, 'certain' | 'guess'>;

  // === 整体置信度（从 ParsedResult 透传） ===
  confidence?: number;

  // === 规律/历史识别（1.5 新增：概括性历史输入标记） ===
  is_period_rule?: boolean;              // 是否为规律记录
  period_start_date?: string;            // 规律起始日
  period_end_date?: string;              // 规律结束日
  period_frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular'; // 规律频率
  data_nature?: 'fact' | 'inferred';     // 数据性质

  // === 三层九组 Phase 1 新增 ===
  action_text?: string | null;         // 更完整的动作描述（比 action 更丰富，如"开会"、"通勤"）
  event_text?: string | null;          // 事件表达（如"会议太长"、"地铁太挤"）
  object_text?: string | null;         // 动作/事件指向对象（比 object 更丰富，如"会议"、"咖啡"）
  outcome_type?: string | null;        // 英文枚举: done/progress/recovered/maintained/interrupted/stagnant/consumed/deviated/no_change
  outcome_direction?: string | null;   // 英文枚举: positive/neutral/negative
  cause_text?: string | null;          // 原因（如"因为昨晚没睡好"）
  time_text?: string | null;           // 原文时间表达（"昨晚"、"下班路上"）
  time_precision?: string | null;      // exact/approx/fuzzy/unknown
  place_type?: string | null;          // 英文枚举: home/office/commuting/transport/shop/hospital/school/outdoor/online/other
  money_direction?: string | null;     // 英文枚举: expense/income/none
  relation_roles?: string[] | null;    // ["同事","朋友","领导"]
}

/** 共享上下文项：复合句中无法分配到单一 unit 的修饰语 */
export interface SharedContextItem {
  field: string;   // 字段名，如 'duration_minutes'、'cost'、'location'
  value: unknown;  // 解析出的值，如 60、30、'地铁'
  raw: string;     // 原文表达，如 '花了一个小时'、'在地铁上'
}

/** AI 语义判断的记录关联建议 */
export interface RecordLinkHint {
  target_id: string;       // 近期记录的 ID
  link_type: string;       // completes | related_to | derived_from | postponed_from
  reason: string;          // AI 给出的关联理由
}

/** 复合句子单元间的关系类型 */
export type ClauseRelation = 'sequence' | 'contrast' | 'cause' | 'parallel';

/** 复合句拆分后的完整解析结果 */
export interface ParsedResult {
  is_compound: boolean;
  units: ParsedSemantic[];
  relations: Array<{
    from: number;
    to: number;
    type: ClauseRelation;
  }>;
  confidence: number; // 0~1，低于阈值时提示用户确认
}

// ================================================================
// 澄清框相关类型
// ================================================================

/** 澄清问题类型 */
export type ClarificationType =
  | 'shared_duration'
  | 'sub_item_ambiguous'
  | 'item_suggestion'
  | 'metric_prompt'
  | 'low_confidence'
  | 'item_missing'
  | 'item_ambiguous'
  | 'parse_uncertain'
  | 'compound_uncertain'
  | 'boundary_blur';

/** 单条澄清问题 */
export interface ClarificationIssue {
  type: ClarificationType;
  unitIndex: number;
  message: string;           // 向用户展示的问题描述
  reason: string;            // AI 的困惑原因，帮助用户理解
  options?: Array<{ label: string; value: string }>;  // 可选项
  sharedContext?: SharedContextItem;  // 关联的共享上下文
  // metric_prompt 专用字段
  metricGoalId?: string;         // 关联的目标 ID
  metricName?: string;           // 指标名称（如"单词"、"页"）
  metricUnit?: string;           // 计量单位（如"个"、"分"）
  metricDailyTarget?: number;    // 日均目标值，供用户参考
}

/** 澄清请求：包含一条记录的所有待澄清问题 */
export interface ClarificationNeeded {
  /** 卡片类型：split=拆分确认, attribution=归属确认, clarify=澄清确认 */
  cardType: 'split' | 'attribution' | 'clarify';
  recordId: string;
  recordIds: string[];        // 含拆分记录，用于"修改原文"时批量删除
  issues: ClarificationIssue[];
  timestamp: number;
  originalInput: string;      // 原始输入文本，用于"修改原文"时回填
}

/** AI 增强结果（TETO 1.6 一步到位） */
export interface EnhanceResult {
  /** 需要澄清的问题（无歧义时为 null） */
  clarification: ClarificationNeeded | null;
  /** 是否为复合句 */
  compoundDetected: boolean;
  /** 复合句拆分单元数 */
  compoundUnitsCount: number;
  /** 拆分出的子记录 ID 列表（仅复合句时有值） */
  splitRecordIds?: string[];
}

// ================================================================
// 入库前 AI 清分结果（TETO 1.6 先清分后入库）
// ================================================================

/** 单个拆分单元的字段映射建议 */
export interface UnitFieldProposal {
  /** 单元索引（0-based） */
  unitIndex: number;
  /** 内容摘要 */
  contentSummary: string;
  /** AI 建议的 DB 字段映射 */
  fields: Record<string, unknown>;
  /** 匹配到的事项 ID */
  itemId?: string;
  /** 匹配到的子项 ID */
  subItemId?: string;
}

/** 单次关键判断的记录（TETO 1.6 §1.2 决策编号） */
export interface DecisionRecord {
  /** 决策 ID，如 DEC-SPLIT-xxxxxx */
  decisionId: string;
  /** 决策类型 */
  type: 'DEC-SPLIT' | 'DEC-TYPE' | 'DEC-ITEM' | 'DEC-TIME' | 'DEC-AMOUNT' | 'DEC-ADMISSION';
  /** 所属单元索引 */
  unitIndex: number;
  /** 自然语言解释（可回放审计） */
  explain: string;
  /** 决策涉及的字段或值 */
  detail?: Record<string, unknown>;
}

/** AI 清分结果 — 入库前的完整分析 */
export interface ClassificationResult {
  /** 是否需要用户确认（有 issue 时必须确认才能入库） */
  needsConfirmation: boolean;
  /** 澄清请求（needsConfirmation=true 时填充） */
  clarification: ClarificationNeeded | null;
  /** 是否为复合句 */
  isCompound: boolean;
  /** 复合句单元数 */
  unitsCount: number;
  /** 每个单元的建议字段（可直接用于 createRecordSafely） */
  unitProposals: UnitFieldProposal[];
  /** 所有关键判断记录（可回放审计） */
  decisions: DecisionRecord[];
  /** 原始 AI 解析结果（用于决策日志） */
  rawParsed: Record<string, unknown> | null;
}

// ================================================================
// 优化输入相关类型
// ================================================================

/** 模糊输入分类（TETO 1.5 模糊输入三分法） */
export type FuzzyType = 'A' | 'B' | 'C';

/** 风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high';

/** 优化后的一行清晰记录 */
export interface OptimizedLine {
  text: string;               // 优化后的清晰文本
  type_hint: '发生' | '计划' | '想法' | '总结';  // 推断的记录类型
  missing_fields: string[];   // 缺失的关键字段名称（如 ['时间', '事项']）
}

/** 优化输入检测到的问题 */
export interface OptimizeIssue {
  line_index: number;         // 对应 optimized_lines 的索引（-1 表示整体问题）
  field: string;              // 问题涉及的字段（如 '时间', '事项', '动作'）
  description: string;        // 问题描述
  suggestion: string;         // 修复建议
}

/** 优化输入结果 */
export interface OptimizeInputResult {
  fuzzy_type: FuzzyType | null;   // 模糊类型（null 表示输入已足够清晰）
  risk_level: RiskLevel;          // 风险等级
  optimized_lines: OptimizedLine[];  // 优化后的清晰记录行
  issues: OptimizeIssue[];        // 检测到的问题
  summary: string;                // 优化摘要（向用户说明做了什么）
}
