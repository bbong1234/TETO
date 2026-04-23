import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { computeGoalEngine } from '@/lib/db/goal-engine';

/**
 * GET /api/v2/goals/{id}/engine
 * 返回单个目标的量化引擎计算结果
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const result = await computeGoalEngine(userId, id);

    if (!result) {
      return NextResponse.json(
        { error: '目标不存在、非量化型或缺少必要配置（daily_target/start_date）' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
