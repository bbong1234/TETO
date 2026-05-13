import { createClient } from '@/lib/supabase/server';
import type { RecordLink, RecordLinkWithPeer, CreateRecordLinkPayload } from '@/types/teto';

// 重新导出以保持向后兼容
export type { RecordLinkWithPeer };

/**
 * 创建记录关联
 */
export async function createRecordLink(
  userId: string,
  payload: CreateRecordLinkPayload
): Promise<RecordLink> {
  const supabase = await createClient();

  // DDD 读写隔离：验证 source 和 target 记录都属于当前用户
  const { data: bothRecords, error: fetchError } = await supabase
    .from('records')
    .select('id, user_id')
    .eq('user_id', userId)
    .in('id', [payload.source_id, payload.target_id]);

  if (fetchError) {
    throw new Error(`验证记录归属失败: ${fetchError.message}`);
  }

  const foundIds = new Set((bothRecords ?? []).map((r: { id: string }) => r.id));
  if (!foundIds.has(payload.source_id)) {
    throw new Error('源记录不存在或不属于当前用户');
  }
  if (!foundIds.has(payload.target_id)) {
    throw new Error('目标记录不存在或不属于当前用户');
  }

  const { data, error } = await supabase
    .from('record_links')
    .insert({
      user_id: userId,
      source_id: payload.source_id,
      target_id: payload.target_id,
      link_type: payload.link_type,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建记录关联失败: ${error.message}`);
  }

  return data;
}

/**
 * 获取某条记录的所有关联（双向：作为 source 或 target），
 * 并附带"对方"记录的 content / type / occurred_at 摘要。
 */
export async function getLinksForRecord(
  userId: string,
  recordId: string
): Promise<RecordLinkWithPeer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('record_links')
    .select(`
      *,
      source:records!record_links_source_id_fkey(id, content, type, occurred_at),
      target:records!record_links_target_id_fkey(id, content, type, occurred_at)
    `)
    .eq('user_id', userId)
    .or(`source_id.eq.${recordId},target_id.eq.${recordId}`);

  if (error) {
    throw new Error(`查询记录关联失败: ${error.message}`);
  }

  // 把 join 出来的 source/target 拍平为 peer
  return (data || []).map((row: any) => {
    const isSource = row.source_id === recordId;
    const peer = isSource ? row.target : row.source;
    return {
      id: row.id,
      user_id: row.user_id,
      source_id: row.source_id,
      target_id: row.target_id,
      link_type: row.link_type,
      created_at: row.created_at,
      peer_id: peer?.id ?? (isSource ? row.target_id : row.source_id),
      peer_content: peer?.content ?? '（已删除）',
      peer_type: peer?.type ?? '',
      peer_occurred_at: peer?.occurred_at ?? null,
    };
  });
}

/**
 * 删除记录关联
 */
export async function deleteRecordLink(
  userId: string,
  linkId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('record_links')
    .delete()
    .eq('id', linkId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除记录关联失败: ${error.message}`);
  }
}
