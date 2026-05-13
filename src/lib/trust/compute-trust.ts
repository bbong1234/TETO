/**
 * TETO 1.6 字段可信度计算引擎
 *
 * 可信度分级：
 *   trusted  — source='user_input' + review_status='confirmed' + 无 corrections
 *   reviewed  — 有 corrections 记录（用户修正过）
 *   unchecked — source='ai_inferred' 且无 corrections（AI 推断但用户未确认）
 *   disputed  — review_status='disputed' 或用户明确标记为不可信
 *
 * 约束（原则1/2/10）：此计算在服务端完成，前端只展示 TrustBadge。
 */

import type { Record } from '@/types/teto';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type TrustLevel = 'trusted' | 'reviewed' | 'unchecked' | 'disputed';

export interface TrustResult {
  level: TrustLevel;
  sourceType: string;
  confidence: number | null;
  correctionCount: number;
  lastCorrectedAt?: string;
}

// ═══════════════════════════════════════════════════════════
// 计算逻辑
// ═══════════════════════════════════════════════════════════

/**
 * 根据记录数据计算可信度
 *
 * @param record - 记录对象（含 review_status, data_nature 等字段）
 * @param correctionCount - 该记录的 corrections 表记录数（调用方传入）
 */
export function computeTrustLevel(
  record: Pick<Record, 'review_status' | 'data_nature' | 'input_source' | 'confidence_level'>,
  correctionCount = 0,
  lastCorrectedAt?: string
): TrustResult {
  const sourceType = record.input_source ?? (record.data_nature === 'inferred' ? 'ai_inferred' : 'user_input');
  const confidence = record.confidence_level
    ? record.confidence_level === 'high' ? 0.9 : record.confidence_level === 'medium' ? 0.6 : 0.3
    : null;

  let level: TrustLevel;

  // 有争议的 → disputed
  if (record.review_status === 'disputed' || correctionCount > 5) {
    level = 'disputed';
  }
  // 有用户修正的 → reviewed
  else if (correctionCount > 0 || record.review_status === 'corrected') {
    level = 'reviewed';
  }
  // AI 推断且未确认的 → unchecked
  else if (record.data_nature === 'inferred' || record.input_source === 'ai') {
    level = 'unchecked';
  }
  // 用户输入且确认的 → trusted
  else if (record.review_status === 'confirmed' || record.input_source === 'manual' || record.input_source === 'quick') {
    level = 'trusted';
  }
  // 默认 → unchecked
  else {
    level = 'unchecked';
  }

  return {
    level,
    sourceType,
    confidence,
    correctionCount,
    ...(lastCorrectedAt ? { lastCorrectedAt } : {}),
  };
}
