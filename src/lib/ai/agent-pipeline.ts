/**
 * TETO 1.6 Agent Pipeline — 10 阶段流水线类型定义
 *
 * 流水线从"调 LLM → 得结果 → 写库"升级为完整的计划-校验-执行-验证-解释-记录闭环。
 *
 * 10 阶段：
 *   Stage 0: OBSERVE    — 接收用户输入，识别来源和格式
 *   Stage 1: INTERPRET  — LLM 语义解析：意图识别、实体提取、时间解析
 *   Stage 2: DECOMPOSE  — 复合意图拆分为多个独立动作
 *   Stage 3: PLAN       — Orchestrator 生成执行计划：Operation[]
 *   Stage 4: VALIDATE   — 每步计划传入 Domain 做预校验（不写库）
 *   Stage 5: EXECUTE    — Domain Service 按计划逐项执行写入
 *   Stage 6: VERIFY     — 写入后校验：读回确认数据正确性
 *   Stage 7: COMMIT     — 事务提交 / 关联刷新（Goal、Phase、Insight）
 *   Stage 8: EXPLAIN    — 生成用户可读的解释
 *   Stage 9: LOG        — 生成 trace、decision、error log 记录
 *
 * 约束（原则5）：
 *   - Agent 不得跳过 Stage 4（VALIDATE）
 *   - Agent 不得跳过 Stage 6（VERIFY）
 *   - 禁止将 VALIDATE 和 EXECUTE 合并为一个 LLM Tool Call
 */

// ═══════════════════════════════════════════════════════════
// Pipeline Stage 枚举
// ═══════════════════════════════════════════════════════════

export enum PipelineStage {
  OBSERVE = 0,
  INTERPRET = 1,
  DECOMPOSE = 2,
  PLAN = 3,
  VALIDATE = 4,
  EXECUTE = 5,
  VERIFY = 6,
  COMMIT = 7,
  EXPLAIN = 8,
  LOG = 9,
}

/** Stage 序号到中文名称的映射 */
export const PIPELINE_STAGE_NAMES: Record<PipelineStage, string> = {
  [PipelineStage.OBSERVE]: 'OBSERVE',
  [PipelineStage.INTERPRET]: 'INTERPRET',
  [PipelineStage.DECOMPOSE]: 'DECOMPOSE',
  [PipelineStage.PLAN]: 'PLAN',
  [PipelineStage.VALIDATE]: 'VALIDATE',
  [PipelineStage.EXECUTE]: 'EXECUTE',
  [PipelineStage.VERIFY]: 'VERIFY',
  [PipelineStage.COMMIT]: 'COMMIT',
  [PipelineStage.EXPLAIN]: 'EXPLAIN',
  [PipelineStage.LOG]: 'LOG',
};

/** 通过序号获取 Stage 名称 */
export function stageName(stage: PipelineStage): string {
  return PIPELINE_STAGE_NAMES[stage] ?? `UNKNOWN(${stage})`;
}

// ═══════════════════════════════════════════════════════════
// 上下文与结果类型
// ═══════════════════════════════════════════════════════════

/** 流水线上下文 — 贯穿整个请求生命周期 */
export interface PipelineContext {
  traceId: string;
  userId: string;
  rawInput: string;
  startedAt: Date;
  metadata?: Record<string, unknown>;
}

/** 单阶段执行结果 */
export interface PipelineStepResult {
  stage: PipelineStage;
  spanId: string;
  inputSummary: string;
  outputSummary: string;
  status: 'ok' | 'failed' | 'skipped';
  errorCode?: string;
  durationMs: number;
  decisionIds?: string[];
  ruleIds?: string[];
}

/** 完整流水线结果 */
export interface PipelineResult<TData = unknown> {
  traceId: string;
  stages: PipelineStepResult[];
  overallStatus: 'ok' | 'partial' | 'failed';
  totalDurationMs: number;
  errorCode?: string;
  /** 流水线产出的业务数据（如解析结果），由各阶段写入 */
  data?: TData;
}

// ═══════════════════════════════════════════════════════════
// 每阶段的最小输入/输出规范
// ═══════════════════════════════════════════════════════════

/** Stage 0 OBSERVE 输入 */
export interface ObserveInput {
  rawInput: string;
  source: 'quick_input' | 'voice' | 'batch' | 'correction';
}

/** Stage 0 OBSERVE 输出 */
export interface ObserveOutput {
  normalizedInput: string;
  detectedLanguage: string;
  inputLength: number;
}

/** Stage 1 INTERPRET 输入 */
export interface InterpretInput {
  normalizedInput: string;
}

/** Stage 1 INTERPRET 输出 */
export interface InterpretOutput {
  intents: string[]; // 如 ['record', 'goal_update']
  entities: string[]; // 如 ['跑步', '5公里', '20元']
  timeAnchor: string | null;
}

/** Stage 2 DECOMPOSE 输出 */
export interface DecomposeOutput {
  actions: DecomposedAction[];
}

export interface DecomposedAction {
  type: 'create_record' | 'update_record' | 'create_goal' | 'update_goal' | 'other';
  payload: Record<string, unknown>;
  priority: number; // 0 = 最高
}

/** Stage 3 PLAN 输出 — Orchestrator 生成执行计划 */
export interface PlanOutput {
  operations: OperationPlan[];
}

export interface OperationPlan {
  targetDomain: string; // D-RECORD, D-ITEM, D-GOAL ...
  action: string; // create, update, delete
  payload: Record<string, unknown>;
  dependencies: number[]; // 依赖的 operation 序号
  rollbackAction?: string; // 回滚动作
}

/** Stage 4 VALIDATE 输出 */
export interface ValidateOutput {
  allValid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  field?: string;
  severity: 'blocking' | 'warning';
  ruleId: string;
  message: string;
}

/** Stage 8 EXPLAIN 输出 */
export interface ExplainOutput {
  userMessage: string; // 给用户看的一句话
  details?: string[]; // 可展开的详情
}

/** Stage 9 LOG 输出 */
export interface LogOutput {
  traceIds: string[];
  decisionIds: string[];
  errorCodes: string[];
}
