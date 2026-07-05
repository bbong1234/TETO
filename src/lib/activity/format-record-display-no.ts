import { resolveRecordAnchorDate } from '@/lib/activity/record-time';
import type { Record as TetoRecord } from '@/types/teto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 展示用编号；无 display_no 时用归属日 + sort_order 兜底 */
export function formatRecordDisplayNo(record: Pick<TetoRecord, 'display_no' | 'sort_order' | 'time_anchor_date' | 'record_day_id'> & {
  record_days?: { date: string } | null;
}): string {
  if (record.display_no?.trim()) return record.display_no.trim();
  const anchor = resolveRecordAnchorDate(record as TetoRecord);
  const datePart = anchor.replace(/-/g, '');
  const seq = String(Math.max(1, record.sort_order ?? 1)).padStart(4, '0');
  return `${datePart}${seq}`;
}

/** 创建记录时分配 display_no */
export async function generateDisplayNoForDate(
  supabase: SupabaseClient,
  userId: string,
  anchorDate: string
): Promise<string> {
  const datePart = anchorDate.replace(/-/g, '');
  const prefix = `${datePart}`;

  const { data } = await supabase
    .from('records')
    .select('display_no')
    .eq('user_id', userId)
    .like('display_no', `${prefix}%`)
    .order('display_no', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  const latest = data?.[0]?.display_no;
  if (latest && latest.startsWith(prefix) && latest.length >= prefix.length + 4) {
    const tail = parseInt(latest.slice(prefix.length), 10);
    if (!Number.isNaN(tail)) nextSeq = tail + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}
