import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getInsights } from '@/lib/db/insights';
import type { InsightsQuery } from '@/types/teto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');

    if (!date_from || !date_to) {
      return NextResponse.json(
        { error: 'date_from 和 date_to 为必填参数' },
        { status: 400 }
      );
    }

    const query: InsightsQuery = { date_from, date_to };
    const result = await getInsights(userId, query);
    return NextResponse.json({ data: result });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
