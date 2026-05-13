// TETO 1.6 录入层类型
//
// 与 records 配套：inputs 是输入态（未确认/澄清中），records 是正式态。
// 任何录入入口（QuickInput / RecordEditDrawer / HistoryImport / API）
// 都先落到 inputs，由 IngestPipeline 晋升为 records。

import type { ParsedSemantic } from './semantic';

// ============================================
// inputs 表
// ============================================

export const INPUT_SOURCES = ['quick', 'edit', 'import', 'api'] as const;
export type InputSource = typeof INPUT_SOURCES[number];

export const INPUT_STATUSES = [
  'pending',      // 刚收到，待解析
  'clarifying',   // 在澄清流程中
  'completed',    // 已全部生成 records
  'partial',      // 3 轮封顶但仍部分入库
  'failed',       // 解析全部失败
  'cancelled',    // 用户取消
] as const;
export type InputStatus = typeof INPUT_STATUSES[number];

export interface Input {
  id: string;
  user_id: string;
  raw_input: string;
  source: InputSource;
  status: InputStatus;
  trace_id: string | null;
  batch_id: string | null;
  total_units: number;
  promoted_record_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// input_units 表
// ============================================

export const INPUT_UNIT_STATUSES = [
  'pending_clarify',  // 等用户回答澄清
  'ready',            // 解析完毕、可入库
  'promoted',         // 已生成 record
  'partial',          // 3 轮封顶后用户选择"先这样保存"
  'cancelled',        // 用户取消
  'failed',           // 解析失败
] as const;
export type InputUnitStatus = typeof INPUT_UNIT_STATUSES[number];

/** 字段归属：每个字段是谁写的（解释面板 / 纠错追溯用） */
export type FieldOwner = 'user' | 'ai' | 'rule' | 'default' | 'inherited';

/** 路由决策：分类器对该 unit 的判定 */
export interface ClassifierDecision {
  confidence: number;                    // 0~1 整体置信度
  route: 'direct' | 'clarify';           // 直入 / 澄清
  missing_fields: string[];              // 缺哪些关键字段
  rule_ids?: string[];                   // 命中规则
  reason?: string;                       // 简明说明
}

/** 澄清题分类：与控件 kind（select/number/…）正交，供前端稳定分支 */
export type PendingClarifyClass =
  | 'compound_confirm'
  | 'field_clarify'
  | 'boundary_confirm';

/** 待答问题（pending_question 列结构） */
export interface PendingQuestion {
  field: string;                         // 待回答字段名（如 item_id, occurred_at）
  prompt: string;                        // 题面（中文）
  kind: 'select' | 'text' | 'datetime' | 'number';
  /** 业务澄清类型；未写入的旧行视为 field_clarify */
  clarify_class?: PendingClarifyClass;
  /** 细分：如 boundary 二选一 */
  clarify_subtype?: string;
  options?: { value: string; label: string; hint?: string }[];
  placeholder?: string;
  ai_guess?: string;                     // AI 推荐答案（高亮显示）
}

/** 已答记录（answered_questions 列单元） */
export interface AnsweredQuestion {
  field: string;
  answer: string | number | null;
  at: string;
  via: 'user' | 'skip' | 'ai_default';   // 用户答 / 跳过 / 用 AI 默认
}

export interface InputUnit {
  id: string;
  input_id: string;
  user_id: string;
  unit_index: number;
  unit_text: string | null;

  parsed_semantic: ParsedSemantic | Record<string, unknown>;
  classifier_decision: ClassifierDecision | Record<string, unknown>;
  field_ownership: { [field: string]: FieldOwner };
  confidence_overall: number | null;

  pending_question: PendingQuestion | null;
  answered_questions: AnsweredQuestion[];
  clarify_round: number;
  clarify_max: number;

  status: InputUnitStatus;
  promoted_record_id: string | null;
  trace_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// API 请求/响应
// ============================================

/** POST /api/v2/inputs */
export interface CreateInputPayload {
  raw_input: string;
  source?: InputSource;
  date?: string;                         // 用户当前所选日期（默认今日）
  metadata?: Record<string, unknown>;
}

/** POST /api/v2/inputs 的响应 */
export interface CreateInputResponse {
  input: Input;
  units: InputUnit[];
  /** 如果有 unit 处于 pending_clarify，返回首个待答问题 */
  pending?: { unit_id: string; question: PendingQuestion } | null;
  /** 已直接晋升的 record_ids（无需澄清的 unit） */
  promoted_record_ids: string[];
  /** 多 unit 时 keep_single 保留的主 unit（默认 unit_index 最小） */
  primary_unit_id?: string;
}

/** POST /api/v2/inputs/:id/answer */
export interface AnswerInputPayload {
  unit_id: string;
  field: string;
  answer: string | number | null;
}

/** POST /api/v2/inputs/:id/skip */
export interface SkipInputPayload {
  unit_id: string;
  field: string;
}

/** 渐进澄清：下一题（含 unit，便于客户端直接 POST answer） */
export interface ClarifyNextPending {
  unit_id: string;
  question: PendingQuestion;
}

/** 用户在澄清过程中调用 answer/skip 后服务端的统一返回 */
export interface ClarifyStepResponse {
  input_status?: InputStatus;
  unit: InputUnit;
  /** 同一 input 内下一待答 unit；无则 null */
  next: ClarifyNextPending | null;
  promoted_record_id: string | null;
}

// ============================================
// CSV 批量导入
// ============================================

export interface ImportInputPayload {
  rows: ImportRowPayload[];
}

export interface ImportRowPayload {
  /** 一行 CSV 的原始文本（如果只有自由文本） */
  raw?: string;
  /** 一行 CSV 的结构化字段（如果已有列） */
  structured?: {
    content?: string;
    date?: string;
    occurred_at?: string;
    type?: string;
    item_title?: string;                 // 通过 title 关联 item
    metric_value?: number;
    metric_unit?: string;
    metric_name?: string;
    cost?: number;
    note?: string;
  };
}

export interface ImportInputResponse {
  batch_id: string;
  total: number;
  succeeded: number;
  failed: number;
  failed_rows: { index: number; error: string }[];
}
