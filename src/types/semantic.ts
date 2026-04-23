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

  // === 置信度分级（AI 红绿灯机制） ===
  field_confidence?: Record<string, 'certain' | 'guess'>;
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
