/**
 * 澄清循环共享逻辑（answer / skip）
 */
import type { ClarificationIssue } from '@/types/semantic';
import type { InputUnit } from '@/types/inputs';
import {
  applyFieldAnswerToProposed,
  canPromoteUnit,
  type CanPromoteResult,
  issuesForUnit,
  resolveIssuesAfterField,
} from './admission';
import {
  buildPrimaryQuestion,
  buildPrimaryQuestionAfterCompound,
  issuesAfterCompoundGate,
} from './clarification-planner';
import type { PendingQuestion } from '@/types/inputs';

export function isCompoundGated(
  units: InputUnit[],
  extra?: { field: string; answer: unknown }
): boolean {
  if (
    extra?.field === '_confirm' &&
    (extra.answer === 'split' || extra.answer === 'keep_single')
  ) {
    return true;
  }
  return units.some((u) =>
    (u.answered_questions ?? []).some(
      (a) =>
        a.field === '_confirm' && (a.answer === 'split' || a.answer === 'keep_single')
    )
  );
}

export function mergeProposedFields(
  decision: Record<string, unknown>,
  fieldUpdates: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...((decision.proposed_fields ?? {}) as Record<string, unknown>),
    ...fieldUpdates,
  };
}

export function applyInteractionToProposed(
  proposed: Record<string, unknown>,
  field: string,
  mode: 'answer' | 'skip',
  answer?: unknown
): Record<string, unknown> {
  if (field === '_confirm') return proposed;
  if (mode === 'skip') {
    const next = { ...proposed };
    delete next[field];
    if (field.startsWith('metric:')) {
      delete next.metric_name;
      delete next.metric_value;
    }
    return next;
  }
  return applyFieldAnswerToProposed(proposed, field, answer);
}

export function nextQuestionForUnit(
  issues: ClarificationIssue[],
  unitIndex: number,
  compoundGated: boolean
): PendingQuestion | null {
  const pool = compoundGated ? issuesAfterCompoundGate(issues) : issues;
  return compoundGated
    ? buildPrimaryQuestionAfterCompound(issues, unitIndex)
    : buildPrimaryQuestion(pool, unitIndex);
}

export function evaluateAdmission(params: {
  unitIndex: number;
  issues: ClarificationIssue[];
  proposedFields: Record<string, unknown>;
  parsedSemantic: unknown;
  compoundGated: boolean;
  allowForcedConfirm?: boolean;
}) {
  const openForUnit = issuesForUnit(params.issues, params.unitIndex, params.compoundGated);
  return canPromoteUnit({
    unitIndex: params.unitIndex,
    openIssues: openForUnit,
    proposedFields: params.proposedFields,
    parsedSemantic: params.parsedSemantic,
    allowForcedConfirm: params.allowForcedConfirm,
  });
}

export function resolveIssuesAfterInteraction(
  issues: ClarificationIssue[],
  unitIndex: number,
  field: string,
  mode: 'answer' | 'skip',
  answer?: unknown
): ClarificationIssue[] {
  return resolveIssuesAfterField(issues, unitIndex, field, mode, answer);
}

/** 准入未通过时保证仍有下一题可问，避免 next=null 卡死 */
export function ensureNextQuestion(
  issues: ClarificationIssue[],
  unitIndex: number,
  compoundGated: boolean,
  admission: CanPromoteResult
): PendingQuestion | null {
  const existing = nextQuestionForUnit(issues, unitIndex, compoundGated);
  if (existing) return existing;

  if (!admission.allowed && admission.reason?.includes('笼统')) {
    return {
      field: 'action_text',
      prompt: admission.reason,
      kind: 'text',
      clarify_class: 'field_clarify',
      placeholder: '如：跑步、开会、写报告',
    };
  }
  if (!admission.allowed && admission.reason?.includes('未澄清')) {
    return nextQuestionForUnit(issues, unitIndex, compoundGated);
  }
  return null;
}
