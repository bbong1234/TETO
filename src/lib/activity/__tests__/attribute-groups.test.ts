import { describe, expect, it } from 'vitest';
import type { RecordEditFormState } from '../record-form';
import {
  attributeGroupHasValue,
  formatAttributeGroupSummary,
  visibleAttributeGroups,
} from '../attribute-groups';

const emptyForm = (): RecordEditFormState => ({
  content: '',
  type: '发生',
  tagIds: [],
  activityContext: { categoryItemId: '', itemId: '', subItemId: '', phaseId: '' },
  recordDate: '2026-07-05',
  occurredAt: '',
  occurredAtEnd: '',
  mood: '',
  energy: '',
  status: '',
  notes: [''],
  location: '',
  peopleStr: '',
  cost: '',
  metricName: '',
  metricValue: '',
  metricUnit: '',
  durationMinutes: '',
  actionText: '',
  eventText: '',
  objectText: '',
  outcomeType: '',
  outcomeDirection: '',
  causeText: '',
  timeText: '',
  timePrecision: '',
  placeType: '',
  moneyDirection: '',
  relationRolesStr: '',
  bodyState: '',
  moneyCurrency: '',
  relatedObjectsStr: '',
  resultText: '',
  toolLabel: '',
  financeAccount: '',
  financeAccountId: '',
  transferToAccountId: '',
  rawInput: '',
  goalId: '',
});

describe('attribute-groups', () => {
  it('detects bodyMind values', () => {
    const form = { ...emptyForm(), bodyState: '累', mood: '3' };
    expect(attributeGroupHasValue(form, 'bodyMind')).toBe(true);
    expect(formatAttributeGroupSummary(form, 'bodyMind')).toContain('累');
  });

  it('visibleAttributeGroups only returns filled groups', () => {
    const form = { ...emptyForm(), location: '家', placeType: 'home' };
    const visible = visibleAttributeGroups(form);
    expect(visible.map((g) => g.id)).toEqual(['place']);
  });
});
