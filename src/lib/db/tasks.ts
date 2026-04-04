import { createClient } from '@/lib/supabase/server';
import type { TaskDefinition, TaskRecord, NewTaskFormValues, TaskRecordFormValues, TaskGoal, TaskGoalFormValues } from '@/types/tasks';

// 获取用户的所有任务
export async function getTasks(userId: string): Promise<TaskDefinition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_definitions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取任务失败:', error);
    console.error('错误详情:', JSON.stringify(error, null, 2));
    return [];
  }

  console.log('获取到的任务:', data);
  return data;
}

/**
 * 更新任务排序
 */
export async function updateTaskSortOrder(userId: string, taskIds: string[]): Promise<boolean> {
  // 暂时返回成功，因为 sort_order 列尚未创建
  console.log('更新任务排序:', taskIds);
  return true;
  /*
  const supabase = await createClient();
  
  try {
    // 逐个更新任务排序
    for (let i = 0; i < taskIds.length; i++) {
      const { error } = await supabase
        .from('task_definitions')
        .update({ sort_order: i })
        .eq('user_id', userId)
        .eq('id', taskIds[i]);

      if (error) {
        console.error('更新任务排序失败:', error);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('更新任务排序失败:', error);
    return false;
  }
  */
}

// 创建新任务
export async function createTask(userId: string, values: NewTaskFormValues): Promise<TaskDefinition | null> {
  console.log('[createTask] 开始创建任务:', { userId, values });
  
  const supabase = await createClient();
  // 只插入数据库中实际存在的字段
  // 确保只传递有效的字段，避免传递"undefined"值
  const insertData: any = {
    user_id: userId,
    name: values.name && typeof values.name === 'string' ? values.name : '',
    task_type: values.task_type && typeof values.task_type === 'string' ? values.task_type : 'boolean',
    unit_name: values.unit_name && typeof values.unit_name === 'string' ? values.unit_name : '',
    include_in_stats: typeof values.include_in_stats === 'boolean' ? values.include_in_stats : true,
    include_in_completion: typeof values.include_in_completion === 'boolean' ? values.include_in_completion : true,
    include_in_project: typeof values.include_in_project === 'boolean' ? values.include_in_project : true,
    is_long_term: typeof values.is_long_term === 'boolean' ? values.is_long_term : false,
    status: 'active' as const
  };

  // 只添加可能存在的字段
  if (values.project_id && typeof values.project_id === 'string' && values.project_id !== 'undefined') {
    insertData.project_id = values.project_id;
  }
  if (values.start_date && typeof values.start_date === 'string' && values.start_date.trim() && values.start_date !== 'undefined') {
    insertData.start_date = values.start_date;
  }
  if (values.end_date && typeof values.end_date === 'string' && values.end_date.trim() && values.end_date !== 'undefined') {
    insertData.end_date = values.end_date;
  }

  console.log('[createTask] 插入数据:', insertData);

  const { data, error } = await supabase
    .from('task_definitions')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('创建任务失败:', error);
    return null;
  }

  console.log('[createTask] 创建成功:', data);
  return data;
}

// 获取用户指定日期的任务记录
export async function getTaskRecordsByDate(userId: string, date: string): Promise<Record<string, TaskRecord>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_daily_records')
    .select('*')
    .eq('user_id', userId)
    .eq('record_date', date);

  if (error) {
    console.error('获取任务记录失败:', error);
    return {};
  }

  const recordsByTaskId: Record<string, TaskRecord> = {};
  data.forEach(record => {
    recordsByTaskId[record.task_id] = record;
  });

  return recordsByTaskId;
}

