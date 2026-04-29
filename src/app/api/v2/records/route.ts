import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createRecord, listRecords } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import type { RecordsQuery, CreateRecordPayload } from '@/types/teto';
import { RECORD_TYPES, LIFECYCLE_STATUSES } from '@/types/teto';
import { enhanceRecord } from '@/lib/ai/enhance-record';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验并返回 400 错误响应，通过则返回 null */
function validateRecordPayload(body: CreateRecordPayload): NextResponse | null {
  if (!body.content) {
    return NextResponse.json({ error: 'content 为必填字段' }, { status: 400 });
  }
  if (!body.date) {
    return NextResponse.json({ error: 'date 为必填字段' }, { status: 400 });
  }
  if (!DATE_REGEX.test(body.date)) {
    return NextResponse.json({ error: 'date 格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }
  if (body.type && !RECORD_TYPES.includes(body.type as typeof RECORD_TYPES[number])) {
    return NextResponse.json({ error: `type 必须为以下之一: ${RECORD_TYPES.join(', ')}` }, { status: 400 });
  }
  if (body.occurred_at && isNaN(Date.parse(body.occurred_at))) {
    return NextResponse.json({ error: 'occurred_at 格式无效，需为ISO-8601' }, { status: 400 });
  }
  if (body.lifecycle_status && !LIFECYCLE_STATUSES.includes(body.lifecycle_status as typeof LIFECYCLE_STATUSES[number])) {
    return NextResponse.json({ error: `lifecycle_status 必须为以下之一: ${LIFECYCLE_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (body.metric_value !== undefined && body.metric_value !== null && body.metric_value < 0) {
    return NextResponse.json({ error: 'metric_value 不能为负数' }, { status: 400 });
  }
  if (body.duration_minutes !== undefined && body.duration_minutes !== null && body.duration_minutes < 0) {
    return NextResponse.json({ error: 'duration_minutes 不能为负数' }, { status: 400 });
  }
  if (body.cost !== undefined && body.cost !== null && body.cost < 0) {
    return NextResponse.json({ error: 'cost 不能为负数' }, { status: 400 });
  }
  if (body.sort_order !== undefined && body.sort_order < 0) {
    return NextResponse.json({ error: 'sort_order 不能为负数' }, { status: 400 });
  }
  if (body.time_anchor_date && !DATE_REGEX.test(body.time_anchor_date)) {
    return NextResponse.json({ error: 'time_anchor_date 格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }
  if (body.data_nature && !['fact', 'inferred'].includes(body.data_nature)) {
    return NextResponse.json({ error: 'data_nature 必须为 fact 或 inferred' }, { status: 400 });
  }
  if (body.period_frequency && !['daily', 'weekly', 'monthly', 'irregular'].includes(body.period_frequency)) {
    return NextResponse.json({ error: 'period_frequency 必须为 daily/weekly/monthly/irregular' }, { status: 400 });
  }
  if (body.period_start_date && !DATE_REGEX.test(body.period_start_date)) {
    return NextResponse.json({ error: 'period_start_date 格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }
  if (body.period_end_date && !DATE_REGEX.test(body.period_end_date)) {
    return NextResponse.json({ error: 'period_end_date 格式无效，应为 YYYY-MM-DD' }, { status: 400 });
  }
  if (body.tag_ids) {
    if (!Array.isArray(body.tag_ids)) {
      return NextResponse.json({ error: 'tag_ids 必须为数组' }, { status: 400 });
    }
    for (const tagId of body.tag_ids) {
      if (typeof tagId !== 'string' || !UUID_REGEX.test(tagId)) {
        return NextResponse.json({ error: `无效的 tag_id: ${tagId}` }, { status: 400 });
      }
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: RecordsQuery = {};
    const date = searchParams.get('date');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const item_id = searchParams.get('item_id');
    const sub_item_id = searchParams.get('sub_item_id');
    const type = searchParams.get('type');
    const tag_id = searchParams.get('tag_id');
    const is_starred = searchParams.get('is_starred');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');

    if (date) query.date = date;
    if (date_from) query.date_from = date_from;
    if (date_to) query.date_to = date_to;
    if (item_id) query.item_id = item_id;
    if (sub_item_id) query.sub_item_id = sub_item_id;
    if (type) query.type = type as RecordsQuery['type'];
    if (tag_id) query.tag_id = tag_id;
    if (is_starred !== null) query.is_starred = is_starred === 'true';
    if (search) query.search = search;
    if (limit) query.limit = parseInt(limit, 10);

    const result = await listRecords(userId, query);
    return NextResponse.json({ data: result });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body: CreateRecordPayload = await request.json();

    const validationError = validateRecordPayload(body);
    if (validationError) return validationError;

    const supabase = await createClient();

    // 校验 item 归属
    if (body.item_id) {
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('id, user_id')
        .eq('id', body.item_id)
        .maybeSingle();

      if (itemError) {
        throw new Error(`查询事项失败: ${itemError.message}`);
      }

      if (!item || item.user_id !== userId) {
        return NextResponse.json({ error: '事项不存在或不属于当前用户' }, { status: 404 });
      }
    }

    const record = await createRecord(userId, body);

    // 异步 AI 增强：所有记录都触发，AI 会解析结构化字段并仅填空（不覆盖用户手动值）
    enhanceRecord(userId, record.id, body.content, body.date).catch((err) => {
      console.error('AI增强记录失败:', err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
