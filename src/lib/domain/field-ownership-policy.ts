/**
 * 字段所有权校验 — 根据策略决定 AI 可写入哪些字段
 *
 * 核心逻辑：
 * 1. 遍历 aiUpdate 的每个字段
 * 2. 查找该字段的 policy
 * 3. 根据 aiCanWrite / overwriteRule 决定是否允许写入
 * 4. 返回 allowedUpdate（允许写入的字段）+ AiWriteResult（变更追踪）
 */

import type { AiFieldPolicy } from './ai-write-policy'

export interface AiWriteResult {
  changedFields: string[]           // AI 实际修改的字段列表
  skippedFields: string[]           // AI 尝试但被策略跳过的字段
  skippedReasons: Record<string, string>  // field → reason
  reviewFields: string[]            // 需要用户审核的字段
}

/**
 * 判断字段是否为"空值"（null / undefined / 空字符串 / 空数组）
 */
function isEmptyValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * 根据字段所有权策略，过滤 AI 更新载荷
 *
 * @param existingRecord 当前记录的完整数据
 * @param aiUpdate AI 尝试写入的字段集合
 * @param policies 字段策略定义（通常为 AI_FIELD_POLICIES）
 * @returns allowedUpdate: 允许写入的字段 + result: AiWriteResult 变更追踪
 */
export function applyFieldOwnershipPolicy(
  existingRecord: Record<string, any>,
  aiUpdate: Record<string, any>,
  policies: Record<string, AiFieldPolicy>
): { allowedUpdate: Record<string, any>; result: AiWriteResult } {
  const allowedUpdate: Record<string, any> = {}
  const result: AiWriteResult = {
    changedFields: [],
    skippedFields: [],
    skippedReasons: {},
    reviewFields: [],
  }

  for (const [field, value] of Object.entries(aiUpdate)) {
    const policy = policies[field]

    // 无策略定义的字段：默认不允许 AI 写入
    if (!policy) {
      result.skippedFields.push(field)
      result.skippedReasons[field] = '字段无 AI 写入策略定义'
      continue
    }

    // aiCanWrite=false → 跳过
    if (!policy.aiCanWrite) {
      result.skippedFields.push(field)
      result.skippedReasons[field] = `字段 ${field} 不允许 AI 写入 (owner: ${policy.owner})`
      continue
    }

    // overwriteRule 检查
    switch (policy.overwriteRule) {
      case 'never':
        // parsed_semantic 等自有字段：never 表示永不覆写已有值
        if (!isEmptyValue(existingRecord[field])) {
          result.skippedFields.push(field)
          result.skippedReasons[field] = `字段 ${field} 已有值，策略为 never 不覆写`
          continue
        }
        break

      case 'if_empty':
        // 只在字段为空时写入（当前 OFFE 行为）
        if (!isEmptyValue(existingRecord[field])) {
          result.skippedFields.push(field)
          result.skippedReasons[field] = `字段 ${field} 已有值，策略为 if_empty 跳过`
          continue
        }
        break

      case 'if_unconfirmed':
        // 只在 review_status≠'confirmed'/'corrected' 时写入
        if (existingRecord.review_status === 'confirmed' || existingRecord.review_status === 'corrected') {
          result.skippedFields.push(field)
          result.skippedReasons[field] = `字段 ${field} 已确认(review_status=${existingRecord.review_status})，策略为 if_unconfirmed 跳过`
          continue
        }
        break
    }

    // 通过所有检查 → 允许写入
    allowedUpdate[field] = value
    result.changedFields.push(field)

    // 如果字段需要审核 → 加入 reviewFields
    if (policy.requiresReview) {
      result.reviewFields.push(field)
    }
  }

  return { allowedUpdate, result }
}
