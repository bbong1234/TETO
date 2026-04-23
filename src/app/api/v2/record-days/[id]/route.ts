import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateRecordDaySummary } from '@/lib/db/record-days';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('record_days')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`获取记录日失败: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ error: '记录日不存在或不属于当前用户' }, { status: 404 });
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
    const body = await request.json();

    if (body.summary === undefined) {
      return NextResponse.json({ error: 'summary 为必填字段' }, { status: 400 });
    }

    const recordDay = await updateRecordDaySummary(userId, id, body.summary);
    return NextResponse.json({ data: recordDay });
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

    const supabase = await createClient();
    const { error } = await supabase
      .from('record_days')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`删除记录日失败: ${error.message}`);
    }

    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
