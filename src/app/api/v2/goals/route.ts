import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createGoal, getGoals } from '@/lib/db/goals';
import type { GoalsQuery, CreateGoalPayload } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: GoalsQuery = {};
    const status = searchParams.get('status');
    const item_id = searchParams.get('item_id');
    const phase_id = searchParams.get('phase_id');
    if (status) query.status = status as GoalsQuery['status'];
    if (item_id) query.item_id = item_id;
    if (phase_id) query.phase_id = phase_id;

    const result = await getGoals(userId, query);
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
    const body: CreateGoalPayload = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: 'title 为必填字段' }, { status: 400 });
    }

    const goal = await createGoal(userId, body);
    return NextResponse.json({ data: goal }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
