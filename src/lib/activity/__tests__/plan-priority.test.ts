import { describe, expect, it } from 'vitest';
import {
  getPlanPriority,
  planPriorityToSubcategory,
  sortPlansByPriority,
} from '../plan-priority';
import type { Record as TetoRecord } from '@/types/teto';

function plan(id: string, subcategory: string | null): TetoRecord {
  return {
    id,
    user_id: 'u',
    record_day_id: 'd',
    content: id,
    type: '计划',
    occurred_at: null,
    status: null,
    mood: null,
    energy: null,
    result: null,
    note: null,
    item_id: null,
    goal_id: null,
    phase_id: null,
    sub_item_id: null,
    sort_order: 0,
    is_starred: false,
    cost: null,
    metric_value: null,
    metric_unit: null,
    metric_name: null,
    duration_minutes: null,
    lifecycle_status: 'active',
    subcategory,
    created_at: '',
    updated_at: '',
  };
}

describe('plan priority', () => {
  it('roundtrips via subcategory', () => {
    expect(getPlanPriority(plan('1', planPriorityToSubcategory('high')))).toBe('high');
  });

  it('sorts high before low', () => {
    const sorted = sortPlansByPriority([
      plan('low', planPriorityToSubcategory('low')),
      plan('high', planPriorityToSubcategory('high')),
    ]);
    expect(sorted[0].id).toBe('high');
  });
});
