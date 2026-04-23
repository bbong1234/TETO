import { createClient } from '@/lib/supabase/server';
import type { RecordDay } from '@/types/teto';

/**
 * 获取或创建指定日期的记录日（upsert 语义）
 */
export async function getOrCreateRecordDay(
  userId: string,
  date: string
): Promise<RecordDay> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('record_days')
    .upsert({ user_id: userId, date }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) {
    throw new Error(`获取或创建记录日失败: ${error.message}`);
  }

  return data;
}

/**
 * 按日期获取记录日
 */
export async function getRecordDayByDate(
  userId: string,
  date: string
): Promise<RecordDay | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('record_days')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    throw new Error(`获取记录日失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新记录日的 summary
 */
export async function updateRecordDaySummary(
  userId: string,
  id: string,
  summary: string
): Promise<RecordDay> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('record_days')
    .update({ summary })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新记录日失败: ${error.message}`);
  }

  return data;
}
