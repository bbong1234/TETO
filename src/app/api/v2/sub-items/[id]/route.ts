import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getSubItemById, updateSubItem, deleteSubItem } from '@/lib/db/sub-items';
import type { UpdateSubItemPayload } from '@/types/teto';

/**
 * GET /api/v2/sub-items/{id}
 * 获取单个子项详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const subItem = await getSubItemById(userId, id);
    if (!subItem) {
      return NextResponse.json({ error: '子项不存在或不属于当前用户' }, { status: 404 });
    }

    return NextResponse.json({ data: subItem });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/v2/sub-items/{id}
 * 更新子项
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateSubItemPayload = await request.json();

    const subItem = await updateSubItem(userId, id, body);
    return NextResponse.json({ data: subItem });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/sub-items/{id}
 * 删除子项
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    await deleteSubItem(userId, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
