import type { TaskType, TaskDefinition, TaskRecordFormValues, TaskGoal } from '@/types/tasks';

/**
 * 根据任务类型获取默认单位
 */
export function getDefaultUnit(type: TaskType): string {
  switch (type) {
    case 'count':
      return '次';
    case 'number':
      return '个';
    default:
      return '';
  }
}

/**
 * 计算任务完成度
 * @param task 任务定义
 * @param record 任务记录
 * @param goal 目标值（可选）
 * @param accumulatedValue 周期内累计值（可选）
 * @returns 完成度百分比
 */
export function calculateCompletion(
  task: TaskDefinition, 
  record: TaskRecordFormValues, 
  goal?: TaskGoal | null,
  accumulatedValue?: { booleanValue: boolean; numberValue: number }
): number {
  // 布尔类型任务：完成即100%，未完成即0%
  if (task.task_type === 'boolean') {
    return record.value_boolean ? 100 : 0;
  }
  
  // 数值类型任务
  const currentValue = accumulatedValue?.numberValue ?? (record.value_number ?? 0);
  
  // 如果没有目标值，或目标值为0，或目标值未启用，则无法计算完成度
  if (!goal || !goal.is_enabled || goal.goal_value <= 0) {
    return currentValue > 0 ? 50 : 0; // 无目标值时，有值显示50%，无值显示0%
  }
  
  // 基于目标值计算完成度
  const completion = (currentValue / goal.goal_value) * 100;
  
  // 只限制下限为0%，不限制上限
  return Math.max(completion, 0);
}

/**
 * 获取完成度颜色
 * @param completion 完成度百分比
 * @returns 颜色类名
 */
export function getCompletionColor(completion: number): string {
  if (completion >= 100) return 'bg-green-600';
  if (completion >= 80) return 'bg-blue-500';
  if (completion >= 50) return 'bg-yellow-500';
  if (completion >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * 格式化完成度显示
 * @param completion 完成度百分比
 * @returns 格式化后的字符串
 */
export function formatCompletion(completion: number): string {
  return `${Math.round(completion)}%`;
}
