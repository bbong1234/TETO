// 任务类型定义
export type TaskType = 'boolean' | 'count' | 'number';

// 任务状态
export type TaskStatus = 'active' | 'inactive';

// 目标周期类型
export type GoalPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

// 目标值接口
export interface TaskGoal {
  id: string;
  user_id: string;
  task_id: string;
  goal_value: number;
  period: GoalPeriod;
  custom_period_days?: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 目标值表单值接口
export interface TaskGoalFormValues {
  goal_value?: number;
  period?: GoalPeriod;
  custom_period_days?: number;
  is_enabled?: boolean;
}

// 任务定义接口
export interface TaskDefinition {
  id: string;
  user_id: string;
  name: string;
  task_type: TaskType;
  unit_name: string;
  include_in_stats: boolean;
  include_in_completion: boolean;
  include_in_project: boolean;
  project_id: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  // 排序字段
  sort_order?: number;
  // 时间相关字段
  start_date?: string;
  end_date?: string;
  is_long_term?: boolean;
}

// 任务记录接口
export interface TaskRecord {
  id: string;
  user_id: string;
  task_id: string;
  record_date: string;
  value_boolean?: boolean;
  value_number?: number;
  created_at: string;
  updated_at: string;
}

// 任务记录表单值
export interface TaskRecordFormValues {
  value_boolean?: boolean;
  value_number?: number;
}

// 新建任务表单值
export interface NewTaskFormValues {
  name: string;
  task_type: TaskType;
  unit_name: string;
  include_in_stats?: boolean;
  include_in_completion?: boolean;
  include_in_project?: boolean;
  project_id?: string | null;
  // 时间相关字段
  start_date?: string;
  end_date?: string;
  is_long_term?: boolean;
}
