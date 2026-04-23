import { createClient } from '@/lib/supabase/server';
import type { ItemFolder, CreateItemFolderPayload, UpdateItemFolderPayload } from '@/types/teto';

/**
 * 获取文件夹列表
 */
export async function getItemFolders(userId: string): Promise<ItemFolder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('item_folders')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`获取文件夹列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 根据ID获取单个文件夹
 */
export async function getItemFolderById(
  userId: string,
  id: string
): Promise<ItemFolder | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('item_folders')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取文件夹失败: ${error.message}`);
  }

  return data;
}

/**
 * 创建文件夹
 */
export async function createItemFolder(
  userId: string,
  payload: CreateItemFolderPayload
): Promise<ItemFolder> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('item_folders')
    .insert({
      user_id: userId,
      name: payload.name,
      color: payload.color ?? null,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建文件夹失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新文件夹
 */
export async function updateItemFolder(
  userId: string,
  id: string,
  payload: UpdateItemFolderPayload
): Promise<ItemFolder> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.color !== undefined) updateData.color = payload.color;
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('item_folders')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新文件夹失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除文件夹（事项的 folder_id 会被自动设为 NULL，因为外键 ON DELETE SET NULL）
 */
export async function deleteItemFolder(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('item_folders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除文件夹失败: ${error.message}`);
  }
}
