import { createClient } from '@/lib/supabase/server';
import type { Phase, CreatePhasePayload, UpdatePhasePayload, PhasesQuery } from '@/types/teto';

/**
 * 获取阶段列表
 * @param userId 用户ID
 * @param query 查询参数
 * @returns 阶段列表
 */
export async function getPhases(
  userId: string,
  query?: PhasesQuery
): Promise<Phase[]> {
  const supabase = await createClient();

  let q = supabase
    .from('phases')
    .select('*')
    .eq('user_id', userId);

  if (query?.item_id) {
    q = q.eq('item_id', query.item_id);
  }

  if (query?.status) {
    q = q.eq('status', query.status);
  }

  if (query?.is_historical !== undefined) {
    q = q.eq('is_historical', query.is_historical);
  }

  const { data, error } = await q.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取阶段列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 根据ID获取单个阶段
 * @param userId 用户ID
 * @param id 阶段ID
 * @returns 阶段对象或null
 */
export async function getPhaseById(
  userId: string,
  id: string
): Promise<Phase | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取阶段失败: ${error.message}`);
  }

  return data;
}

/**
 * 获取某事项下的所有阶段
 * @param userId 用户ID
 * @param itemId 事项ID
 * @returns 阶段列表
 */
export async function getPhasesByItemId(
  userId: string,
  itemId: string
): Promise<Phase[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取事项阶段列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 创建阶段
 * @param userId 用户ID
 * @param payload 创建参数
 * @returns 创建后的阶段
 */
export async function createPhase(
  userId: string,
  payload: CreatePhasePayload
): Promise<Phase> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('phases')
    .insert({
      user_id: userId,
      item_id: payload.item_id,
      title: payload.title,
      description: payload.description ?? null,
      start_date: payload.start_date ?? null,
      end_date: payload.end_date ?? null,
      status: payload.status ?? '进行中',
      is_historical: payload.is_historical ?? false,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建阶段失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新阶段
 * @param userId 用户ID
 * @param id 阶段ID
 * @param payload 更新参数
 * @returns 更新后的阶段
 */
export async function updatePhase(
  userId: string,
  id: string,
  payload: UpdatePhasePayload
): Promise<Phase> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.start_date !== undefined) updateData.start_date = payload.start_date;
  if (payload.end_date !== undefined) updateData.end_date = payload.end_date;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.is_historical !== undefined) updateData.is_historical = payload.is_historical;
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('phases')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新阶段失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除阶段
 * @param userId 用户ID
 * @param id 阶段ID
 */
export async function deletePhase(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('phases')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除阶段失败: ${error.message}`);
  }
}
