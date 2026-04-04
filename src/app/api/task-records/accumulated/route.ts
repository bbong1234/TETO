import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getTaskPeriodAccumulatedValue } from '@/lib/db/tasks';

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { task_id, period, custom_period_days, base_date } = body;

    if (!task_id || !period) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const accumulated = await getTaskPeriodAccumulatedValue(
      userId,
      task_id,
      period,
      custom_period_days,
      base_date
    );

    return NextResponse.json(accumulated);
  } catch (error) {
    console.error('获取周期内累计记录失败:', error);
    return NextResponse.json({ error: '获取周期内累计记录失败' }, { status: 500 });
  }
}
