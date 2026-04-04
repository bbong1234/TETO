// 单个任务API - 处理任务的更新和删除
import { NextRequest, NextResponse } from 'next/server';
import { updateTask, deleteTask } from '@/lib/db/tasks';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const taskData = await request.json();
    const { id } = await params;
    console.log('API PUT request - taskId:', id);
    const updatedTask = await updateTask(userId, id, taskData);

    if (!updatedTask) {
      return NextResponse.json({ error: '更新任务失败' }, { status: 500 });
    }

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('更新任务失败:', error);
    return NextResponse.json({ error: '更新任务失败' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { id } = await params;
    const success = await deleteTask(userId, id);

    if (!success) {
      return NextResponse.json({ error: '删除任务失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除任务失败:', error);
    return NextResponse.json({ error: '删除任务失败' }, { status: 500 });
  }
}
