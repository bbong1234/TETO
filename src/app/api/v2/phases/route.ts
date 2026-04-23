import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createPhase, getPhases } from '@/lib/db/phases';
import { createClient } from '@/lib/supabase/server';
import type { PhasesQuery, CreatePhasePayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: PhasesQuery = {};
    const item_id = searchParams.get('item_id');
    const status = searchParams.get('status');
    const is_historical = searchParams.get('is_historical');

    if (item_id) query.item_id = item_id;
    if (status) query.status = status as PhasesQuery['status'];
    if (is_historical !== null) query.is_historical = is_historical === 'true';

    const result = await getPhases(userId, query);
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
    const body: CreatePhasePayload = await request.json();

    // 校验必填字段
    if (!body.item_id) {
      return NextResponse.json({ error: 'item_id 为必填字段' }, { status: 400 });
    }
    if (!body.title) {
      return NextResponse.json({ error: 'title 为必填字段' }, { status: 400 });
    }

    const supabase = await createClient();

    // 校验 item 归属
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

    const phase = await createPhase(userId, body);
    return NextResponse.json({ data: phase }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
