import type { GoalEngineResult } from '@/types/teto';

export type GoalTrackStatus = 'on-track' | 'at-risk' | 'unknown';

export interface GoalPredictionFields {
  predicted_completion_date: string | null;
  current_velocity: number | null;
  required_velocity: number | null;
  on_track: GoalTrackStatus;
  prediction_note: string | null;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 从 goal-engine 结果推导预测字段（纯计算，不改引擎） */
export function deriveGoalPrediction(result: GoalEngineResult): GoalPredictionFields {
  const velocity = result.avg_7d ?? result.daily_average ?? null;
  const required = result.dynamic_daily_pacer ?? null;
  const today = todayStr();

  let predictedDate: string | null = null;
  let onTrack: GoalTrackStatus = 'unknown';
  let note: string | null = null;

  if (result.rule_type === '一次性完成') {
    const target = result.total_target ?? 0;
    const remaining = Math.max(0, target - result.total_actual);

    if (velocity != null && velocity > 0 && remaining > 0) {
      const daysNeeded = Math.ceil(remaining / velocity);
      predictedDate = addDays(today, daysNeeded);
      note = `按近7天均速，约 ${daysNeeded} 天后达成`;
    } else if (remaining <= 0 && target > 0) {
      note = '已达成目标';
      onTrack = 'on-track';
    }

    if (result.remaining_days != null && required != null && velocity != null) {
      onTrack = velocity >= required ? 'on-track' : 'at-risk';
      if (!note) {
        note =
          onTrack === 'on-track'
            ? `当前均速 ${round2(velocity)}/${result.unit}/天，满足配速 ${round2(required)}`
            : `需提升至 ${round2(required)} ${result.unit}/天（当前 ${round2(velocity)}）`;
      }
    } else if (predictedDate && result.remaining_days != null) {
      const daysToPredict = Math.max(0, Math.ceil((Date.parse(predictedDate) - Date.parse(today)) / 86400000));
      onTrack = daysToPredict <= result.remaining_days ? 'on-track' : 'at-risk';
    }
  } else if (result.rule_type === '周期性达成') {
    const progress = result.current_period_progress;
    if (progress >= 1) {
      onTrack = 'on-track';
      note = '本周期已达标';
    } else if (progress >= 0.7) {
      onTrack = 'on-track';
      note = `本周期进度 ${Math.round(progress * 100)}%`;
    } else if (progress < 0.4) {
      onTrack = 'at-risk';
      note = `本周期进度 ${Math.round(progress * 100)}%，节奏偏慢`;
    } else {
      onTrack = 'unknown';
      note = `本周期进度 ${Math.round(progress * 100)}%`;
    }

    if (velocity != null && result.current_period_target > 0) {
      const periodRemaining = Math.max(0, result.current_period_target - result.current_period_actual);
      if (velocity > 0 && periodRemaining > 0) {
        const daysNeeded = Math.ceil(periodRemaining / velocity);
        predictedDate = addDays(today, daysNeeded);
      }
    }
  } else if (result.rule_type === '周期性限制') {
    if (result.is_over_limit) {
      onTrack = 'at-risk';
      note = '本期已超限';
    } else if (result.projected_period_total != null && result.current_period_target > 0) {
      onTrack = result.projected_period_total <= result.current_period_target ? 'on-track' : 'at-risk';
      note = `预计本期 ${round2(result.projected_period_total)} ${result.unit}`;
    }
  }

  return {
    predicted_completion_date: predictedDate,
    current_velocity: velocity != null ? round2(velocity) : null,
    required_velocity: required != null ? round2(required) : null,
    on_track: onTrack,
    prediction_note: note,
  };
}
