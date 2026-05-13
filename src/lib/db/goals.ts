import { createClient } from '@/lib/supabase/server';
import type { Goal, CreateGoalPayload, UpdateGoalPayload, GoalsQuery } from '@/types/teto';

/**
 * 获取目标列表
 */
export async function getGoals(
  userId: string,
  query?: GoalsQuery
): Promise<Goal[]> {
  const supabase = await createClient();

  let q = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId);

  if (query?.status) {
    q = q.eq('status', query.status);
  }
  if (query?.item_id) {
    q = q.eq('item_id', query.item_id);
  }
  if (query?.phase_id) {
    q = q.eq('phase_id', query.phase_id);
  }
  if (query?.sub_item_id) {
    q = q.eq('sub_item_id', query.sub_item_id);
  }
  if (query?.rule_type) {
    q = q.eq('rule_type', query.rule_type);
  }
  if (query?.source) {
    q = q.eq('source', query.source);
  }

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取目标列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 根据ID获取单个目标
 */
export async function getGoalById(
  userId: string,
  id: string
): Promise<Goal | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取目标失败: ${error.message}`);
  }

  return data;
}

/**
 * 创建目标
 */
export async function createGoal(
  userId: string,
  payload: CreateGoalPayload
): Promise<Goal> {
  const supabase = await createClient();

  // 构建插入数据
  const insertData: Record<string, unknown> = {
    user_id: userId,
    title: payload.title,
    description: payload.description ?? null,
    status: payload.status ?? (payload.confirmation_required ? '草稿' : '进行中'),
    item_id: payload.item_id ?? null,
    phase_id: payload.phase_id ?? null,
    sub_item_id: payload.sub_item_id ?? null,
    // 新字段
    goal_text: payload.goal_text ?? payload.title,
    rule_type: payload.rule_type ?? '一次性完成',
    operator: payload.operator ?? '>=',
    metric_name: payload.metric_name ?? null,
    target_value: payload.target_value ?? payload.target_min ?? null,
    target_min: payload.target_min ?? payload.target_value ?? null,
    target_max: payload.target_max ?? null,
    unit: payload.unit ?? null,
    period: payload.period ?? null,
    start_date: payload.start_date ?? null,
    end_date: payload.end_date ?? null,
    deadline: payload.deadline ?? null,
    source: payload.source ?? '手动创建',
    confirmation_required: payload.confirmation_required ?? false,
    progress_source: payload.progress_source ?? '记录统计',
    current_value: payload.current_value ?? null,
  };

  const { data, error } = await supabase
    .from('goals')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`创建目标失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新目标
 */
