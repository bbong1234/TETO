import { createClient } from '@/lib/supabase/server';
import type { Record, CreateRecordPayload, UpdateRecordPayload, RecordsQuery, Tag } from '@/types/teto';
import { getOrCreateRecordDay } from './record-days';
import { attachTagsToRecord, replaceRecordTags } from './tags';

/**
 * 创建记录
 * - 自动 upsert 记录日
 * - 如果有 tag_ids，创建后关联标签
 */
export async function createRecord(
  userId: string,
  payload: CreateRecordPayload
): Promise<Record> {
  const supabase = await createClient();

  // 确保记录日存在
  const recordDay = await getOrCreateRecordDay(userId, payload.date);

  const { tag_ids, date, ...recordData } = payload;

  const { data, error } = await supabase
    .from('records')
    .insert({
      user_id: userId,
      record_day_id: recordDay.id,
      ...recordData,
      type: recordData.type ?? '发生',
      sort_order: recordData.sort_order ?? 0,
      is_starred: recordData.is_starred ?? false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建记录失败: ${error.message}`);
  }

  // 关联标签
  if (tag_ids && tag_ids.length > 0) {
    await attachTagsToRecord(userId, data.id, tag_ids);
  }

  // 重新获取带关联的数据
  return (await getRecordById(userId, data.id))!;
}

/**
 * 更新记录
 * - 如果有 tag_ids，替换标签关联
 */
export async function updateRecord(
  userId: string,
  id: string,
  payload: UpdateRecordPayload
): Promise<Record> {
  const supabase = await createClient();

  const { tag_ids, ...recordData } = payload;

  // 构建更新对象，只更新有值的字段
  const updateData: { [key: string]: unknown } = {};
  if (recordData.content !== undefined) updateData.content = recordData.content;
  if (recordData.type !== undefined) updateData.type = recordData.type;
  if (recordData.occurred_at !== undefined) updateData.occurred_at = recordData.occurred_at;
  if (recordData.status !== undefined) updateData.status = recordData.status;
  if (recordData.mood !== undefined) updateData.mood = recordData.mood;
  if (recordData.energy !== undefined) updateData.energy = recordData.energy;
  if (recordData.result !== undefined) updateData.result = recordData.result;
  if (recordData.note !== undefined) updateData.note = recordData.note;
  if (recordData.item_id !== undefined) updateData.item_id = recordData.item_id;
  if (recordData.phase_id !== undefined) updateData.phase_id = recordData.phase_id;
  if (recordData.goal_id !== undefined) updateData.goal_id = recordData.goal_id;
  if (recordData.sort_order !== undefined) updateData.sort_order = recordData.sort_order;
  if (recordData.is_starred !== undefined) updateData.is_starred = recordData.is_starred;
  if (recordData.cost !== undefined) updateData.cost = recordData.cost;
  if (recordData.metric_value !== undefined) updateData.metric_value = recordData.metric_value;
  if (recordData.metric_unit !== undefined) updateData.metric_unit = recordData.metric_unit;
  if (recordData.metric_name !== undefined) updateData.metric_name = recordData.metric_name;
  if (recordData.duration_minutes !== undefined) updateData.duration_minutes = recordData.duration_minutes;
  if (recordData.raw_input !== undefined) updateData.raw_input = recordData.raw_input;
  if (recordData.parsed_semantic !== undefined) updateData.parsed_semantic = recordData.parsed_semantic;
  if (recordData.time_anchor_date !== undefined) updateData.time_anchor_date = recordData.time_anchor_date;
  if (recordData.linked_record_id !== undefined) updateData.linked_record_id = recordData.linked_record_id;
  if (recordData.location !== undefined) updateData.location = recordData.location;
  if (recordData.people !== undefined) updateData.people = recordData.people;
  if (recordData.batch_id !== undefined) updateData.batch_id = recordData.batch_id;
  if (recordData.lifecycle_status !== undefined) updateData.lifecycle_status = recordData.lifecycle_status;

  const { error } = await supabase
    .from('records')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`更新记录失败: ${error.message}`);
  }

  // 替换标签关联
  if (tag_ids !== undefined) {
    await replaceRecordTags(userId, id, tag_ids);
  }

  // 重新获取带关联的数据
  const updated = await getRecordById(userId, id);
  if (!updated) {
    throw new Error('更新记录后获取失败');
  }
  return updated;
}

/**
 * 删除记录
 */
export async function deleteRecord(userId: string, id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('records')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除记录失败: ${error.message}`);
  }
}

/**
 * 根据 ID 获取记录（附带 tags、item）
 */
export async function getRecordById(
  userId: string,
  id: string
): Promise<Record | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('records')
    .select(`
      *,
      record_tags(tags(*)),
      record_days(date)
    `)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`获取记录失败: ${error.message}`);
  }

  if (!data) return null;

  // 后处理：获取关联的 item（单条记录，单独查询 item）
  const itemMap = new Map<string, { id: string; title: string }>();
  if (data.item_id) {
    const { data: itemData } = await supabase
      .from('items')
      .select('id, title')
      .eq('id', data.item_id)
      .maybeSingle();
    if (itemData) {
      itemMap.set(itemData.id, itemData);
    }
  }

  return enrichRecordWithRelations(data, itemMap);
}

