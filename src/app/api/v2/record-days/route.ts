import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getOrCreateRecordDay, getRecordDayByDate, updateRecordDaySummary } from '@/lib/db/record-days';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (date) {
      const result = await getRecordDayByDate(userId, date);
      return NextResponse.json({ data: result });
    }

    // 列出所有记录日
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('record_days')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`获取记录日列表失败: ${error.message}`);
    }

    return NextResponse.json({ data: data ?? [] });
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
    const body = await request.json();

    if (!body.date) {
      return NextResponse.json({ error: 'date 为必填字段' }, { status: 400 });
    }

    let recordDay = await getOrCreateRecordDay(userId, body.date);

    if (body.summary) {
      recordDay = await updateRecordDaySummary(userId, recordDay.id, body.summary);
    }

    return NextResponse.json({ data: recordDay }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
