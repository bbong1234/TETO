/**
 * TETO 1.6 统计资格统一判定
 *
 * 双口径（stats-eligibility）：
 *   display — 排除 cancelled 和 period_rule，其他全含（面向用户展示）
 *   insight  — 在 display 基础上额外排除 unchecked + inferred + 非发生/总结类型（面向统计分析）
 *
 * 约束（原则1/6）：此判定在服务端完成，前端不自算。Agent 不能覆盖此判定。
 */

import type { Record } from '@/types/teto';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type EligibilityCaliber = 'display' | 'insight';

export interface EligibilityResult {
  eligible: boolean;
  caliber: EligibilityCaliber;
  /** 不合格原因（仅当 eligible=false 时有值） */
  exclusionReason?: string;
}

// ═══════════════════════════════════════════════════════════
// 单记录判定
// ═══════════════════════════════════════════════════════════

/**
 * 判断单条记录是否在指定口径下具备统计资格
 */
export function isEligible(
  record: Pick<
    Record,
    'type' | 'lifecycle_status' | 'data_nature' | 'is_period_rule' | 'review_status'
  >,
  caliber: EligibilityCaliber = 'display'
): EligibilityResult {
  const reasons: string[] = [];

  // display 和 insight 共同排除项
  if (record.lifecycle_status === 'cancelled') {
    reasons.push('记录已取消');
  }
  if (record.is_period_rule === true) {
    reasons.push('为规律概括记录（非实际发生）');
  }

  // insight 额外排除项
  if (caliber === 'insight') {
    if (!['发生', '总结'].includes(record.type)) {
      reasons.push(`记录类型为"${record.type}"，非"发生"或"总结"`);
    }
    if (record.data_nature === 'inferred') {
      reasons.push('数据性质为 AI 推断（inferred）');
    }
    if (record.review_status === 'unchecked') {
      reasons.push('审核状态为未确认（unchecked）');
    }
    if (record.review_status === 'disputed') {
      reasons.push('审核状态为争议（disputed）');
    }
  }

  return {
    eligible: reasons.length === 0,
    caliber,
    ...(reasons.length > 0 ? { exclusionReason: reasons.join('；') } : {}),
  };
}

// ═══════════════════════════════════════════════════════════
// 查询口径映射（与 record-filters 对齐）
// ═══════════════════════════════════════════════════════════

/**
 * 获取 display 口径的 SQL WHERE 片段（供 buildStatsQuery 调用）
 * 注：实际查询口径由 buildStatsQuery 中的 MetricDefinition 决定，
 *     此处列出的是逻辑定义，供文档和 diagnose API 使用。
 */
export const DISPLAY_EXCLUSIONS = {
  lifecycleStatus: ['cancelled'],
  isPeriodRule: [true],
} as const;

export const INSIGHT_EXCLUSIONS = {
  ...DISPLAY_EXCLUSIONS,
  types: ['计划', '想法'], // 排除计划/想法，只留 发生/总结
  dataNature: ['inferred'],
  reviewStatus: ['unchecked', 'disputed'], // TETO 1.6: 只有 confirmed/corrected 可进入统计口径
} as const;