export async function updateGoal(
  userId: string,
  id: string,
  payload: UpdateGoalPayload
): Promise<Goal> {
  const supabase = await createClient();

  // 查询当前目标状态
  const { data: currentGoal, error: fetchError } = await supabase
    .from('goals')
    .select('status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`查询目标状态失败: ${fetchError.message}`);
  }

  if (!currentGoal) {
    throw new Error('目标不存在或不属于当前用户');
  }

  // 已完成目标仅允许修改状态为「放弃」或「暂停」（即回退状态）
  if (currentGoal.status === '已完成') {
    const onlyStatusChange =
      Object.keys(payload).length === 1 &&
      payload.status !== undefined &&
      (payload.status === '放弃' || payload.status === '暂停');
    if (!onlyStatusChange) {
      throw new Error('GOAL_COMPLETED_LOCKED:该目标已完成，数据不可修改。仅可将状态回退为「放弃」或「暂停」');
    }
  }

  const updateData: Record<string, unknown> = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.item_id !== undefined) updateData.item_id = payload.item_id;
  if (payload.phase_id !== undefined) updateData.phase_id = payload.phase_id;
  if (payload.sub_item_id !== undefined) updateData.sub_item_id = payload.sub_item_id;
  // 新字段
  if (payload.goal_text !== undefined) updateData.goal_text = payload.goal_text;
  if (payload.rule_type !== undefined) updateData.rule_type = payload.rule_type;
  if (payload.operator !== undefined) updateData.operator = payload.operator;
  if (payload.metric_name !== undefined) updateData.metric_name = payload.metric_name;
  if (payload.target_value !== undefined) updateData.target_value = payload.target_value;
  if (payload.target_min !== undefined) updateData.target_min = payload.target_min;
  if (payload.target_max !== undefined) updateData.target_max = payload.target_max;
  if (payload.unit !== undefined) updateData.unit = payload.unit;
  if (payload.period !== undefined) updateData.period = payload.period;
  if (payload.start_date !== undefined) updateData.start_date = payload.start_date;
  if (payload.end_date !== undefined) updateData.end_date = payload.end_date;
  if (payload.deadline !== undefined) updateData.deadline = payload.deadline;
  if (payload.source !== undefined) updateData.source = payload.source;
  if (payload.confirmation_required !== undefined) updateData.confirmation_required = payload.confirmation_required;
  if (payload.progress_source !== undefined) updateData.progress_source = payload.progress_source;
  if (payload.current_value !== undefined) updateData.current_value = payload.current_value;
  // 同步 target_value 和 target_min
  if (payload.target_min !== undefined && payload.target_value === undefined) {
    updateData.target_value = payload.target_min;
  }

  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新目标失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除目标
 */
export async function deleteGoal(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除目标失败: ${error.message}`);
  }
}

/**
 * 确认草稿目标 → 进行中
 */
export async function confirmGoal(
  userId: string,
  id: string,
  payload?: UpdateGoalPayload
): Promise<Goal> {
  const supabase = await createClient();

  // 先获取当前目标
  const { data: currentGoal, error: fetchError } = await supabase 
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`查询目标失败: ${fetchError.message}`);
  }

  if (!currentGoal) {
    throw new Error('目标不存在或不属于当前用户');
  }

  if (currentGoal.status !== '草稿') {
    throw new Error('只有草稿状态的目标才能确认');
  }

  // 合并确认时用户修改的参数
  const updateData: Record<string, unknown> = {
    status: '进行中',
    confirmation_required: false,
  };

  if (payload) {
    if (payload.rule_type !== undefined) updateData.rule_type = payload.rule_type;
    if (payload.operator !== undefined) updateData.operator = payload.operator;
    if (payload.metric_name !== undefined) updateData.metric_name = payload.metric_name;
    if (payload.target_value !== undefined) updateData.target_value = payload.target_value;
    if (payload.target_min !== undefined) {
      updateData.target_min = payload.target_min;
      if (payload.target_value === undefined) updateData.target_value = payload.target_min;
    }
    if (payload.target_max !== undefined) updateData.target_max = payload.target_max;
    if (payload.unit !== undefined) updateData.unit = payload.unit;
    if (payload.period !== undefined) updateData.period = payload.period;
    if (payload.start_date !== undefined) updateData.start_date = payload.start_date;
    if (payload.end_date !== undefined) updateData.end_date = payload.end_date;
    if (payload.deadline !== undefined) updateData.deadline = payload.deadline;
    if (payload.goal_text !== undefined) updateData.goal_text = payload.goal_text;
    if (payload.title !== undefined) updateData.title = payload.title;
  }

  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`确认目标失败: ${error.message}`);
  }

  return data;
}

/**
 * 获取某事项下的所有目标
 */
export async function getGoalsByItemId(
  userId: string,
  itemId: string
): Promise<Goal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取事项目标列表失败: ${error.message}`);
  }

  return (data || []) as Goal[];
}

/**
 * 获取某子项下的所有目标
 */
export async function getGoalsBySubItemId(
  userId: string,
  subItemId: string
): Promise<Goal[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('sub_item_id', subItemId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取子项目标列表失败: ${error.message}`);
  }

  return data || [];
}
