import { createClient } from '@/lib/supabase/server';
import type { Record, CreateRecordPayload, UpdateRecordPayload, RecordsQuery, Tag } from '@/types/teto';
import { getOrCreateRecordDay } from './record-days';
import { attachTagsToRecord, replaceRecordTags } from './tags';
import { computeTrustLevel } from '@/lib/trust/compute-trust';

/**
 * 创建记录
 * - 自动 upsert 记录日
 * - 如果有 time_anchor_date 且与 date 不同，用 time_anchor_date 决定 record_day_id
 *   （确保"昨天背了50个单词"这类记录挂在昨天的 record_day 下）
 * - 如果有 tag_ids，创建后关联标签
 */
export async function createRecord(
  userId: string,
  payload: CreateRecordPayload
): Promise<Record> {
  const supabase = await createClient();

  // 确定记录归属日期：优先使用 time_anchor_date（语义解析出的真实日期），否则用 date
  const recordDate = payload.time_anchor_date || payload.date;
  const recordDay = await getOrCreateRecordDay(userId, recordDate);

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
    try {
      await attachTagsToRecord(userId, data.id, tag_ids);
    } catch {
      // 标签附加失败时不回滚记录，避免客户端重试产生重复记录
      // 客户端可通过 PUT 重新设置标签
    }
  }

  // 重新获取带关联的数据
  try {
    const record = (await getRecordById(userId, data.id))!;
    // 计算可信度（新记录无 corrections）
    const trustResult = computeTrustLevel(record, 0);
    return { ...record, trust_level: trustResult.level, trust_detail: trustResult } as Record;
  } catch {
    // 即使获取完整数据失败，也返回已创建的记录
    return data as Record;
  }
}

/**
 * 更新记录
 * - 如果有 tag_ids，替换标签关联
 * - 如果 time_anchor_date 被更新，重新归属 record_day_id
 */