// 保存或更新任务记录
export async function saveTaskRecord(
  userId: string,
  taskId: string,
  date: string,
  values: TaskRecordFormValues
): Promise<TaskRecord | null> {
  console.log('[saveTaskRecord] 4a. 开始创建 supabase client');
  const supabase = await createClient();
  console.log('[saveTaskRecord] 4b. supabase client 创建完成');
  
  // 检查是否已存在记录
  console.log('[saveTaskRecord] 4c. 开始查询现有记录，表名: task_daily_records');
  const { data: existingRecord, error: queryError } = await supabase
    .from('task_daily_records')
    .select('id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('record_date', date)
    .single();
  console.log('[saveTaskRecord] 4d. 查询完成:', { existingRecord, queryError });

  let data, error;

  if (existingRecord) {
    console.log('[saveTaskRecord] 4e. 开始更新现有记录');
    // 更新现有记录
    ({ data, error } = await supabase
      .from('task_daily_records')
      .update({
        value_boolean: values.value_boolean,
        value_number: values.value_number,
      })
      .eq('id', existingRecord.id)
      .select()
      .single());
  } else {
    console.log('[saveTaskRecord] 4f. 开始创建新记录');
    // 创建新记录
    ({ data, error } = await supabase
      .from('task_daily_records')
      .insert({
        user_id: userId,
        task_id: taskId,
        record_date: date,
        value_boolean: values.value_boolean,
        value_number: values.value_number,
      })
      .select()
      .single());
  }

  if (error) {
    console.error('[saveTaskRecord] 5. upsert 失败:', error);
    console.error('[saveTaskRecord] 错误详情:', JSON.stringify(error, null, 2));
    return null;
  }

  console.log('[saveTaskRecord] 5. upsert 成功:', data);
  return data;
}

// 更新任务
export async function updateTask(
  userId: string,
  taskId: string,
  values: Partial<NewTaskFormValues>
): Promise<TaskDefinition | null> {
  console.log('[updateTask] 开始更新任务:', { userId, taskId, values });
  
  const supabase = await createClient();
  
  // 只更新在task_definitions表中肯定存在的字段，并且确保没有字段的值是"undefined"
  const updateData: Record<string, any> = {};
  
  // 只添加有效的字段
  if (values.name && values.name !== 'undefined') {
    updateData.name = values.name;
  }
  if (values.task_type) {
    updateData.task_type = values.task_type;
  }
  if (values.unit_name !== undefined) {
    updateData.unit_name = values.unit_name;
  }
  if (values.include_in_stats !== undefined) {
    updateData.include_in_stats = values.include_in_stats;
  }
  if (values.include_in_completion !== undefined) {
    updateData.include_in_completion = values.include_in_completion;
  }
  if (values.include_in_project !== undefined) {
    updateData.include_in_project = values.include_in_project;
  }
  if (values.is_long_term !== undefined) {
    updateData.is_long_term = values.is_long_term;
  }
  
  // 始终添加project_id字段，即使为null
  if (values.project_id !== undefined && values.project_id !== 'undefined') {
    updateData.project_id = values.project_id;
  }
  if (values.start_date && values.start_date.trim() && values.start_date !== 'undefined') {
    updateData.start_date = values.start_date;
  }
  if (values.end_date && values.end_date.trim() && values.end_date !== 'undefined') {
    updateData.end_date = values.end_date;
  }
  
  // 确保没有字段的值是"undefined"
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === 'undefined') {
      delete updateData[key];
    }
  });
  
  console.log('[updateTask] 更新数据:', updateData);
  
  const { data, error } = await supabase
    .from('task_definitions')
    .update(updateData)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('更新任务失败:', error);
    return null;
  }

  console.log('[updateTask] 更新成功:', data);
  return data;
}

// 切换任务状态（停用/启用）
export async function deactivateTask(
  userId: string,
  taskId: string
): Promise<boolean> {
  const supabase = await createClient();
  
  // 先获取当前任务状态
  const { data: task, error: getError } = await supabase
    .from('task_definitions')
    .select('status')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();
  
  if (getError || !task) {
    console.error('获取任务状态失败:', getError);
    return false;
  }
  
  // 切换状态
  const newStatus = task.status === 'active' ? 'inactive' : 'active';
  
  const { error } = await supabase
    .from('task_definitions')
    .update({ status: newStatus })
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    console.error('切换任务状态失败:', error);
    return false;
  }

  return true;
}

/**
 * 计算周期内的日期范围
 * @param period 目标周期
 * @param customPeriodDays 自定义周期天数
 * @param baseDate 基准日期（可选，默认为当前日期）
 * @returns 日期范围 { start, end }
 */
export function getPeriodDateRange(
  period: string,
  customPeriodDays?: number,
  baseDate?: string
): { start: string; end: string } {
  const now = baseDate ? new Date(baseDate) : new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date;

  switch (period) {
    case 'day':
      start = now;
      break;
    case 'week':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      const days = customPeriodDays || 7;
      start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      break;
    default:
      start = now;
  }

  return {
    start: start.toISOString().split('T')[0],
    end
  };
}

/**
 * 获取任务在周期内的累计记录值
 * @param userId 用户ID
 * @param taskId 任务ID
 * @param period 目标周期
 * @param customPeriodDays 自定义周期天数
 * @param baseDate 基准日期（可选，默认为当前日期）
 * @returns 累计值 { booleanValue, numberValue }
 */
