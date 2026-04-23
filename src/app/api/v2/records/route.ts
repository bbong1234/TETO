import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createRecord, listRecords } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import type { RecordsQuery, CreateRecordPayload } from '@/types/teto';
import { enhanceRecord } from '@/lib/ai/enhance-record';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: RecordsQuery = {};
    const date = searchParams.get('date');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const item_id = searchParams.get('item_id');
    const type = searchParams.get('type');
    const tag_id = searchParams.get('tag_id');
    const is_starred = searchParams.get('is_starred');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');

    if (date) query.date = date;
    if (date_from) query.date_from = date_from;
    if (date_to) query.date_to = date_to;
    if (item_id) query.item_id = item_id;
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

    // 校验必填字段
    if (!body.content) {
      return NextResponse.json({ error: 'content 为必填字段' }, { status: 400 });
    }
    if (!body.date) {
      return NextResponse.json({ error: 'date 为必填字段' }, { status: 400 });
    }

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

    // 异步 AI 增强：仅在没有手动指定 item_id 时触发
    if (!body.item_id) {
      enhanceRecord(userId, record.id, body.content, body.date).catch(() => {});
    }

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
