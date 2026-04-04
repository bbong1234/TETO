import { NextRequest, NextResponse } from 'next/server';
import { updateTaskSortOrder } from '@/lib/db/tasks';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { taskIds } = body;

    if (!Array.isArray(taskIds)) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const success = await updateTaskSortOrder(userId, taskIds);

    if (!success) {
      return NextResponse.json({ error: '更新任务排序失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新任务排序失败:', error);
    return NextResponse.json({ error: '更新任务排序失败' }, { status: 500 });
  }
}
