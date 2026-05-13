/**
 * generate-content-summary.ts
 * 基于 ParsedSemantic 生成标准化内容摘要
 *
 * 规则：
 * - 模板：[时间锚点] [地点] [动作] [宾语]
 * - 控制在 20 字以内
 * - 如果 ParsedSemantic 不存在，截取 raw_input 前 30 字兜底
 */

import type { ParsedSemantic } from '@/types/semantic';

/**
 * 从 ParsedSemantic 生成标准化摘要
 * @param unit 语义解析结果
 * @param rawInput 原始输入（兜底用）
 * @returns 标准化摘要字符串
 */
export function generateContentSummary(
  unit: ParsedSemantic | null | undefined,
  rawInput?: string | null
): string {
  if (!unit) {
    return truncateFallback(rawInput, 30);
  }

  // 如果 AI 已生成 main_text，优先使用
  // 但如果 main_text 包含拼音/非中文（AI 幻觉），回退到原始输入
  if (unit.main_text && unit.main_text.trim()) {
    const trimmed = unit.main_text.trim();
    // 检测是否含明显拼音：连续2+小写英文字母（排除常见缩写如 km/kg）
    const hasPinyin = /[a-z]{3,}/.test(trimmed) && !/\b(km|kg|mb|gb|tb)\b/i.test(trimmed);
    if (hasPinyin && rawInput) {
      return truncate(rawInput.trim(), 30);
    }
    return truncate(trimmed, 20);
  }

  const parts: string[] = [];

  // 时间锚点（仅取 raw，如"昨天"、"明天"）
  if (unit.time_anchor?.raw) {
    parts.push(unit.time_anchor.raw);
  }

  // 地点
  if (unit.location) {
    parts.push(`在${unit.location}`);
  }

  // 动作（优先用更丰富的 action_text，兼容旧 action 字段）
  const action = (unit.action_text?.trim() || unit.action?.trim());

  // 宾语（优先用更丰富的 object_text，兼容旧 object 字段）
  const object = (unit.object_text?.trim() || unit.object?.trim());

  // 构建 action + object 部分
  if (action && object) {
    // 量化指标嵌入：如"背50个单词"而非"背单词 50 个"
    if (unit.metric && unit.metric.value != null) {
      const metricStr = `${unit.metric.value}${unit.metric.unit || ''}`;
      // 如果宾语与 metric.name 相似，把数值嵌入
      if (unit.metric.name && object.includes(unit.metric.name)) {
        parts.push(`${action}${metricStr}${unit.metric.name}`);
      } else {
        parts.push(`${action}${metricStr}${object}`);
      }
    } else {
      parts.push(`${action}${object}`);
    }
  } else if (action) {
    if (unit.metric && unit.metric.value != null) {
      const metricStr = `${unit.metric.value}${unit.metric.unit || ''}`;
      parts.push(`${action}${metricStr}`);
    } else {
      parts.push(action);
    }
  } else if (object) {
    parts.push(object);
  }

  const summary = parts.join('');

  if (!summary) {
    return truncateFallback(rawInput, 30);
  }

  // 控制在 20 字以内
  return truncate(summary, 20);
}

/** 截断字符串到 maxLen 字 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** 兜底：截取原始输入 */
function truncateFallback(raw: string | null | undefined, maxLen: number): string {
  if (!raw) return '';
  return truncate(raw, maxLen);
}
