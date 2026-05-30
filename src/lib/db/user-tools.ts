import { createClient } from '@/lib/supabase/server';
import type { UserTool, CreateUserToolPayload, UpdateUserToolPayload } from '@/types/teto';

export async function listUserTools(userId: string): Promise<UserTool[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_tools')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    throw new Error(`获取工具选项失败: ${error.message}`);
  }
  return data ?? [];
}

export async function createUserTool(
  userId: string,
  payload: CreateUserToolPayload
): Promise<UserTool> {
  const supabase = await createClient();
  const title = payload.title.trim();
  if (!title) {
    throw new Error('工具名称不能为空');
  }

  const { data, error } = await supabase
    .from('user_tools')
    .insert({
      user_id: userId,
      title,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await supabase
        .from('user_tools')
        .select('*')
        .eq('user_id', userId)
        .eq('title', title)
        .maybeSingle();
      if (existing.data) return existing.data as UserTool;
    }
    throw new Error(`创建工具选项失败: ${error.message}`);
  }

  return data as UserTool;
}

export async function updateUserTool(
  userId: string,
  id: string,
  payload: UpdateUserToolPayload
): Promise<UserTool> {
  const supabase = await createClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) updateData.title = payload.title.trim();
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('user_tools')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新工具选项失败: ${error.message}`);
  }
  return data as UserTool;
}

export async function deleteUserTool(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('user_tools').delete().eq('id', id).eq('user_id', userId);
  if (error) {
    throw new Error(`删除工具选项失败: ${error.message}`);
  }
}

/** 选中工具时若不在列表中则自动补建（兼容历史 tool_label 文本） */
export async function ensureUserTool(userId: string, title: string): Promise<UserTool | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;
  try {
    return await createUserTool(userId, { title: trimmed });
  } catch {
    return null;
  }
}
