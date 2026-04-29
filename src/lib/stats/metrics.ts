/**
 * metrics.ts — TETO 1.5 统计口径统一定义层
 *
 * 所有洞察/统计页面使用的核心指标必须经过此层，
 * 保证同一指标在不同图表/组件中口径一致。
 *
 * 5 个核心指标：
 * 1. 活跃度 — 按最近更新时间 + 记录频率综合
 * 2. 投入 — 按时长为主，记录条数为辅
 * 3. 停滞 — 连续 N 天无记录
 * 4. 计划达成率 — 按时完成比例
 * 5. 效果 — 按结果记录 + 目标结果字段综合
 */

// ================================
// 口径定义
// ================================

export interface MetricDefinition {
  /** 指标ID */
  id: string;
  /** 显示名称 */
  label: string;
  /** 计算方式说明 */
  formula: string;
  /** 时间范围约束 */
  timeScope: 'any' | 'recent_7d' | 'recent_30d';
  /** 数据纳入范围 */
  includeScope: {
    /** 包含的记录类型 */
    recordTypes: string[];
    /** 是否包含推断数据（data_nature='inferred'） */
    includeInferred: boolean;
    /** 计算方式：按记录数/时长/结果值 */
    computeBy: 'count' | 'duration' | 'value' | 'composite';
  };
  /** 单位 */
  unit: string;
}

/** 5 大核心口径定义 */
export const CORE_METRICS: Record<string, MetricDefinition> = {
  activity: {
    id: 'activity',
    label: '活跃度',
    formula: '(最近7天记录数 × 0.4) + (最近30天记录频率 × 0.3) + (距今天数权重 × 0.3)',
    timeScope: 'recent_30d',
    includeScope: {
      recordTypes: ['发生', '计划', '总结'],
      includeInferred: false,
      computeBy: 'composite',
    },
    unit: '分',
  },
  effort: {
    id: 'effort',
    label: '投入',
    formula: '总时长（分钟）为主，记录条数为辅。投入 = 总时长 × 0.7 + 记录数 × 0.3',
    timeScope: 'any',
    includeScope: {
      recordTypes: ['发生', '计划', '总结'],
      includeInferred: false,
      computeBy: 'composite',
    },
    unit: '分钟',
  },
  stagnation: {
    id: 'stagnation',
    label: '停滞',
    formula: '连续无记录天数。0=活跃，>7=轻度停滞，>14=中度停滞，>30=重度停滞',
    timeScope: 'recent_30d',
    includeScope: {
      recordTypes: ['发生', '计划', '总结'],
      includeInferred: false,
      computeBy: 'count',
    },
    unit: '天',
  },
  plan_achievement: {
    id: 'plan_achievement',
    label: '计划达成率',
    formula: '按时完成的计划数 / 总计划数 × 100%。过期未完成=未达成，已完成=达成',
    timeScope: 'any',
    includeScope: {
      recordTypes: ['计划'],
      includeInferred: false,
      computeBy: 'count',
    },
    unit: '%',
  },
  effectiveness: {
    id: 'effectiveness',
    label: '效果',
    formula: '有结果的记录数 / 有时长的记录数 × 100%',
    timeScope: 'any',
    includeScope: {
      recordTypes: ['发生', '计划', '总结'],
      includeInferred: false,
      computeBy: 'composite',
    },
    unit: '%',
  },
};

// ================================
// 计算函数
// ================================

export interface ItemStats {
  recordCount7d: number;
  recordCount30d: number;
  totalDurationMinutes: number;
  lastRecordAt: string | null;   // ISO date
  totalPlans: number;
  completedPlans: number;
  recordsWithResult: number;
  recordsWithDuration: number;
}

/** 计算活跃度得分（0~100） */
export function computeActivity(stats: ItemStats): number {
  const now = new Date();
  // 最近7天记录数权重
  const recentScore = Math.min(stats.recordCount7d / 10, 1) * 40;
  // 最近30天记录频率权重
  const freqScore = Math.min(stats.recordCount30d / 30, 1) * 30;
  // 距今天数权重（越近越高）
  let daysSince = 999;
  if (stats.lastRecordAt) {
    daysSince = Math.floor((now.getTime() - new Date(stats.lastRecordAt).getTime()) / 86400000);
  }
  const recencyScore = Math.max(0, 30 - daysSince) / 30 * 30;
  return Math.round(recentScore + freqScore + recencyScore);
}

/** 计算投入量（标准化 0~100） */
export function computeEffort(stats: ItemStats, maxDurationInContext: number): number {
  if (maxDurationInContext <= 0) return 0;
  return Math.round((stats.totalDurationMinutes / maxDurationInContext) * 100);
}

/** 计算停滞天数 */
export function computeStagnation(stats: ItemStats): number {
  if (!stats.lastRecordAt) return 999;
  const now = new Date();
  return Math.floor((now.getTime() - new Date(stats.lastRecordAt).getTime()) / 86400000);
}

/** 停滞等级 */
export function stagnationLevel(days: number): 'active' | 'mild' | 'moderate' | 'severe' {
  if (days <= 7) return 'active';
  if (days <= 14) return 'mild';
  if (days <= 30) return 'moderate';
  return 'severe';
}

/** 计算计划达成率（0~100） */
export function computePlanAchievement(stats: ItemStats): number {
  if (stats.totalPlans === 0) return 0;
  return Math.round((stats.completedPlans / stats.totalPlans) * 100);
}

/** 计算效果比率（0~100） */
export function computeEffectiveness(stats: ItemStats): number {
  if (stats.recordsWithDuration === 0) return 0;
  return Math.round((stats.recordsWithResult / stats.recordsWithDuration) * 100);
}

/** 一次性计算所有5个指标 */
export function computeAllMetrics(
  stats: ItemStats,
  maxDurationInContext: number
): Record<string, { value: number; label: string; unit: string }> {
  return {
    activity: {
      value: computeActivity(stats),
      label: CORE_METRICS.activity.label,
      unit: CORE_METRICS.activity.unit,
    },
    effort: {
      value: computeEffort(stats, maxDurationInContext),
      label: CORE_METRICS.effort.label,
      unit: CORE_METRICS.effort.unit,
    },
    stagnation: {
      value: computeStagnation(stats),
      label: CORE_METRICS.stagnation.label,
      unit: CORE_METRICS.stagnation.unit,
    },
    plan_achievement: {
      value: computePlanAchievement(stats),
      label: CORE_METRICS.plan_achievement.label,
      unit: CORE_METRICS.plan_achievement.unit,
    },
    effectiveness: {
      value: computeEffectiveness(stats),
      label: CORE_METRICS.effectiveness.label,
      unit: CORE_METRICS.effectiveness.unit,
    },
  };
}
