import { describe, it, expect } from 'vitest';
import {
  buildPrimaryQuestion,
  buildPrimaryQuestionAfterCompound,
  issuesAfterCompoundGate,
} from '../clarification-planner';
import type { ClarificationIssue } from '@/types/semantic';

describe('clarification-planner', () => {
  const compound: ClarificationIssue = {
    type: 'compound_uncertain',
    unitIndex: -1,
    message: '拆分?',
    reason: 'multi',
  };
  const itemMissing: ClarificationIssue = {
    type: 'item_missing',
    unitIndex: 1,
    message: '事项?',
    reason: 'none',
    options: [{ label: '跑步', value: 'id1' }],
  };

  it('unit 0 gets compound first', () => {
    const q = buildPrimaryQuestion([compound, itemMissing], 0);
    expect(q?.field).toBe('_confirm');
    expect(q?.clarify_class).toBe('compound_confirm');
  });

  it('unit 1 gets item_missing when in full issues list', () => {
    const q = buildPrimaryQuestion([compound, itemMissing], 1);
    expect(q?.field).toBe('item_id');
  });

  it('parse_uncertain maps to action_text input', () => {
    const parseIssue: ClarificationIssue = {
      type: 'parse_uncertain',
      unitIndex: 0,
      message: 'AI 未能识别核心动作',
      reason: 'no action',
    };
    const q = buildPrimaryQuestion([parseIssue], 0);
    expect(q?.field).toBe('action_text');
    expect(q?.kind).toBe('text');
  });

  it('after compound gate unit 0 can get non-compound question', () => {
    const action: ClarificationIssue = {
      type: 'action_vague',
      unitIndex: 0,
      message: '做什么?',
      reason: 'vague',
    };
    const gated = issuesAfterCompoundGate([compound, action]);
    expect(gated).toHaveLength(1);
    const q = buildPrimaryQuestionAfterCompound([compound, action], 0);
    expect(q?.field).toBe('action_text');
  });
});
