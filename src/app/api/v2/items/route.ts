import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createItem, listItems } from '@/lib/db/items';
import { createClient } from '@/lib/supabase/server';
import type { ItemsQuery, CreateItemPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: ItemsQuery = {};
    const status = searchParams.get('status');
    const is_pinned = searchParams.get('is_pinned');
    const folder_id = searchParams.get('folder_id');
    if (status) query.status = status as ItemsQuery['status'];
    if (is_pinned !== null) query.is_pinned = is_pinned === 'true';
    if (folder_id !== null) query.folder_id = folder_id || null;

    const result = await listItems(userId, query);
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
    const body: CreateItemPayload = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: 'title 为必填字段' }, { status: 400 });
    }

    // 检查是否有同名的已完成/已归档事项（精确字符串匹配）
    const supabase = await createClient();
    const { data: existingItems } = await supabase
      .from('items')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('title', body.title.trim())
      .in('status', ['已完成', '已搁置']);

    if (existingItems && existingItems.length > 0) {
      const existing = existingItems[0];
      return NextResponse.json({
        data: null,
        conflict: {
          type: 'duplicate_name',
          existing_item_id: existing.id,
          existing_item_title: existing.title,
          existing_item_status: existing.status,
          message: `已存在同名事项「${existing.title}」（${existing.status}），是否在原事项下新建阶段重启？`,
        },
      }, { status: 409 });
    }

    const item = await createItem(userId, body);
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
