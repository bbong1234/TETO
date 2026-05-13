/**
 * computation/index.ts — TETO 计算中心 (COMPUTATION)
 *
 * 统一声明系统中所有统计口径和计算参数，其他模块只认这个接口。
 * 不含运行时逻辑，纯声明层。
 *
 * 4 大子模块：
 * 1. metrics — 核心指标定义（活跃度/投入/停滞/计划达成率/效果）
 * 2. time_windows — 时间窗口参数（热力图天数、对比周期等）
 * 3. data_scope — 数据范围参数（停滞阈值、活跃事项状态等）
 * 4. comparison — 周期对比参数（7天/30天窗口、工作时段范围等）
 *
 * 与 P4 的关系：P4 的 CORE_METRICS 是运行时指标注册表，
 * COMPUTATION 补充的是口径参数（阈值、权重、时间窗口）。
 */

import { CORE_METRICS } from '@/lib/stats/metric-definitions';

// ═══════════════════════════════════════════════════════════
// 版本号（TETO 1.6）
// ═══════════════════════════════════════════════════════════

/** 计算中心语义版本号 */
export const COMPUTATION_VERSION = '1.6.0';

/** 计算子模块编号 */
export const COMPUTATION_IDS = {
  metrics: 'C-METRIC-001',
  time_windows: 'C-TIMEWIN-001',
  data_scope: 'C-SCOPE-001',
  comparison: 'C-COMPARE-001',
} as const;

// ================================
// 1. metrics — 核心指标口径参数
// ================================

/** 活跃度计算权重 */
export const COMPUTATION_ACTIVITY_WEIGHTS = {
  /** 最近7天记录数权重 */
  recent_7d: 0.4,
  /** 最近30天记录频率权重 */
  freq_30d: 0.3,
  /** 距今天数权重 */
  recency: 0.3,
} as const;

/** 活跃度计算：7天记录数标准化分母 */
export const COMPUTATION_ACTIVITY_7D_DENOMINATOR = 10;

/** 活跃度计算：30天记录数标准化分母 */
export const COMPUTATION_ACTIVITY_30D_DENOMINATOR = 30;

/** 停滞等级阈值（天） */
export const COMPUTATION_STAGNATION_THRESHOLDS = {
  /** 0~7 天 = 活跃 */
  active: 7,
  /** 8~14 天 = 轻度停滞 */
  mild: 14,
  /** 15~30 天 = 中度停滞 */
  moderate: 30,
  /** >30 天 = 重度停滞 */
} as const;

/** 投入计算权重 */
export const COMPUTATION_EFFORT_WEIGHTS = {
  /** 时长权重 */
  duration: 0.7,
  /** 记录数权重 */
  record_count: 0.3,
} as const;

// ================================
// 2. time_windows — 时间窗口参数
// ================================

/** 活跃热力图回溯天数 */
export const COMPUTATION_HEATMAP_DAYS_BACK = 180;

/** 周期对比窗口 */
export const COMPUTATION_PERIOD_WINDOWS = {
  /** 短窗口：7 天 */
  short: 7,
  /** 长窗口：30 天 */
  long: 30,
} as const;

/** 近期记录回溯天数（用于 AI 增强上下文） */
export const COMPUTATION_RECENT_RECORDS_DAYS_BACK = 3;

// ================================
// 3. data_scope — 数据范围参数
// ================================

/** 停滞事项筛选：超过此天数无记录才视为停滞 */
export const COMPUTATION_STAGNANT_ITEM_MIN_DAYS = 14;

/** 活跃事项状态（用于事项匹配/统计范围） */
export const COMPUTATION_ACTIVE_ITEM_STATUSES = ['活跃', '推进中', '放缓'] as const;

/**
 * TETO 1.6 数据准入规则：只有 confirmed/corrected 的数据才能进入 insight 统计口径。
 * unchecked（待确认）和 disputed（争议）的数据被排除。
 */
export const COMPUTATION_DATA_ADMISSION = {
  /** 统计口径包含的 review_status */
  admittedReviewStatuses: ['confirmed', 'corrected'] as const,
  /** 统计口径排除的 review_status */
  excludedReviewStatuses: ['unchecked', 'disputed'] as const,
} as const;

/** 目标周期天数映射 */
export const COMPUTATION_PERIOD_DAYS: Record<string, number> = {
  '每天': 1,
  '每周': 7,
  '本周': 7,
  '每月': 30,
  '本月': 30,
  '每年': 365,
};

// ================================
// 4. comparison — 周期对比参数
// ================================

/** 工作时段定义（小时范围） */
export const COMPUTATION_TIME_DISTRIBUTION_RANGES = {
  /** 早上：6-12 点 */
  morning: { start: 6, end: 12 },
  /** 下午：12-18 点 */
  afternoon: { start: 12, end: 18 },
  /** 晚上：18-22 点 */
  evening: { start: 18, end: 22 },
  /** 夜间：22-6 点 */
  night: { start: 22, end: 6 },
} as const;

// ================================
// 聚合导出：COMPUTATION 常量对象
// ================================

/**
 * COMPUTATION — 计算中心统一接口
 *
 * 所有模块通过 COMPUTATION.xxx 读取统计口径定义，
 * 不再直接硬编码 magic number。
 */
export const COMPUTATION = {
  version: COMPUTATION_VERSION,
  ids: COMPUTATION_IDS,
  metrics: {
    core: CORE_METRICS,
    activity_weights: COMPUTATION_ACTIVITY_WEIGHTS,
    activity_7d_denominator: COMPUTATION_ACTIVITY_7D_DENOMINATOR,
    activity_30d_denominator: COMPUTATION_ACTIVITY_30D_DENOMINATOR,
    stagnation_thresholds: COMPUTATION_STAGNATION_THRESHOLDS,
    effort_weights: COMPUTATION_EFFORT_WEIGHTS,
  },
  time_windows: {
    heatmap_days_back: COMPUTATION_HEATMAP_DAYS_BACK,
    period_windows: COMPUTATION_PERIOD_WINDOWS,
    recent_records_days_back: COMPUTATION_RECENT_RECORDS_DAYS_BACK,
  },
  data_scope: {
    stagnant_item_min_days: COMPUTATION_STAGNANT_ITEM_MIN_DAYS,
    active_item_statuses: COMPUTATION_ACTIVE_ITEM_STATUSES,
    period_days: COMPUTATION_PERIOD_DAYS,
    admission: COMPUTATION_DATA_ADMISSION,
  },
  comparison: {
    time_distribution_ranges: COMPUTATION_TIME_DISTRIBUTION_RANGES,
  },
} as const;
