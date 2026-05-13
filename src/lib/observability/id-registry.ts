/**
 * TETO 1.6 编号体系 — 全局 ID 生成与常量定义
 *
 * 完整编号清单（12 种 ID）：
 *   trace_id / span_id / step_id / component_id / behavior_id
 *   / decision_id / tool_call_id / error_code / rule_id / computation_id
 *   / input_id / unit_id
 *
 * 约束（原则7）：
 *   - 编号格式一旦发布不得删除或修改已有编号，只能新增
 *   - 所有 ID 必须机器可解析（格式固定，适合 grep/日志分析/AI 诊断）
 */

// ═══════════════════════════════════════════════════════════
// 随机辅助
// ═══════════════════════════════════════════════════════════

/** 生成6位小写字母数字随机串 */
function random6(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 返回 YYYYMMDD 格式的当前日期字符串 */
function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 3位序号（回绕至 001） */
let _seqCounter = 0;
function seq3(): string {
  _seqCounter = (_seqCounter + 1) % 1000;
  return String(_seqCounter).padStart(3, '0');
}

// ═══════════════════════════════════════════════════════════
// 运行时生成函数
// ═══════════════════════════════════════════════════════════

/** 每次用户操作入口生成 */
export function genTraceId(): string {
  return `T-${todayStr()}-${random6()}`;
}

/** 每个 Pipeline Stage 生成（stage 取值 0-9） */
export function genSpanId(stage: number): string {
  const s = String(stage).padStart(2, '0');
  return `SPAN-${s}-${random6()}`;
}

/** 流水线逻辑步骤 */
export function genStepId(domain: string): string {
  return `LNK-${domain.toUpperCase()}-${seq3()}`;
}

/**
 * 决策类型枚举（TETO 1.6 标准 6 种）
 * 每次关键判断必须绑定一种类型，确保可回放
 */
export const DECISION_TYPES = {
  SPLIT: 'DEC-SPLIT',           // 为什么这样拆分复合句
  TYPE: 'DEC-TYPE',             // 为什么判断为发生/计划/想法/总结
  ITEM: 'DEC-ITEM',             // 为什么归到某事项
  TIME: 'DEC-TIME',             // 为什么识别为某时间
  AMOUNT: 'DEC-AMOUNT',         // 为什么识别为某金额
  ADMISSION: 'DEC-ADMISSION',   // 为什么允许或不允许入库
} as const;

export type DecisionType = (typeof DECISION_TYPES)[keyof typeof DECISION_TYPES];

/** 每次关键判断生成 */
export function genDecisionId(type: string): string {
  return `DEC-${type.toUpperCase()}-${random6()}`;
}

/** 每次 Tool 调用生成 */
export function genToolCallId(tool: string): string {
  return `TC-${tool.toUpperCase()}-${random6()}`;
}

/** 行为模式 ID（稳定编号 B-xxx，见 behavior-registry.ts） */
export function genBehaviorId(behaviorId: string): string {
  return `BEH-${behaviorId}-${seq3()}`;
}

/** 每次用户输入生成（TETO 1.6 input_id 体系） */
export function genInputId(): string {
  return `INP-${Date.now()}-${random6()}`;
}

/**
 * 根据父 input_id 生成子句的 unit_id
 * 格式：UNIT-{inputId}-{NN}（两位数序号，如 UNIT-INP-...-01）
 */
export function genUnitId(parentInputId: string, index: number): string {
  return `UNIT-${parentInputId}-${String(index).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════
// 系统模块标识 — 编译时常量（TETO 1.6 §17 模块编号）
// ═══════════════════════════════════════════════════════════

/**
 * 系统模块编号，格式：MOD-{NAME}
 * 用于错误定位时可快速判断是哪个模块出的问题
 */
export const MODULE_IDS = {
  INPUT: 'MOD-INPUT',             // 录入模块
  RULES: 'MOD-RULES',             // 规则中心
  RECORD: 'MOD-RECORD',           // 记录模块
  ITEM: 'MOD-ITEM',               // 事项模块
  TIME: 'MOD-TIME',               // 时间处理
  AMOUNT: 'MOD-AMOUNT',           // 金额处理
  COMPUTE: 'MOD-COMPUTE',         // 计算中心
  GOAL: 'MOD-GOAL',               // 目标模块
  INSIGHT: 'MOD-INSIGHT',         // 洞察模块
  CORRECTION: 'MOD-CORRECTION',   // 纠错模块
  EVAL: 'MOD-EVAL',               // 测试用例模块
  FRONTEND: 'MOD-FRONTEND',       // 前端展示模块
} as const;

export type ModuleId = (typeof MODULE_IDS)[keyof typeof MODULE_IDS];

// ═══════════════════════════════════════════════════════════
// 编译时常量 — 组件标识
// ═══════════════════════════════════════════════════════════

/** 系统组件标识（编译时定义，不运行时变） */
export const COMPONENT_IDS = {
  QUICK_INPUT: 'CMP-QI',
  RECORD_API: 'CMP-RA',
  PARSE_API: 'CMP-PA',
  GOAL_ENGINE: 'CMP-GE',
  INSIGHT_AGGREGATOR: 'CMP-IA',
  ORCHESTRATOR: 'CMP-OR',
  DIAGNOSE: 'CMP-DI',
  SIMULATOR: 'CMP-SM',
} as const;

export type ComponentId = (typeof COMPONENT_IDS)[keyof typeof COMPONENT_IDS];

// ═══════════════════════════════════════════════════════════
// 错误码注册表 — 编译时常量
// ═══════════════════════════════════════════════════════════

/**
 * 错误码格式：ERR-{DOMAIN}-{3位序号}
 * 一旦分配不得删除或修改，只能新增。
 */
export const ERROR_CODES = {
  // Record 域
  RECORD_CREATE_VALIDATION_FAILED: 'ERR-RECORD-001',
  RECORD_STATE_TRANSITION_INVALID: 'ERR-RECORD-002',
  RECORD_NOT_FOUND: 'ERR-RECORD-003',
  RECORD_FIELD_OWNERSHIP_VIOLATION: 'ERR-RECORD-004',

  // Item 域
  ITEM_MATCH_FAILED: 'ERR-ITEM-001',
  ITEM_NOT_FOUND: 'ERR-ITEM-002',
  ITEM_TITLE_REQUIRED: 'ERR-ITEM-003',
  ITEM_DUPLICATE_NAME: 'ERR-ITEM-004',
  ITEM_ARCHIVED_IMMUTABLE: 'ERR-ITEM-005',

  // Parse 域
  PARSE_UNINTELLIGIBLE: 'ERR-PARSE-001',
  PARSE_INSUFFICIENT_INFO: 'ERR-PARSE-002',

  // Goal 域
  GOAL_NO_DATA: 'ERR-GOAL-001',
  GOAL_CALCULATION_ERROR: 'ERR-GOAL-002',
  GOAL_TITLE_REQUIRED: 'ERR-GOAL-003',
  GOAL_COMPLETED_LOCKED: 'ERR-GOAL-004',
  GOAL_INVALID_RULE_TYPE: 'ERR-GOAL-005',
  GOAL_INVALID_PERIOD: 'ERR-GOAL-006',
  GOAL_CONFIRM_ONLY_DRAFT: 'ERR-GOAL-007',

  // Auth 域
  AUTH_UNAUTHENTICATED: 'ERR-AUTH-001',
  AUTH_FORBIDDEN: 'ERR-AUTH-002',

  // Classification 域
  CLASSIFY_LOW_CONFIDENCE: 'ERR-CLASSIFY-001',

  // Tag 域
  TAG_NOT_FOUND: 'ERR-TAG-001',

  // Insight 域
  INSIGHT_QUERY_INVALID: 'ERR-INSIGHT-001',

  // Input / Ingest 域
  INPUT_INGEST_DISABLED: 'ERR-INPUT-001',

  // Phase 域
  PHASE_NOT_FOUND: 'ERR-PHASE-001',

  // Sub-item 域
  SUB_ITEM_NOT_FOUND: 'ERR-SUBITEM-001',
  SUB_ITEM_TITLE_REQUIRED: 'ERR-SUBITEM-002',
  SUB_ITEM_ITEM_REQUIRED: 'ERR-SUBITEM-003',

  // Export 域
  EXPORT_NO_DATA: 'ERR-EXPORT-001',

  // Client observability
  CLIENT_UNCAUGHT_ERROR: 'ERR-CLIENT-001',
  CLIENT_UNHANDLED_REJECTION: 'ERR-CLIENT-002',

  // Server 域
  SERVER_INTERNAL_ERROR: 'ERR-SERVER-001',

  // RLS 域
  RLS_POLICY_REJECTION: 'ERR-RLS-001',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ═══════════════════════════════════════════════════════════
// 规则编号 — 编译时常量
// ═══════════════════════════════════════════════════════════

/** 规则编号格式：R-{MOD}-{3位序号} */
export const RULE_IDS = {
  // R-CL: Classification 分类模块
  CLASSIFICATION_BASIC: 'R-CL-001',
  CLASSIFICATION_USER_PREF: 'R-CL-002',

  // R-VL: Validation 校验模块
  VALIDATION_RECORD_FIELDS: 'R-VL-001',
  VALIDATION_LIFECYCLE: 'R-VL-002',

  // R-TR: Trust 可信度模块
  TRUST_SOURCE_MARK: 'R-TR-001',
  TRUST_CORRECTION_FLOW: 'R-TR-002',

  // R-ST: Stats 统计资格模块
  STATS_DISPLAY_ELIGIBILITY: 'R-ST-001',
  STATS_INSIGHT_ELIGIBILITY: 'R-ST-002',

  // R-EX: Explain 解释模块
  EXPLAIN_COMPUTATION: 'R-EX-001',
} as const;

export type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

// ═══════════════════════════════════════════════════════════
// 计算指标编号 — 编译时常量
// ═══════════════════════════════════════════════════════════

/** computation_id 格式：C-{TYPE}-{3位序号} */
export const COMPUTATION_IDS = {
  // C-GOAL: 目标类
  GOAL_PROGRESS: 'C-GOAL-001',
  GOAL_STREAK: 'C-GOAL-002',

  // C-ACT: 活跃度类
  ACTIVITY_FREQUENCY: 'C-ACT-001',
  ACTIVITY_VOLUME: 'C-ACT-002',

  // C-INS: 洞察类
  INSIGHT_TREND: 'C-INS-001',
  INSIGHT_COMPARISON: 'C-INS-002',

  // C-SUM: 汇总类
  SUMMARY_PERIOD: 'C-SUM-001',
} as const;

export type ComputationId = (typeof COMPUTATION_IDS)[keyof typeof COMPUTATION_IDS];

// ═══════════════════════════════════════════════════════════
// ID 格式验证
// ═══════════════════════════════════════════════════════════

const TRACE_ID_RE = /^T-\d{8}-[a-z0-9]{6}$/;
const SPAN_ID_RE = /^SPAN-\d{2}-[a-z0-9]{6}$/;
const DECISION_ID_RE = /^DEC-[A-Z]+-[a-z0-9]{6}$/;

export function isValidTraceId(id: string): boolean {
  return TRACE_ID_RE.test(id);
}

export function isValidSpanId(id: string): boolean {
  return SPAN_ID_RE.test(id);
}

export function isValidDecisionId(id: string): boolean {
  return DECISION_ID_RE.test(id);
}
