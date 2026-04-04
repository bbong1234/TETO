import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { updateTaskGoal, deleteTaskGoal } from '@/lib/db/tasks';
import type { TaskGoalFormValues } from '@/types/tasks';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const values = await request.json();

    const goal = await updateTaskGoal(userId, id, values as TaskGoalFormValues);

    if (!goal) {
      return NextResponse.json({ error: '更新目标值失败' }, { status: 500 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error('更新目标值失败:', error);
    return NextResponse.json({ error: '更新目标值失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const success = await deleteTaskGoal(userId, id);

    if (!success) {
      return NextResponse.json({ error: '删除目标值失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除目标值失败:', error);
    return NextResponse.json({ error: '删除目标值失败' }, { status: 500 });
  }
}