export async function getTaskPeriodAccumulatedValue(
  userId: string,
  taskId: string,
  period: string,
  customPeriodDays?: number,
  baseDate?: string
): Promise<{ booleanValue: boolean; numberValue: number }> {
  const supabase = await createClient();
  const dateRange = getPeriodDateRange(period, customPeriodDays, baseDate);

  const { data, error } = await supabase
    .from('task_daily_records')
    .select('value_boolean, value_number')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .gte('record_date', dateRange.start)
    .lte('record_date', dateRange.end);

  if (error) {
    console.error('获取周期内记录失败:', error);
    return { booleanValue: false, numberValue: 0 };
  }

  if (!data || data.length === 0) {
    return { booleanValue: false, numberValue: 0 };
  }

  const booleanValue = data.some(r => r.value_boolean === true);
  const numberValue = data.reduce((sum, r) => sum + (r.value_number || 0), 0);

  return { booleanValue, numberValue };
}

// 删除任务
export async function deleteTask(
  userId: string,
  taskId: string
): Promise<boolean> {
  const supabase = await createClient();
  
  // 先删除相关的任务记录
  const { error: recordsError } = await supabase
    .from('task_daily_records')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId);
  
  if (recordsError) {
    console.error('删除任务记录失败:', recordsError);
    return false;
  }
  
  // 再删除任务定义
  const { error } = await supabase
    .from('task_definitions')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    console.error('删除任务失败:', error);
    return false;
  }

  return true;
}

// 获取用户的所有任务记录（支持日期范围）
export async function getTaskRecordsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<TaskRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_daily_records')
    .select('*')
    .eq('user_id', userId)
    .gte('record_date', startDate)
    .lte('record_date', endDate)
    .order('record_date', { ascending: true })
    .order('task_id', { ascending: true });

  if (error) {
    console.error('获取任务记录失败:', error);
    return [];
  }

  return data;
}

// 获取用户的所有任务记录
export async function getAllTaskRecords(userId: string): Promise<TaskRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_daily_records')
    .select('*')
    .eq('user_id', userId)
    .order('record_date', { ascending: false })
    .order('task_id', { ascending: true });

  if (error) {
    console.error('获取所有任务记录失败:', error);
    return [];
  }

  return data;
}

// 创建任务目标值
export async function createTaskGoal(
  userId: string,
  taskId: string,
  values: TaskGoalFormValues
): Promise<TaskGoal | null> {
  console.log('[createTaskGoal] 开始创建目标值:', { userId, taskId, values });
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_goals')
    .insert({
      user_id: userId,
      task_id: taskId,
      goal_value: values.goal_value,
      period: values.period,
      custom_period_days: values.custom_period_days,
      is_enabled: values.is_enabled ?? true
    })
    .select()
    .single();

  if (error) {
    console.error('创建目标值失败:', error);
    return null;
  }

  console.log('[createTaskGoal] 创建成功:', data);
  return data;
}

// 更新任务目标值
export async function updateTaskGoal(
  userId: string,
  goalId: string,
  values: TaskGoalFormValues
): Promise<TaskGoal | null> {
  console.log('[updateTaskGoal] 开始更新目标值:', { userId, goalId, values });
  
  const supabase = await createClient();
  
  const updateData: Record<string, any> = {};
  if (values.goal_value !== undefined) updateData.goal_value = values.goal_value;
  if (values.period !== undefined) updateData.period = values.period;
  if (values.custom_period_days !== undefined) updateData.custom_period_days = values.custom_period_days;
  if (values.is_enabled !== undefined) updateData.is_enabled = values.is_enabled;
  
  console.log('[updateTaskGoal] 更新数据:', updateData);
  
  const { data, error } = await supabase
    .from('task_goals')
    .update(updateData)
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('更新目标值失败:', error);
    return null;
  }

  console.log('[updateTaskGoal] 更新成功:', data);
  return data;
}

// 获取任务的目标值
export async function getTaskGoal(
  userId: string,
  taskId: string
): Promise<TaskGoal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .single();

  if (error) {
    console.error('获取目标值失败:', error);
    return null;
  }

  return data;
}

// 删除任务目标值
export async function deleteTaskGoal(
  userId: string,
  goalId: string
): Promise<boolean> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('task_goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId);

  if (error) {
    console.error('删除目标值失败:', error);
    return false;
  }

  return true;
}
