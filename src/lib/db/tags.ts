import { createClient } from '@/lib/supabase/server';
import { deleteOneOwnedRow } from '@/lib/postgres/write-helpers';
import type { Tag, CreateTagPayload, UpdateTagPayload } from '@/types/teto';

/**
 * 创建标签
 */
export async function createTag(
  userId: string,
  payload: CreateTagPayload
): Promise<Tag> {
  const supabase = await createClient();
  if (payload.scope_item_id) {
    const { data: scopeItem, error: scopeError } = await supabase
      .from('items')
      .select('id, parent_item_id')
      .eq('id', payload.scope_item_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (scopeError || !scopeItem || scopeItem.parent_item_id) {
      throw new Error('动作标签只能归属到当前用户的一类事项');
    }
  }

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId,
      name: payload.name,
      color: payload.color ?? null,
      type: payload.type ?? null,
      scope_item_id: payload.type === 'function' ? payload.scope_item_id ?? null : null,
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
  if (payload.type !== undefined && payload.type !== 'function') updateData.scope_item_id = null;
  else if (payload.scope_item_id !== undefined) updateData.scope_item_id = payload.scope_item_id;
  if (payload.scope_item_id) {
    const { data: scopeItem, error: scopeError } = await supabase
      .from('items')
      .select('id, parent_item_id')
      .eq('id', payload.scope_item_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (scopeError || !scopeItem || scopeItem.parent_item_id) {
      throw new Error('动作标签只能归属到当前用户的一类事项');
    }
  }

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
  await deleteOneOwnedRow(
    supabase,
    'tags',
    [
      { column: 'id', value: id },
      { column: 'user_id', value: userId },
    ],
    '删除标签失败'
  );
}

/**
 * 列出用户所有标签
 */
export async function listTags(
  userId: string,
  search?: string,
  type?: string
): Promise<Tag[]> {
  const supabase = await createClient();

  let query = supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId);

  const q = search?.trim();
  if (q) {
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    query = query.ilike('name', `%${escaped}%`);
  }

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    throw new Error(`列出标签失败: ${error.message}`);
  }

  return (data as Tag[]) ?? [];
}

export interface FunctionTagWithStats extends Tag {
  record_count: number;
  total_minutes: number;
  last_record_at: string | null;
}

export interface ItemFunctionTagsResult {
  frequent: FunctionTagWithStats[];
  all: Tag[];
}

/**
 * 某事项历史用过的职能标签（含使用次数、累计时长、最近记录时间） + 全局职能池
 */
export async function listFunctionTagsForItem(
  userId: string,
  itemId: string
): Promise<ItemFunctionTagsResult> {
  const supabase = await createClient();
  const allTags = await listTags(userId, undefined, 'function');
  const { data: itemTree, error: itemTreeError } = await supabase
    .from('items')
    .select('id, parent_item_id')
    .eq('user_id', userId);
  if (itemTreeError) throw new Error(`查询事项层级失败: ${itemTreeError.message}`);

  const parentById = new Map<string, string | null>(
    (itemTree ?? []).map((row: { id: string; parent_item_id: string | null }) => [row.id, row.parent_item_id])
  );
  let scopeItemId = itemId;
  let parentId: string | null | undefined = parentById.get(scopeItemId);
  while (parentId) {
    scopeItemId = parentId;
    parentId = parentById.get(scopeItemId);
  }
  const all = allTags.filter(
    (tag) => !tag.scope_item_id || tag.scope_item_id === scopeItemId
  );

  const scopedItemIds = new Set<string>([itemId]);
  const { data: children } = await supabase
    .from('items')
    .select('id, parent_item_id')
    .eq('user_id', userId)
    .or(`id.eq.${itemId},parent_item_id.eq.${itemId}`);

  const childIds = (children ?? [])
    .filter((row: { id: string; parent_item_id: string | null }) => row.parent_item_id === itemId)
    .map((row: { id: string }) => row.id);
  for (const id of childIds) scopedItemIds.add(id);

  if (childIds.length > 0) {
    const { data: grandchildren } = await supabase
      .from('items')
      .select('id')
      .eq('user_id', userId)
      .in('parent_item_id', childIds);
    for (const row of grandchildren ?? []) {
      scopedItemIds.add((row as { id: string }).id);
    }
  }

  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('id, duration_minutes, occurred_at')
    .eq('user_id', userId)
    .in('item_id', [...scopedItemIds]);

  if (recordsError) {
    throw new Error(`查询事项记录失败: ${recordsError.message}`);
  }

  const recordRows = (records ?? []) as { id: string; duration_minutes: number | null; occurred_at: string | null }[];
  const recordIds = recordRows.map((r) => r.id);
  if (recordIds.length === 0) {
    return { frequent: [], all };
  }

  const recordMetaById = new Map(recordRows.map((r) => [r.id, r]));

  const { data: links, error: linksError } = await supabase
    .from('record_tags')
    .select('tag_id, record_id, tags(*)')
    .eq('user_id', userId)
    .in('record_id', recordIds);

  if (linksError) {
    throw new Error(`查询事项职能标签失败: ${linksError.message}`);
  }

  const statsMap = new Map<string, { tag: Tag; count: number; totalMinutes: number; lastAt: string | null }>();
  for (const row of links ?? []) {
    const raw = row as { tag_id: string; record_id: string; tags: Tag | Tag[] | null };
    const tag = Array.isArray(raw.tags) ? raw.tags[0] : raw.tags;
    if (!tag || tag.type !== 'function') continue;
    if (tag.scope_item_id && tag.scope_item_id !== scopeItemId) continue;
    const recMeta = recordMetaById.get(raw.record_id);
    const mins = recMeta?.duration_minutes ?? 0;
    const at = recMeta?.occurred_at ?? null;
    const prev = statsMap.get(tag.id);
    if (prev) {
      prev.count += 1;
      prev.totalMinutes += mins;
      if (at && (!prev.lastAt || at > prev.lastAt)) prev.lastAt = at;
    } else {
      statsMap.set(tag.id, { tag, count: 1, totalMinutes: mins, lastAt: at });
    }
  }

  const frequent: FunctionTagWithStats[] = [...statsMap.values()]
    .sort((a, b) => b.count - a.count)
    .map((x) => ({
      ...x.tag,
      record_count: x.count,
      total_minutes: x.totalMinutes,
      last_record_at: x.lastAt,
    }));

  return { frequent, all };
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
