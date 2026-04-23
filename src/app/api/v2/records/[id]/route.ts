import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById, updateRecord, deleteRecord } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import type { UpdateRecordPayload } from '@/types/teto';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const record = await getRecordById(userId, id);
    if (!record) {
      return NextResponse.json({ error: '记录不存在或不属于当前用户' }, { status: 404 });
    }

    return NextResponse.json({ data: record });
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
    const body: UpdateRecordPayload = await request.json();

    // 校验 item 归属
    if (body.item_id) {
      const supabase = await createClient();

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

    const record = await updateRecord(userId, id, body);
    return NextResponse.json({ data: record });
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

    await deleteRecord(userId, id);
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
