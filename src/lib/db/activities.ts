import { createClient } from '@/lib/supabase/server';
import type { Record, Tag } from '@/types/teto';

/** 当前进行中的发生类记录查询条件 */
const CURRENT_ACTIVITY_FILTER = {
  type: '发生' as const,
  lifecycle_status: 'active' as const,
};

function enrichRow(
  row: Record & { record_tags?: { tags: Tag }[]; record_days?: { date: string } | null },
  item: { id: string; title: string } | null
): Record {
  const record: Record = { ...row };
  if (row.record_days) {
    record.date = row.record_days.date;
    delete (record as Record & { record_days?: unknown }).record_days;
  }
  if (row.record_tags) {
    record.tags = row.record_tags.map((rt: { tags: Tag }) => rt.tags);
    delete (record as Record & { record_tags?: unknown }).record_tags;
  }
  record.item = item;
  return record;
}

/**
 * 查询用户所有进行中的当前事项（理论上应只有一条）
 */
export async function listActiveActivities(userId: string): Promise<Record[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('records')
    .select(`
      *,
      record_tags(tags(*)),
      record_days(date)
    `)
    .eq('user_id', userId)
    .eq('type', CURRENT_ACTIVITY_FILTER.type)
    .eq('lifecycle_status', CURRENT_ACTIVITY_FILTER.lifecycle_status)
    .is('occurred_at_end', null)
    .order('occurred_at', { ascending: false });

  if (error) {
    throw new Error(`查询当前事项失败: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.filter((r) => r.item_id).map((r) => r.item_id as string))];
  const itemMap = new Map<string, { id: string; title: string }>();
  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', itemIds);
    for (const item of itemsData ?? []) {
      itemMap.set(item.id, item);
    }
  }

  return rows.map((row) =>
    enrichRow(row, row.item_id ? itemMap.get(row.item_id as string) ?? null : null)
  );
}

/**
 * 获取当前进行中的事项（最新一条）
 */
export async function getCurrentActivity(userId: string): Promise<Record | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('records')
    .select(`
      *,
      record_tags(tags(*)),
      record_days(date)
    `)
    .eq('user_id', userId)
    .eq('type', CURRENT_ACTIVITY_FILTER.type)
    .eq('lifecycle_status', CURRENT_ACTIVITY_FILTER.lifecycle_status)
    .is('occurred_at_end', null)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`查询当前事项失败: ${error.message}`);
  }
  if (!data) return null;

  let item: { id: string; title: string } | null = null;
  if (data.item_id) {
    const { data: itemData } = await supabase
      .from('items')
      .select('id, title')
      .eq('id', data.item_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (itemData) item = itemData;
  }

  return enrichRow(data, item);
}
