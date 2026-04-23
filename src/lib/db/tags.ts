import { createClient } from '@/lib/supabase/server';
import type { Tag, CreateTagPayload, UpdateTagPayload } from '@/types/teto';

/**
 * 创建标签
 */
export async function createTag(
  userId: string,
  payload: CreateTagPayload
): Promise<Tag> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId,
      name: payload.name,
      color: payload.color ?? null,
      type: payload.type ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建标签失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新标签
 */
export async function updateTag(
  userId: string,
  id: string,
  payload: UpdateTagPayload
): Promise<Tag> {
  const supabase = await createClient();

  const updateData: { [key: string]: unknown } = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.color !== undefined) updateData.color = payload.color;
  if (payload.type !== undefined) updateData.type = payload.type;

  const { data, error } = await supabase
    .from('tags')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新标签失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除标签
 */
export async function deleteTag(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除标签失败: ${error.message}`);
  }
}

/**
 * 列出用户所有标签
 */
export async function listTags(userId: string): Promise<Tag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`列出标签失败: ${error.message}`);
  }

  return (data as Tag[]) ?? [];
}

/**
 * 为记录附加标签
 */
export async function attachTagsToRecord(
  userId: string,
  recordId: string,
  tagIds: string[]
): Promise<void> {
  if (tagIds.length === 0) return;

  const supabase = await createClient();

  const inserts = tagIds.map((tagId) => ({
    user_id: userId,
    record_id: recordId,
    tag_id: tagId,
  }));

  const { error } = await supabase
    .from('record_tags')
    .insert(inserts);

  if (error) {
    throw new Error(`附加标签失败: ${error.message}`);
  }
}

/**
 * 替换记录的标签
 * - 先删除旧的 record_tags，再创建新的
 */
export async function replaceRecordTags(
  userId: string,
  recordId: string,
  tagIds: string[]
): Promise<void> {
  const supabase = await createClient();

  // 先删除旧的关联
  const { error: deleteError } = await supabase
    .from('record_tags')
    .delete()
    .eq('record_id', recordId)
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`替换标签（删除旧标签）失败: ${deleteError.message}`);
  }

  // 再创建新的关联
  if (tagIds.length > 0) {
    await attachTagsToRecord(userId, recordId, tagIds);
  }
}
