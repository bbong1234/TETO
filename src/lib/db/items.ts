import { createClient } from '@/lib/supabase/server';
import { tryRpc } from '@/lib/domain/transaction-service';
import { createComponentLogger } from '@/lib/observability/logger';
import type { Item, CreateItemPayload, UpdateItemPayload, ItemsQuery, Record as TetoRecord } from '@/types/teto';

const log = createComponentLogger('db-items');

/**
 * 创建事项
 *
 * 创建前检查是否有同名归档事项：
 * - 有同名已搁置/已完成事项 → 返回提示信息，让用户选择是否在原事项下建新阶段重启
 */
export async function createItem(
  userId: string,
  payload: CreateItemPayload
): Promise<Item> {
  const supabase = await createClient();

  // 检查同名归档事项
  const { data: existingItems } = await supabase
    .from('items')
    .select('id, title, status')
    .eq('user_id', userId)
    .eq('title', payload.title)
    .in('status', ['已搁置', '已完成']);

  if (existingItems && existingItems.length > 0) {
    throw new Error(
      `发现同名归档事项「${payload.title}」，是否在原事项下建新阶段重启？`,
    );
  }

  const { data, error } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      title: payload.title.trim(),
      description: payload.description ?? null,
      status: payload.status ?? '活跃',
      color: payload.color ?? null,
      icon: payload.icon ?? null,
      is_pinned: payload.is_pinned ?? false,
      started_at: payload.started_at ?? null,
      folder_id: payload.folder_id ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建事项失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新事项
 */
export async function updateItem(
  userId: string,
  id: string,
  payload: UpdateItemPayload
): Promise<Item> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.color !== undefined) updateData.color = payload.color;
  if (payload.icon !== undefined) updateData.icon = payload.icon;
  if (payload.is_pinned !== undefined) updateData.is_pinned = payload.is_pinned;
  if (payload.started_at !== undefined) updateData.started_at = payload.started_at;
  if (payload.ended_at !== undefined) updateData.ended_at = payload.ended_at;
  if (payload.folder_id !== undefined) updateData.folder_id = payload.folder_id;

  const { data, error } = await supabase
    .from('items')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新事项失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除事项（软删除：置空关联记录的 item_id，禁止物理删除）
 *
 * P5: 优先使用 RPC 事务化操作（原子性保证）
 * RPC 未部署时 fallback 到原有非事务逻辑，打印警告
 */
export async function deleteItem(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  // 优先使用 RPC 事务化操作（懒检测，自动缓存可用性）
  const rpcResult = await tryRpc(supabase, 'rpc_delete_item', {
    p_user_id: userId,
    p_item_id: id,
  });

  if (rpcResult.ok) return;

  // RPC 已部署但业务逻辑失败 → 抛出错误
  if (rpcResult.rpcDeployed) {
    throw new Error(`删除事项失败: ${rpcResult.error}`);
  }

  // Fallback: 非事务逻辑（RPC 未部署时）
  log.warn('rpc_delete_item 未部署，使用非事务 fallback');

  // 1. 置空关联记录的 item_id、phase_id、sub_item_id
  const { error: recordsError } = await supabase
    .from('records')
    .update({ item_id: null, phase_id: null, sub_item_id: null })
    .eq('user_id', userId)
    .eq('item_id', id);

  if (recordsError) {
    throw new Error(`删除事项 - 置空关联记录失败: ${recordsError.message}`);
  }

  // 2. 置空关联目标的 sub_item_id 和 item_id
  const { error: goalsError } = await supabase
    .from('goals')
    .update({ sub_item_id: null, item_id: null })
    .eq('user_id', userId)
    .eq('item_id', id);

  if (goalsError) {
    throw new Error(`删除事项 - 置空关联目标失败: ${goalsError.message}`);
  }

  // 3. 置空关联阶段的 item_id
  const { error: phasesError } = await supabase
    .from('phases')
    .update({ item_id: null })
    .eq('user_id', userId)
    .eq('item_id', id);

  if (phasesError) {
    throw new Error(`删除事项 - 置空关联阶段失败: ${phasesError.message}`);
  }

  // 4. 物理删除关联子项（子项依附于事项，事项搁置后子项无意义）
  const { error: subItemsError } = await supabase
    .from('sub_items')
    .delete()
    .eq('user_id', userId)
    .eq('item_id', id);

  if (subItemsError) {
    throw new Error(`删除事项 - 删除关联子项失败: ${subItemsError.message}`);
  }

  // 5. 将事项状态改为 '已搁置'（软删除，不物理删除）
  const { error } = await supabase
    .from('items')
    .update({ status: '已搁置' })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除事项失败: ${error.message}`);
  }
}

/**
 * 根据 ID 获取事项（附带关联记录列表）
 */
export async function getItemById(
  userId: string,
  id: string
): Promise<Item | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取事项失败: ${error.message}`);
  }

  if (!data) return null;

  // 附带该事项关联的所有记录（按时间倒序）
  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('id, content, type, occurred_at, status, result, mood, energy, note, item_id, phase_id, sub_item_id, sort_order, is_starred, created_at, updated_at, user_id, record_day_id, cost, metric_value, metric_unit, metric_name, duration_minutes')
    .eq('item_id', id)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (recordsError) {
    throw new Error(`获取事项关联记录失败: ${recordsError.message}`);
  }

  // 为每条记录附带 item 信息
  const enrichedRecords: TetoRecord[] = [];
  for (const rec of (records || [])) {
    const record: TetoRecord = { ...rec };
    record.item = { id: data.id, title: data.title };
    enrichedRecords.push(record);
  }

  return { ...data, recent_records: enrichedRecords };
}

/**
 * 列出事项
 * - 使用 Supabase count 聚合，一次性返回 phase_count / record_count
 * - 批量查询进行中阶段标题
 */
export async function listItems(
  userId: string,
  query: ItemsQuery
): Promise<Item[]> {
  const supabase = await createClient();

  // 一次查询：items + phases count + records count
  let q = supabase
    .from('items')
    .select('*, phases(count), records(count)')
    .eq('user_id', userId);

  if (query.status) {
    q = q.eq('status', query.status);
  }

  if (query.is_pinned !== undefined) {
    q = q.eq('is_pinned', query.is_pinned);
  }

  if (query.folder_id !== undefined) {
    if (query.folder_id === null) {
      q = q.is('folder_id', null);
    } else {
      q = q.eq('folder_id', query.folder_id);
    }
  }

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`列出事项失败: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  // 批量查询进行中阶段（1 次查询代替 N 次）
  const itemIds = data.map(d => d.id);
  const { data: activePhases } = await supabase
    .from('phases')
    .select('item_id, title')
    .eq('user_id', userId)
    .eq('status', '进行中')
    .in('item_id', itemIds);

  const phaseMap = new Map<string, string>();
  activePhases?.forEach((p: { item_id: string; title: string }) => phaseMap.set(p.item_id, p.title));

  return data.map((row: any) => ({
    ...row,
    phase_count: row.phases?.[0]?.count ?? 0,
    record_count: row.records?.[0]?.count ?? 0,
    active_phase_title: phaseMap.get(row.id) || null,
    phases: undefined,
    records: undefined,
    recent_records: [],
  }));
}
