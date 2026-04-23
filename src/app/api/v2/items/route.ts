import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createItem, listItems } from '@/lib/db/items';
import type { ItemsQuery, CreateItemPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: ItemsQuery = {};
    const status = searchParams.get('status');
    const is_pinned = searchParams.get('is_pinned');
    if (status) query.status = status as ItemsQuery['status'];
    if (is_pinned !== null) query.is_pinned = is_pinned === 'true';

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
