/**
 * 入库准入闸门：信息无误、置信度达标才 promote 到 records
 */
import { RULES } from '@/lib/rules';
import type { ClarificationIssue } from '@/types/semantic';
import { recordTypeNeedsActionClarify, shouldRaiseActionVague } from './clarify-standards';
import { issuesAfterCompoundGate } from './clarification-planner';

export interface CanPromoteResult {
  allowed: boolean;
  reason?: string;
}

export interface CanPromoteParams {
  unitIndex: number;
  openIssues: ClarificationIssue[];
  proposedFields: Record<string, unknown>;
  parsedSemantic?: unknown;
  /** 用户已在「解析不确定/低置信」对话框点过确认保存 */
  allowForcedConfirm?: boolean;
}

const INTERNAL_PROPOSED_KEYS = ['item_id_explicit_none'] as const;

/** 入库前剔除仅用于澄清状态机的字段 */
export function sanitizeProposedForRecord(
  proposed: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...proposed };
  for (const k of INTERNAL_PROPOSED_KEYS) {
    delete next[k];
  }
  return next;
}

/** 将 proposed_fields 合并进 unit 语义，用于动作含糊判断 */
export function buildEffectiveUnitSemantic(
  parsedSemantic: unknown,
  proposedFields: Record<string, unknown>,
  unitIndex = 0
): Record<string, unknown> {
  const base =
    parsedSemantic && typeof parsedSemantic === 'object' && !Array.isArray(parsedSemantic)
      ? { ...(parsedSemantic as Record<string, unknown>) }
      : {};
  const units = base.units as unknown[] | undefined;
  if (Array.isArray(units) && units.length > 0) {
    const slice = units[unitIndex] ?? units[0];
    if (slice && typeof slice === 'object') {
      return { ...(slice as Record<string, unknown>), ...proposedFields };
    }
  }
  return {
    ...base,
    action_text:
      proposedFields.action_text ??
      base.action_text ??
      (typeof base.action === 'string' ? base.action : undefined),
    object_text: proposedFields.object_text ?? base.object_text,
    event_text: proposedFields.event_text ?? base.event_text,
    ...proposedFields,
  };
}

export function issuesForUnit(
  issues: ClarificationIssue[],
  unitIndex: number,
  compoundGated: boolean
): ClarificationIssue[] {
  const pool = compoundGated ? issuesAfterCompoundGate(issues) : issues;
  return pool.filter((i) => {
    if (i.unitIndex === unitIndex) return true;
    if (i.unitIndex === -1 && unitIndex === 0 && i.type === 'compound_uncertain') return true;
    return false;
  });
}

function issueTouchesField(issue: ClarificationIssue, field: string): boolean {
  switch (issue.type) {
    case 'item_ambiguous':
    case 'item_missing':
    case 'item_suggestion':
      return field === 'item_id';
    case 'action_vague':
    case 'parse_uncertain':
      return field === 'action_text' || field === '_confirm';
    case 'sub_item_ambiguous':
      return field === 'sub_item_id';
    case 'shared_duration':
      return field === 'duration_minutes';
    case 'metric_prompt':
      return field === 'metric_value' || field.startsWith('metric:');
    case 'low_confidence':
    case 'boundary_blur':
    case 'compound_uncertain':
      return field === '_confirm';
    default:
      return field === '_confirm';
  }
}

/** 用户回答或跳过后，从 issue 列表移除已处理项 */
export function resolveIssuesAfterField(
  issues: ClarificationIssue[],
  unitIndex: number,
  field: string,
  mode: 'answer' | 'skip',
  answer?: unknown
): ClarificationIssue[] {
  return issues.filter((issue) => {
    if (issue.unitIndex !== unitIndex && !(issue.unitIndex === -1 && unitIndex === 0)) {
      return true;
    }
    if (!issueTouchesField(issue, field)) return true;

    if (issue.type === 'compound_uncertain' && field === '_confirm') {
      return !(
        answer === 'split' ||
        answer === 'keep_single' ||
        answer === 'confirm'
      );
    }
    if (issue.type === 'low_confidence' && field === '_confirm' && answer === 'confirm') {
      return false;
    }
    if (issue.type === 'boundary_blur' && field === '_confirm' && answer === 'confirm') {
      return false;
    }
    if (issue.type === 'parse_uncertain' && field === '_confirm' && answer === 'confirm') {
      return false;
    }
    if (
      (issue.type === 'item_ambiguous' ||
        issue.type === 'item_missing' ||
        issue.type === 'item_suggestion') &&
      field === 'item_id'
    ) {
      if (mode === 'answer') return false;
      if (mode === 'skip') return false;
    }
    if (
      (issue.type === 'action_vague' || issue.type === 'parse_uncertain') &&
      field === 'action_text'
    ) {
      if (mode === 'answer' && typeof answer === 'string' && answer.trim().length > 0) {
        return false;
      }
      return true;
    }
    if (issue.type === 'sub_item_ambiguous' && field === 'sub_item_id') {
      return mode !== 'answer' && mode !== 'skip';
    }
    if (issue.type === 'shared_duration' && field === 'duration_minutes') {
      return mode !== 'answer';
    }
    if (issue.type === 'metric_prompt' && (field === 'metric_value' || field.startsWith('metric:'))) {
      return mode !== 'answer';
    }
    return true;
  });
}

export function applyFieldAnswerToProposed(
  proposedFields: Record<string, unknown>,
  field: string,
  answer: unknown
): Record<string, unknown> {
  const next = { ...proposedFields };
  if (field.startsWith('metric:')) {
    next.metric_name = field.slice('metric:'.length);
    next.metric_value = answer;
    return next;
  }
  if (field === 'item_id' && answer === 'none') {
    delete next.item_id;
    next.item_id_explicit_none = true;
    return next;
  }
  if (field === 'item_id' && typeof answer === 'string' && answer) {
    next.item_id = answer;
    delete next.item_id_explicit_none;
    return next;
  }
  next[field] = answer;
  return next;
}

export function canPromoteUnit(params: CanPromoteParams): CanPromoteResult {
  if (params.openIssues.length > 0) {
    return { allowed: false, reason: `仍有 ${params.openIssues.length} 个未澄清问题` };
  }

  const unit = buildEffectiveUnitSemantic(
    params.parsedSemantic,
    params.proposedFields,
    params.unitIndex
  );

  const recordType = params.proposedFields.type;
  if (
    !params.allowForcedConfirm &&
    recordTypeNeedsActionClarify(recordType) &&
    shouldRaiseActionVague(unit)
  ) {
    return { allowed: false, reason: '动作描述仍过于笼统，请补充具体做了什么' };
  }

  const conf =
    params.parsedSemantic &&
    typeof params.parsedSemantic === 'object' &&
    !Array.isArray(params.parsedSemantic) &&
    typeof (params.parsedSemantic as { confidence?: unknown }).confidence === 'number'
      ? (params.parsedSemantic as { confidence: number }).confidence
      : undefined;

  if (
    conf != null &&
    conf < RULES.fallback.low_confidence_threshold &&
    params.openIssues.some((i) => i.type === 'low_confidence' && i.unitIndex === params.unitIndex)
  ) {
    return { allowed: false, reason: '整体置信度偏低且尚未确认' };
  }

  return { allowed: true };
}
