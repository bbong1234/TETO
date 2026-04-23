import { createClient } from '@/lib/supabase/server';
import type { Goal, CreateGoalPayload, UpdateGoalPayload, GoalsQuery } from '@/types/teto';

/**
 * 获取目标列表
 * @param userId 用户ID
 * @param query 查询参数
 * @returns 目标列表
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

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取目标列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 根据ID获取单个目标
 * @param userId 用户ID
 * @param id 目标ID
 * @returns 目标对象或null
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
 * @param userId 用户ID
 * @param payload 创建参数
 * @returns 创建后的目标
 */
export async function createGoal(
  userId: string,
  payload: CreateGoalPayload
): Promise<Goal> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      title: payload.title,
      description: payload.description ?? null,
      status: payload.status ?? '进行中',
      item_id: payload.item_id ?? null,
      phase_id: payload.phase_id ?? null,
      measure_type: payload.measure_type ?? 'boolean',
      target_value: payload.target_value ?? null,
      current_value: payload.current_value ?? null,
      // 量化引擎 Benchmark 字段
      metric_name: payload.metric_name ?? null,
      unit: payload.unit ?? null,
      daily_target: payload.daily_target ?? null,
      start_date: payload.start_date ?? null,
      deadline_date: payload.deadline_date ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建目标失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新目标
 * @param userId 用户ID
 * @param id 目标ID
 * @param payload 更新参数
 * @returns 更新后的目标
 */
export async function updateGoal(
  userId: string,
  id: string,
  payload: UpdateGoalPayload
): Promise<Goal> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.item_id !== undefined) updateData.item_id = payload.item_id;
  if (payload.phase_id !== undefined) updateData.phase_id = payload.phase_id;
  if (payload.measure_type !== undefined) updateData.measure_type = payload.measure_type;
  if (payload.target_value !== undefined) updateData.target_value = payload.target_value;
  if (payload.current_value !== undefined) updateData.current_value = payload.current_value;
  // 量化引擎 Benchmark 字段
  if (payload.metric_name !== undefined) updateData.metric_name = payload.metric_name;
  if (payload.unit !== undefined) updateData.unit = payload.unit;
  if (payload.daily_target !== undefined) updateData.daily_target = payload.daily_target;
  if (payload.start_date !== undefined) updateData.start_date = payload.start_date;
  if (payload.deadline_date !== undefined) updateData.deadline_date = payload.deadline_date;

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
 * @param userId 用户ID
 * @param id 目标ID
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
 * 获取某事项下的所有目标
 * @param userId 用户ID
 * @param itemId 事项ID
 * @returns 目标列表
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

  return data || [];
}
