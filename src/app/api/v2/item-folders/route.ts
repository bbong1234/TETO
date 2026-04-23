import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getItemFolders, createItemFolder } from '@/lib/db/item-folders';
import type { CreateItemFolderPayload } from '@/types/teto';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const result = await getItemFolders(userId);
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
    const body: CreateItemFolderPayload = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'name 为必填字段' }, { status: 400 });
    }

    const folder = await createItemFolder(userId, body);
    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
