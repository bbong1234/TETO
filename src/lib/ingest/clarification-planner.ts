import type { ClarificationIssue } from '@/types/semantic';
import type { PendingQuestion } from '@/types/inputs';

const PRIORITY: ClarificationIssue['type'][] = [
  'item_missing',
  'item_ambiguous',
  'item_suggestion',
  'sub_item_ambiguous',
  'metric_prompt',
  'shared_duration',
  'compound_uncertain',
  'parse_uncertain',
  'boundary_blur',
  'low_confidence',
];

function priorityRank(t: ClarificationIssue['type']): number {
  const i = PRIORITY.indexOf(t);
  return i === -1 ? 999 : i;
}

function toQuestion(issue: ClarificationIssue): PendingQuestion {
  switch (issue.type) {
    case 'item_missing':
    case 'item_ambiguous':
    case 'item_suggestion':
      return {
        field: 'item_id',
        prompt: issue.message || '请选择这条记录的事项',
        kind: 'select',
        clarify_class: 'field_clarify',
        options: issue.options?.map((o) => ({ value: o.value, label: o.label })) ?? [],
      };
    case 'sub_item_ambiguous':
      return {
        field: 'sub_item_id',
        prompt: issue.message || '请选择这条记录的子项',
        kind: 'select',
        clarify_class: 'field_clarify',
        options: issue.options?.map((o) => ({ value: o.value, label: o.label })) ?? [],
      };
    case 'shared_duration':
      return {
        field: 'duration_minutes',
        prompt: issue.message || '请补充时长（分钟）',
        kind: 'number',
        clarify_class: 'field_clarify',
      };
    case 'metric_prompt':
      return {
        field: issue.metricName ? `metric:${issue.metricName}` : 'metric_value',
        prompt: issue.message || `请补充${issue.metricName || '指标'}数值`,
        kind: 'number',
        clarify_class: 'field_clarify',
      };
    case 'compound_uncertain':
      return {
        field: '_confirm',
        prompt:
          issue.message ||
          '检测到多件独立事件，确认拆分分别保存？',
        kind: 'select',
        clarify_class: 'compound_confirm',
        options: [
          { value: 'split', label: '拆分保存（分别生成多条记录）' },
          { value: 'keep_single', label: '不拆分（按原文保存为一条）' },
          { value: 'cancel', label: '取消本次录入' },
          {
            value: 'defer',
            label: '暂时不确认（先收起）',
          },
        ],
      };
    case 'boundary_blur':
      return {
        field: '_confirm',
        prompt: issue.message || '归类边界不太确定，请选择',
        kind: 'select',
        clarify_class: 'boundary_confirm',
        options: [
          { value: 'confirm', label: '按当前解析保存' },
          { value: 'rewrite', label: '取消本次录入，我重新描述' },
        ],
      };
    default:
      return {
        field: '_confirm',
        prompt: issue.message || 'AI 对这条输入不够确定，请二选一',
        kind: 'select',
        clarify_class: 'field_clarify',
        clarify_subtype: 'low_confidence_confirm',
        options: [
          { value: 'confirm', label: '确认保存（按当前解析）' },
          { value: 'rewrite', label: '取消本次录入' },
        ],
      };
  }
}

/** 选择一个 unit 的最高优先级问题（用于渐进引导） */
export function pickPrimaryIssue(issues: ClarificationIssue[], unitIndex: number): ClarificationIssue | null {
  const candidates = issues.filter((i) => {
    if (i.unitIndex === unitIndex) return true;
    // 全局问题（如复合句是否拆开）：只在第一个 unit 上排队展示
    if (i.unitIndex === -1 && unitIndex === 0) return true;
    return false;
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => priorityRank(a.type) - priorityRank(b.type))[0];
}

export function buildPrimaryQuestion(issues: ClarificationIssue[], unitIndex: number): PendingQuestion | null {
  const issue = pickPrimaryIssue(issues, unitIndex);
  return issue ? toQuestion(issue) : null;
}

