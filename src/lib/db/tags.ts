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

  // 验证所有标签都属于当前用户
  const { data: ownedTags } = await supabase
    .from('tags')
    .select('id')
    .eq('user_id', userId)
    .in('id', tagIds);

  const ownedIds = new Set((ownedTags ?? []).map((t: { id: string }) => t.id));
  const invalidIds = tagIds.filter(id => !ownedIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(`标签不存在或不属于当前用户: ${invalidIds.join(', ')}`);
  }

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

  // 先获取旧标签（用于失败时恢复）
  const { data: oldTags } = await supabase
    .from('record_tags')
    .select('tag_id')
    .eq('record_id', recordId)
    .eq('user_id', userId);
  const oldTagIds = (oldTags ?? []).map((r: { tag_id: string }) => r.tag_id);

  // 删除旧的关联
  const { error: deleteError } = await supabase
    .from('record_tags')
    .delete()
    .eq('record_id', recordId)
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`替换标签（删除旧标签）失败: ${deleteError.message}`);
  }

  // 创建新的关联
  if (tagIds.length > 0) {
    try {
      await attachTagsToRecord(userId, recordId, tagIds);
    } catch (insertError) {
      // 恢复旧标签关联
      if (oldTagIds.length > 0) {
        try {
          await attachTagsToRecord(userId, recordId, oldTagIds);
        } catch {
          // 恢复也失败，但至少旧标签已备份在 oldTagIds 中
        }
      }
      throw insertError;
    }
  }
}
