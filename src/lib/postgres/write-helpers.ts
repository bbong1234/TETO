import type { ServerDbClient } from '@/lib/supabase/server';

type EqFilter = { column: string; value: unknown };

/** 删除单行并校验确实删到数据（避免 0 行静默成功） */
export async function deleteOneOwnedRow(
  supabase: ServerDbClient,
  table: string,
  filters: EqFilter[],
  label: string
): Promise<void> {
  let query = supabase.from(table).delete();
  for (const { column, value } of filters) {
    query = query.eq(column, value);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`${label}: 未找到匹配记录`);
  }
}
