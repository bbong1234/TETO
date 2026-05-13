import { createClient } from '@/lib/supabase/server';
import { tryRpc } from '@/lib/domain/transaction-service';
import { createComponentLogger } from '@/lib/observability/logger';
import type { SubItem, CreateSubItemPayload, UpdateSubItemPayload } from '@/types/teto';

const log = createComponentLogger('db-sub-items');

/**
 * 获取某事项下的所有子项
 */
export async function getSubItemsByItemId(
  userId: string,
  itemId: string
): Promise<SubItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_items')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`获取子项列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 根据 ID 获取单个子项
 */
export async function getSubItemById(
  userId: string,
  id: string
): Promise<SubItem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取子项失败: ${error.message}`);
  }

  return data;
}

/**
 * 创建子项
 */
export async function createSubItem(
  userId: string,
  payload: CreateSubItemPayload
): Promise<SubItem> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_items')
    .insert({
      user_id: userId,
      item_id: payload.item_id,
      title: payload.title,
      description: payload.description ?? null,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建子项失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新子项
 */
export async function updateSubItem(
  userId: string,
  id: string,
  payload: UpdateSubItemPayload
): Promise<SubItem> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('sub_items')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新子项失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除子项
 *
 * P5: 优先使用 RPC 事务化操作（原子性保证）
 * RPC 未部署时 fallback 到原有非事务逻辑，打印警告
 */
export async function deleteSubItem(
  userId: string,
  id: string
): Promise<void> {
  const supabase = await createClient();

  // 优先使用 RPC 事务化操作（懒检测，自动缓存可用性）
  const rpcResult = await tryRpc(supabase, 'rpc_delete_sub_item', {
    p_user_id: userId,
    p_sub_item_id: id,
  });

  if (rpcResult.ok) return;

  // RPC 已部署但业务逻辑失败 → 抛出错误
  if (rpcResult.rpcDeployed) {
    throw new Error(`删除子项失败: ${rpcResult.error}`);
  }

  // Fallback: 非事务逻辑（RPC 未部署时）
  log.warn('rpc_delete_sub_item 未部署，使用非事务 fallback');

  // 1. 置空关联记录的 sub_item_id
  const { error: recordsError } = await supabase
    .from('records')
    .update({ sub_item_id: null })
    .eq('user_id', userId)
    .eq('sub_item_id', id);

  if (recordsError) {
    throw new Error(`删除子项 - 置空关联记录失败: ${recordsError.message}`);
  }

  // 2. 置空关联目标的 sub_item_id
  const { error: goalsError } = await supabase
    .from('goals')
    .update({ sub_item_id: null })
    .eq('user_id', userId)
    .eq('sub_item_id', id);

  if (goalsError) {
    throw new Error(`删除子项 - 置空关联目标失败: ${goalsError.message}`);
  }

  // 3. 物理删除子项
  const { error } = await supabase
    .from('sub_items')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除子项失败: ${error.message}`);
  }
}

/**
 * 子项升格为独立事项
 *
 * P5: 优先使用 RPC 事务化操作（原子性保证）
 * RPC 未部署时 fallback 到原有非事务逻辑，打印警告
 *
 * @param migrateRecords 是否迁移历史记录，默认 true（RPC 模式下始终迁移）
 */
export async function promoteSubItemToItem(
  userId: string,
  subItemId: string,
  migrateRecords: boolean = true
): Promise<{ newItemId: string; subItem: SubItem }> {
  const supabase = await createClient();

  // 1. 获取子项信息（RPC 和 fallback 都需要）
  const subItem = await getSubItemById(userId, subItemId);
  if (!subItem) {
    throw new Error('子项不存在');
  }

  // 优先使用 RPC 事务化操作（懒检测，自动缓存可用性）
  const rpcResult = await tryRpc(supabase, 'rpc_promote_sub_item', {
    p_user_id: userId,
    p_sub_item_id: subItemId,
    p_new_title: subItem.title,
  });

  if (rpcResult.ok) {
    return { newItemId: rpcResult.data!.new_item_id, subItem };
  }

  // RPC 已部署但业务逻辑失败 → 抛出错误
  if (rpcResult.rpcDeployed) {
    throw new Error(`子项升格失败: ${rpcResult.error}`);
  }

  // Fallback: 非事务逻辑（RPC 未部署时）
  log.warn('rpc_promote_sub_item 未部署，使用非事务 fallback');

  // 2. 基于子项创建新事项
  const { data: newItem, error: createError } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      title: subItem.title,
      description: subItem.description,
      status: '活跃',
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`升格创建事项失败: ${createError.message}`);
  }

  // 3. 迁移历史记录（默认迁移）
  if (migrateRecords) {
    const { error: recordsError } = await supabase
      .from('records')
      .update({ item_id: newItem.id, sub_item_id: null })
      .eq('user_id', userId)
      .eq('sub_item_id', subItemId);

    if (recordsError) {
      throw new Error(`迁移记录失败: ${recordsError.message}`);
    }
  }

  // 4. 迁移关联目标（挂在子项下的目标迁移到新事项下）
  const { error: goalsError } = await supabase
    .from('goals')
    .update({ item_id: newItem.id, sub_item_id: null })
    .eq('user_id', userId)
    .eq('sub_item_id', subItemId);

  if (goalsError) {
    throw new Error(`迁移目标失败: ${goalsError.message}`);
  }

  // 5. 原子项保留在原事项下（不删除，它是历史）
  // 子项的记录和目标已经被迁移，但子项本身保留作为历史痕迹

  return { newItemId: newItem.id, subItem };
}