export async function updateRecord(
  userId: string,
  id: string,
  payload: UpdateRecordPayload
): Promise<Record> {
  const supabase = await createClient();

  const { tag_ids, ...recordData } = payload;

  // 如果 time_anchor_date 被更新，重新归属 record_day_id
  // 确保编辑后记录仍挂在正确的日期下
  let newRecordDayId: string | undefined;
  if (recordData.time_anchor_date !== undefined) {
    if (recordData.time_anchor_date) {
      // time_anchor_date 被设为新值：归属到新日期
      const recordDay = await getOrCreateRecordDay(userId, recordData.time_anchor_date);
      newRecordDayId = recordDay.id;
    } else {
      // time_anchor_date 被清空：需要回退到原始 date 对应的 record_day
      // 先查当前记录的 record_day 关联信息
      const { data: currentRecord } = await supabase
        .from('records')
        .select('record_day_id, record_days(date)')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (currentRecord?.record_days) {
        // 记录当前仍在原始日期下，无需变动
        // 但如果之前 time_anchor_date 导致 record_day 指向了锚定日期，
        // 这里需要将 record_day 归位到 date（通过 payload 中的 date 参数或记录原始日期）
        // 注意：清空 time_anchor_date 时，记录应保留在当前 record_day（因为 date 字段不再通过 payload 传入）
      }
    }
  }

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
  if (recordData.sub_item_id !== undefined) updateData.sub_item_id = recordData.sub_item_id;
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
  // 规律/历史字段
  if (recordData.data_nature !== undefined) updateData.data_nature = recordData.data_nature;
  if (recordData.is_period_rule !== undefined) updateData.is_period_rule = recordData.is_period_rule;
  if (recordData.period_start_date !== undefined) updateData.period_start_date = recordData.period_start_date;
  if (recordData.period_end_date !== undefined) updateData.period_end_date = recordData.period_end_date;
  if (recordData.period_frequency !== undefined) updateData.period_frequency = recordData.period_frequency;
  if (recordData.period_expanded !== undefined) updateData.period_expanded = recordData.period_expanded;
  if (recordData.period_source_id !== undefined) updateData.period_source_id = recordData.period_source_id;
  // === 三层九组 Phase 1 新增 ===
  if (recordData.occurred_at_end !== undefined) updateData.occurred_at_end = recordData.occurred_at_end;
  if (recordData.time_text !== undefined) updateData.time_text = recordData.time_text;
  if (recordData.time_precision !== undefined) updateData.time_precision = recordData.time_precision;
  if (recordData.action_text !== undefined) updateData.action_text = recordData.action_text;
  if (recordData.event_text !== undefined) updateData.event_text = recordData.event_text;
  if (recordData.object_text !== undefined) updateData.object_text = recordData.object_text;
  if (recordData.outcome_type !== undefined) updateData.outcome_type = recordData.outcome_type;
  if (recordData.outcome_direction !== undefined) updateData.outcome_direction = recordData.outcome_direction;
  if (recordData.cause_text !== undefined) updateData.cause_text = recordData.cause_text;
  if (recordData.place_type !== undefined) updateData.place_type = recordData.place_type;
  if (recordData.money_direction !== undefined) updateData.money_direction = recordData.money_direction;
  if (recordData.metrics !== undefined) updateData.metrics = recordData.metrics;
  if (recordData.relation_roles !== undefined) updateData.relation_roles = recordData.relation_roles;
  if (recordData.review_status !== undefined) updateData.review_status = recordData.review_status;
  if (recordData.confidence_level !== undefined) updateData.confidence_level = recordData.confidence_level;
  if (recordData.input_source !== undefined) updateData.input_source = recordData.input_source;
  // === 1.5 录入结构对齐新增 ===
  if (recordData.body_state !== undefined) updateData.body_state = recordData.body_state;
  if (recordData.money_currency !== undefined) updateData.money_currency = recordData.money_currency;
  // 如果 time_anchor_date 更新导致 record_day 需要重新归属，一并更新
  if (newRecordDayId) updateData.record_day_id = newRecordDayId;

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
  // 计算可信度（correctionCount 暂传 0，由 correction API 单独处理）
  const trustResult = computeTrustLevel(updated, 0);
  return { ...updated, trust_level: trustResult.level, trust_detail: trustResult } as Record;
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
      .eq('user_id', userId)
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
      // 使用 PostgREST 过滤语法，确保值安全转义
      const escapedDate = escapeOrValue(query.date);
      q = q.or(`record_day_id.in.(${dayIds.join(',')}),and(type.eq.计划,time_anchor_date.eq.${escapedDate})`);
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
      const from = escapeOrValue(query.date_from);
      const to = escapeOrValue(query.date_to);
      orParts.push(`and(type.eq.计划,time_anchor_date.gte.${from},time_anchor_date.lte.${to})`);
    } else if (query.date_from) {
      orParts.push(`and(type.eq.计划,time_anchor_date.gte.${escapeOrValue(query.date_from)})`);
    } else if (query.date_to) {
      orParts.push(`and(type.eq.计划,time_anchor_date.lte.${escapeOrValue(query.date_to)})`);
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
  if (query.sub_item_id) {
    q = q.eq('sub_item_id', query.sub_item_id);
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

  // 添加排序：同批次记录排在一起，批次内按 created_at 排序
  // occurred_at 为 NULL 的拆分记录应紧跟主记录，而非排在前面
  q = q
    .order('occurred_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  // 分页获取，突破 Supabase 默认 1000 行限制
  // limit=0 表示无上限
  const PAGE_SIZE = 1000;
  const requestedLimit = query.limit ?? 500;
  let data: any[];

  if (requestedLimit > 0 && requestedLimit <= PAGE_SIZE) {
    const result = await q.limit(requestedLimit);
    if (result.error) throw new Error(`列出记录失败: ${result.error.message}`);
    data = result.data || [];
  } else {
    data = [];
    let from = 0;
    const maxRows = requestedLimit > 0 ? requestedLimit : Number.MAX_SAFE_INTEGER;

    while (from < maxRows) {
      const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
      const { data: batch, error } = await q.range(from, to);
      if (error) throw new Error(`列出记录失败: ${error.message}`);
      if (!batch || batch.length === 0) break;
      data.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  if (!data || data.length === 0) return [];

  // 批量获取关联的 item（避免 N+1）
  const itemIds = [...new Set(data.filter((r: any) => r.item_id).map((r: any) => r.item_id as string))];
  const itemMap = new Map<string, { id: string; title: string }>();
  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, title')
      .eq('user_id', userId)
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

/**
 * 批量创建记录（用于历史导入）
 * - 预处理所有不重复日期的 record_day（批量 upsert）
 * - 一次性批量 insert 所有记录
 * - 跳过逐条 AI enhance（历史数据已定型，无需 AI 补全）
 * - 返回成功创建的记录数和错误列表
 */
export async function batchCreateRecords(
  userId: string,
  payloads: CreateRecordPayload[]
): Promise<{ success: number; failed: number; errors: string[]; createdIds: string[] }> {
  const supabase = await createClient();
  const errors: string[] = [];
  const createdIds: string[] = [];

  if (payloads.length === 0) {
    return { success: 0, failed: 0, errors: [], createdIds: [] };
  }

  // 1. 收集所有不重复的日期，批量 upsert record_days
  const dateSet = [...new Set(
    payloads.map(p => p.time_anchor_date || p.date).filter(Boolean) as string[]
  )];

  const dateToDayId = new Map<string, string>();

  if (dateSet.length > 0) {
    // 批量 upsert 所有不重复日期的 record_day
    const { data: dayData, error: dayError } = await supabase
      .from('record_days')
      .upsert(
        dateSet.map(d => ({ user_id: userId, date: d })),
        { onConflict: 'user_id,date' }
      )
      .select('id, date');

    if (dayError) {
      return { success: 0, failed: payloads.length, errors: [`批量创建记录日失败: ${dayError.message}`], createdIds: [] };
    }

    for (const day of (dayData ?? [])) {
      dateToDayId.set(day.date, day.id);
    }
  }

  // 2. 构建批量 insert 行
  const rows = payloads.map((p, index) => {
    const recordDate = p.time_anchor_date || p.date;
    const recordDayId = dateToDayId.get(recordDate);
    if (!recordDayId) {
      errors.push(`第 ${index + 1} 条: 无法找到或创建日期 ${recordDate} 的记录日`);
      return null;
    }
    const { tag_ids, date, ...recordData } = p;
    return {
      user_id: userId,
      record_day_id: recordDayId,
      ...recordData,
      type: recordData.type ?? '发生',
      sort_order: recordData.sort_order ?? 0,
      is_starred: recordData.is_starred ?? false,
      input_source: recordData.input_source ?? 'import',
    };
  }).filter(Boolean) as { [key: string]: unknown }[];

  if (rows.length === 0) {
    return { success: 0, failed: payloads.length, errors, createdIds: [] };
  }

  // 3. 分批 insert（Supabase 单次 insert 上限约 1000 行，用 500 一批更安全）
  const BATCH_SIZE = 500;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const { data, error: insertError } = await supabase
      .from('records')
      .insert(batch)
      .select('id');

    if (insertError) {
      errors.push(`批次插入失败(${offset + 1}-${Math.min(offset + BATCH_SIZE, rows.length)}): ${insertError.message}`);
      continue;
    }

    for (const row of (data ?? [])) {
      createdIds.push(row.id);
    }
  }

  const success = createdIds.length;
  const failed = payloads.length - success;
  return { success, failed, errors, createdIds };
}

/** 转义 PostgREST .or() 过滤值中的特殊字符 */
function escapeOrValue(value: string): string {
  return value.replace(/[,()]/g, '\\$&');
}