/**
 * 列出记录（按 query 参数过滤，附带 tags、item）
 * 按 occurred_at desc, created_at desc 排序
 */
export async function listRecords(
  userId: string,
  query: RecordsQuery
): Promise<Record[]> {
  const supabase = await createClient();

  let q = supabase
    .from('records')
    .select(`
      *,
      record_tags(tags(*)),
      record_days(date)
    `)
    .eq('user_id', userId);

  // 按 query 参数过滤
  if (query.date) {
    // 通过记录日的 date 过滤
    const { data: dayData } = await supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId)
      .eq('date', query.date);

    if (dayData && dayData.length > 0) {
      const dayIds = dayData.map((d: { id: string }) => d.id);
      // 同时包含: 该日的正常记录 OR 投影到该日的计划记录（time_anchor_date 匹配）
      q = q.or(`record_day_id.in.(${dayIds.join(',')}),and(type.eq.计划,time_anchor_date.eq.${query.date})`);
    } else {
      // 没有当日记录日，但可能有投影的计划
      q = q.eq('type', '计划').eq('time_anchor_date', query.date);
    }
  } else if (query.date_from || query.date_to) {
    // 按日期范围过滤（同时包含计划投影）
    let dayQuery = supabase
      .from('record_days')
      .select('id')
      .eq('user_id', userId);

    if (query.date_from) {
      dayQuery = dayQuery.gte('date', query.date_from);
    }
    if (query.date_to) {
      dayQuery = dayQuery.lte('date', query.date_to);
    }

    const { data: dayData } = await dayQuery;

    // 构建 OR 条件：正常记录 + 投影到该范围内的计划记录
    const orParts: string[] = [];
    if (dayData && dayData.length > 0) {
      const dayIds = dayData.map((d: { id: string }) => d.id);
      orParts.push(`record_day_id.in.(${dayIds.join(',')})`);
    }
    // 计划投影：type=计划 且 time_anchor_date 在范围内
    if (query.date_from && query.date_to) {
      orParts.push(`and(type.eq.计划,time_anchor_date.gte.${query.date_from},time_anchor_date.lte.${query.date_to})`);
    } else if (query.date_from) {
      orParts.push(`and(type.eq.计划,time_anchor_date.gte.${query.date_from})`);
    } else if (query.date_to) {
      orParts.push(`and(type.eq.计划,time_anchor_date.lte.${query.date_to})`);
    }

    if (orParts.length > 0) {
      q = q.or(orParts.join(','));
    } else {
      return [];
    }
  }

  if (query.item_id) {
    q = q.eq('item_id', query.item_id);
  }
  if (query.type) {
    q = q.eq('type', query.type);
  }
  if (query.is_starred !== undefined) {
    q = q.eq('is_starred', query.is_starred);
  }
  if (query.tag_id) {
    // 通过 record_tags 过滤
    const { data: tagRecords } = await supabase
      .from('record_tags')
      .select('record_id')
      .eq('tag_id', query.tag_id);

    if (tagRecords && tagRecords.length > 0) {
      const recordIds = tagRecords.map((t: { record_id: string }) => t.record_id);
      q = q.in('id', recordIds);
    } else {
      return [];
    }
  }

  if (query.search) {
    const escaped = query.search.replace(/[%_\\]/g, '\\$&');
    q = q.ilike('content', `%${escaped}%`);
  }

  const { data, error } = await q
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(query.limit || 500);

  if (error) {
    throw new Error(`列出记录失败: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  // 批量获取关联的 item（避免 N+1）
  const itemIds = [...new Set(data.filter((r: any) => r.item_id).map((r: any) => r.item_id as string))];
  const itemMap = new Map<string, { id: string; title: string }>();
  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, title')
      .in('id', itemIds);
    for (const item of (itemsData ?? [])) {
      itemMap.set(item.id, item);
    }
  }

  return data.map((row: any) => enrichRecordWithRelations(row, itemMap));
}

/**
 * 后处理：为 record 附带 item 关联数据（同步，使用预加载的 itemMap）
 */
function enrichRecordWithRelations(
  row: Record & { record_tags?: { tags: Tag }[]; record_days?: { date: string } | null },
  itemMap: Map<string, { id: string; title: string }>
): Record {
  const record: Record = { ...row };

  // 处理 date（从 record_days 关联中提取）
  if (row.record_days) {
    record.date = row.record_days.date;
    delete (record as Record & { record_days?: unknown }).record_days;
  }

  // 处理 tags（从 record_tags 关联中提取）
  if (row.record_tags) {
    record.tags = row.record_tags.map((rt: { tags: Tag }) => rt.tags);
    delete (record as Record & { record_tags?: unknown }).record_tags;
  }

  // 从预加载的 itemMap 中取 item
  record.item = (row.item_id ? itemMap.get(row.item_id) ?? null : null);

  return record;
}
