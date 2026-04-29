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

  // === AI 判断理由（1.5 新增：归档AI为什么做出这个归类判断） ===
  reasoning?: string;

  // === 风险等级（1.5 新增：自动处理的风险分级） ===
  risk_level?: 'low' | 'medium' | 'high';

  // === 模糊输入分类（1.5 新增：模糊输入3类区分） ===
  fuzzy_category?: 'unintelligible' | 'insufficient_info' | 'unreasonable';
  // unintelligible: 无法理解（表达太碎、缺主语缺动作）→ 要求澄清
  // insufficient_info: 信息不足（可理解但缺关键信息）→ 可先收为低精度
  // unreasonable: 不合理（内容太多/时间冲突/计划结果混杂）→ 提示拆分或改写
  fuzzy_hint?: string;  // AI 给用户的提示语（如"请补充你在做什么"）

  // === 规律/历史识别（1.5 新增：概括性历史输入标记） ===
  is_period_rule?: boolean;              // 是否为规律记录
  period_start_date?: string;            // 规律起始日
  period_end_date?: string;              // 规律结束日
  period_frequency?: 'daily' | 'weekly' | 'monthly' | 'irregular'; // 规律频率
  data_nature?: 'fact' | 'inferred';     // 数据性质
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
export type ClarificationType = 'shared_duration' | 'sub_item_ambiguous' | 'low_confidence' | 'item_missing' | 'high_risk' | 'medium_risk' | 'fuzzy_unintelligible' | 'fuzzy_insufficient' | 'fuzzy_unreasonable';

/** 单条澄清问题 */
export interface ClarificationIssue {
  type: ClarificationType;
  unitIndex: number;
  message: string;           // 向用户展示的问题描述
  reason: string;            // AI 的困惑原因，帮助用户理解
  options?: Array<{ label: string; value: string }>;  // 可选项
  sharedContext?: SharedContextItem;  // 关联的共享上下文
}

/** 澄清请求：包含一条记录的所有待澄清问题 */
export interface ClarificationNeeded {
  recordId: string;
  recordIds: string[];        // 含拆分记录，用于"修改原文"时批量删除
  issues: ClarificationIssue[];
  timestamp: number;
  originalInput: string;      // 原始输入文本，用于"修改原文"时回填
}
