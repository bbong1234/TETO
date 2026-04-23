import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateTag, deleteTag } from '@/lib/db/tags';
import { createClient } from '@/lib/supabase/server';
import type { UpdateTagPayload } from '@/types/teto';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`获取标签失败: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ error: '标签不存在或不属于当前用户' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateTagPayload = await request.json();

    const tag = await updateTag(userId, id, body);
    return NextResponse.json({ data: tag });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    await deleteTag(userId, id);
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
