import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getSubItemsByItemId, createSubItem } from '@/lib/db/sub-items';
import type { CreateSubItemPayload } from '@/types/teto';

/**
 * GET /api/v2/sub-items?item_id=xxx
 * 获取某事项下的所有子项
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    if (!itemId) {
      return NextResponse.json({ error: '缺少 item_id 参数' }, { status: 400 });
    }

    const subItems = await getSubItemsByItemId(userId, itemId);
    return NextResponse.json({ data: subItems });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/v2/sub-items
 * 创建子项
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body: CreateSubItemPayload = await request.json();

    if (!body.item_id || !body.title) {
      return NextResponse.json({ error: 'item_id 和 title 为必填项' }, { status: 400 });
    }

    const subItem = await createSubItem(userId, body);
    return NextResponse.json({ data: subItem }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
