import { createClient } from '@/lib/supabase/server';
import { deleteOneOwnedRow } from '@/lib/postgres/write-helpers';
import type {
  RecurringActivity,
  CreateRecurringActivityPayload,
  UpdateRecurringActivityPayload,
} from '@/types/teto';

function mapRow(row: Record<string, unknown>): RecurringActivity {
  const item = row.items as { id: string; title: string } | null | undefined;
  const { items: _items, ...rest } = row;
  return {
    ...(rest as unknown as RecurringActivity),
    item: item ? { id: item.id, title: item.title } : null,
  };
}

export async function listRecurringActivities(userId: string): Promise<RecurringActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_activities')
    .select('*, items(id, title)')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`列出常用事项失败: ${error.message}`);
  return (data ?? []).map((row: any) => mapRow(row as { [key: string]: unknown }));
}

export async function createRecurringActivity(
  userId: string,
  payload: CreateRecurringActivityPayload
): Promise<RecurringActivity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_activities')
    .insert({
      user_id: userId,
      name: payload.name.trim(),
      category: null,
      subcategory: null,
      item_id: payload.item_id ?? null,
      sort_order: payload.sort_order ?? 0,
    })
    .select('*, items(id, title)')
    .single();

  if (error) throw new Error(`创建常用事项失败: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function updateRecurringActivity(
  userId: string,
  id: string,
  payload: UpdateRecurringActivityPayload
): Promise<RecurringActivity> {
  const supabase = await createClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updateData.name = payload.name.trim();
  if (payload.item_id !== undefined) updateData.item_id = payload.item_id;
  if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('recurring_activities')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*, items(id, title)')
    .single();

  if (error) throw new Error(`更新常用事项失败: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function deleteRecurringActivity(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  await deleteOneOwnedRow(
    supabase,
    'recurring_activities',
    [
      { column: 'id', value: id },
      { column: 'user_id', value: userId },
    ],
    '删除常用事项失败'
  );
}
