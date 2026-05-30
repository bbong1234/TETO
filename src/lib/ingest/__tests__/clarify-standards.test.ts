import { describe, it, expect } from 'vitest';
import {
  isVagueActionText,
  shouldRaiseActionVague,
  guardRecordType,
  mergeClarificationIssues,
  buildItemMissingIssue,
  resolveRecordTypeForUnit,
  recordTypeNeedsActionClarify,
} from '../clarify-standards';
import type { ClarificationIssue } from '@/types/semantic';

describe('clarify-standards', () => {
  it('detects vague action 做', () => {
    expect(isVagueActionText('做')).toBe(true);
    expect(isVagueActionText('做了')).toBe(true);
    expect(isVagueActionText('跑步')).toBe(false);
  });

  it('shouldRaiseActionVague for 下午做了30分钟-like unit', () => {
    const unit = {
      action_text: '做',
      duration_minutes: 30,
      time_text: '下午',
    };
    expect(shouldRaiseActionVague(unit)).toBe(true);
  });

  it('does not raise action_vague for 跑步', () => {
    const unit = { action_text: '跑步', duration_minutes: 30 };
    expect(shouldRaiseActionVague(unit)).toBe(false);
  });

  it('guardRecordType corrects 总结 to 发生 when concrete action present', () => {
    const r = guardRecordType({
      typeHint: '总结',
      fieldsType: undefined,
      rawContent: '今天下午跑步30分钟',
      unitText: '跑步30分钟',
    });
    expect(r.type).toBe('发生');
    expect(r.corrected).toBe(true);
  });

  it('maps 总结 to 想法 when summary discourse present', () => {
    const r = guardRecordType({
      typeHint: '总结',
      rawContent: '今天整体效率一般，上午一直被打断',
    });
    expect(r.type).toBe('想法');
    expect(r.corrected).toBe(true);
  });

  it('mergeClarificationIssues keeps phase B after compound gate', () => {
    const compound: ClarificationIssue = {
      type: 'compound_uncertain',
      unitIndex: -1,
      message: 'split?',
      reason: 'multi',
    };
    const item: ClarificationIssue = {
      type: 'item_missing',
      unitIndex: 1,
      message: 'item?',
      reason: 'none',
    };
    const merged = mergeClarificationIssues([item], compound);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('compound_uncertain');
    expect(merged[1].type).toBe('item_missing');
  });

  it('resolveRecordTypeForUnit treats 我觉得 as 想法', () => {
    const t = resolveRecordTypeForUnit({
      typeHint: '发生',
      rawContent: '我觉得今天中午的饭不好吃',
      unitText: '觉得午饭不好吃',
    });
    expect(t).toBe('想法');
    expect(recordTypeNeedsActionClarify(t)).toBe(false);
  });

  it('buildItemMissingIssue returns options', () => {
    const issue = buildItemMissingIssue(0, [{ id: 'a', title: '跑步' }]);
    expect(issue?.type).toBe('item_missing');
    expect(issue?.options?.[0].value).toBe('a');
  });
});
