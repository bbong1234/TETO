import { describe, it, expect } from 'vitest';
import { deriveGoalPrediction } from '../goal-prediction';
import type { GoalEngineResult } from '@/types/teto';

function baseResult(overrides: Partial<GoalEngineResult> = {}): GoalEngineResult {
  return {
    goal_id: 'g1',
    goal_title: '测试目标',
    rule_type: '一次性完成',
    unit: '个',
    start_date: '2026-01-01',
    total_passed_days: 30,
    remaining_days: 60,
    current_period_start: null,
    current_period_end: null,
    current_period_actual: 0,
    current_period_target: 0,
    current_period_progress: 0,
    today_actual: 1,
    total_actual: 50,
    total_target: 100,
    total_expected: null,
    deficit: null,
    completion_rate: 0.5,
    completion_rate_7d: null,
    completion_rate_30d: null,
    daily_average: 1.5,
    avg_7d: 2,
    avg_30d: 1.8,
    deficit_7d: null,
    deficit_30d: null,
    dynamic_daily_pacer: 0.83,
    is_over_limit: null,
    remaining_budget: null,
    projected_period_total: null,
    weekly_target: null,
    monthly_target: null,
    weekly_projection: null,
    monthly_projection: null,
    ...overrides,
  };
}

describe('deriveGoalPrediction', () => {
  it('一次性完成：按均速推算剩余天数', () => {
    const p = deriveGoalPrediction(baseResult());
    expect(p.current_velocity).toBe(2);
    expect(p.required_velocity).toBe(0.83);
    expect(p.predicted_completion_date).toBeTruthy();
    expect(p.on_track).toBe('on-track');
  });

  it('已达成目标时标记 on-track', () => {
    const p = deriveGoalPrediction(
      baseResult({ total_actual: 100, total_target: 100 })
    );
    expect(p.on_track).toBe('on-track');
    expect(p.prediction_note).toContain('已达成');
  });

  it('周期性达成：按进度判断风险', () => {
    const p = deriveGoalPrediction(
      baseResult({
        rule_type: '周期性达成',
        current_period_progress: 0.3,
        current_period_actual: 3,
        current_period_target: 10,
      })
    );
    expect(p.on_track).toBe('at-risk');
  });
});
