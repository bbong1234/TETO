import { describe, it, expect } from 'vitest';
import {
  canPromoteUnit,
  resolveIssuesAfterField,
  applyFieldAnswerToProposed,
  buildEffectiveUnitSemantic,
} from '../admission';
import type { ClarificationIssue } from '@/types/semantic';

describe('admission', () => {
  it('blocks promote when open issues remain', () => {
    const issues: ClarificationIssue[] = [
      { type: 'action_vague', unitIndex: 0, message: 'm', reason: 'r' },
    ];
    const r = canPromoteUnit({
      unitIndex: 0,
      openIssues: issues,
      proposedFields: { action_text: '做' },
    });
    expect(r.allowed).toBe(false);
  });

  it('blocks promote when action still vague after proposed merge', () => {
    const r = canPromoteUnit({
      unitIndex: 0,
      openIssues: [],
      proposedFields: { type: '发生', action_text: '做', duration_minutes: 30 },
      parsedSemantic: { action_text: '做' },
    });
    expect(r.allowed).toBe(false);
  });

  it('allows forced confirm despite vague action in parsed semantic', () => {
    const r = canPromoteUnit({
      unitIndex: 0,
      openIssues: [],
      proposedFields: { action_text: '做' },
      parsedSemantic: { action_text: '做' },
      allowForcedConfirm: true,
    });
    expect(r.allowed).toBe(true);
  });

  it('resolveIssuesAfterField removes parse_uncertain on _confirm confirm', () => {
    const issues = [
      { type: 'parse_uncertain' as const, unitIndex: 0, message: 'm', reason: 'r' },
    ];
    const next = resolveIssuesAfterField(issues, 0, '_confirm', 'answer', 'confirm');
    expect(next).toHaveLength(0);
  });

  it('allows promote when action clarified', () => {
    const r = canPromoteUnit({
      unitIndex: 0,
      openIssues: [],
      proposedFields: { action_text: '跑步', duration_minutes: 30 },
      parsedSemantic: { action_text: '做' },
    });
    expect(r.allowed).toBe(true);
  });

  it('resolveIssuesAfterField removes item_ambiguous on item_id answer', () => {
    const issues: ClarificationIssue[] = [
      { type: 'item_ambiguous', unitIndex: 0, message: 'm', reason: 'r' },
    ];
    const next = resolveIssuesAfterField(issues, 0, 'item_id', 'answer', 'item-1');
    expect(next).toHaveLength(0);
  });

  it('applyFieldAnswerToProposed handles item none', () => {
    const p = applyFieldAnswerToProposed({ item_id: 'x' }, 'item_id', 'none');
    expect(p.item_id).toBeUndefined();
    expect(p.item_id_explicit_none).toBe(true);
  });

  it('buildEffectiveUnitSemantic prefers proposed action_text', () => {
    const u = buildEffectiveUnitSemantic({ action_text: '做' }, { action_text: '跑步' });
    expect(u.action_text).toBe('跑步');
  });
});
