/**
 * 统一日期过滤策略
 *
 * 优先使用 time_anchor_date，当为 null 时 fallback 到 record_days.date
 * 这解决了当前 insights.ts 使用 record_days.date 而
 * 其他地方使用 time_anchor_date 的不一致问题
 */

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server')['createClient']>>

/**
 * 获取日期范围内的记录
 *
 * 查询逻辑：
 * 1. 先获取日期范围内的 record_day IDs
 * 2. 查询 time_anchor_date 在范围内 OR (time_anchor_date 为 null 且 record_day_id 在范围内)
 */
export async function getRecordsInDateRange(
  supabase: SupabaseClient,
  userId: string,
  dateFrom: string,
  dateTo: string,
  selectFields: string = '*'
): Promise<any[]> {
  // 第一步：获取日期范围内的 record_day IDs
  const { data: dayIds } = await supabase
    .from('record_days')
    .select('id')
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo)

  // 空数组保护
  const dayIdList = (dayIds || []).map((d: { id: string }) => d.id)
  if (dayIdList.length === 0) {
    // 无匹配 record_day，只查有 time_anchor_date 的记录
    const { data } = await supabase
      .from('records')
      .select(selectFields)
      .eq('user_id', userId)
      .gte('time_anchor_date', dateFrom)
      .lte('time_anchor_date', dateTo)
    return data || []
  }

  // 第二步：查询 time_anchor_date 在范围内 OR record_day_id 在 dayIds 内
  const { data } = await supabase
    .from('records')
    .select(selectFields)
    .eq('user_id', userId)
    .or(
      `and(time_anchor_date.gte.${dateFrom},time_anchor_date.lte.${dateTo}),` +
      `and(time_anchor_date.is.null,record_day_id.in.(${dayIdList.join(',')}))`
    )

  return data || []
}
