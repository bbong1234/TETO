// 任务停用API - 处理任务的停用操作
import { NextResponse } from 'next/server';
import { deactivateTask } from '@/lib/db/tasks';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const success = await deactivateTask(userId, id);

    if (!success) {
      return NextResponse.json({ error: '停用任务失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('停用任务失败:', error);
    return NextResponse.json({ error: '停用任务失败' }, { status: 500 });
  }
}
