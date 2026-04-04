// 任务API - 处理任务的获取和创建
import { NextResponse } from 'next/server';
import { getTasks, createTask } from '@/lib/db/tasks';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const tasks = await getTasks(userId);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('获取任务失败:', error);
    return NextResponse.json({ error: '获取任务失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const taskData = await request.json();
    const newTask = await createTask(userId, taskData);

    if (!newTask) {
      return NextResponse.json({ error: '创建任务失败' }, { status: 500 });
    }

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error('创建任务失败:', error);
    return NextResponse.json({ error: '创建任务失败' }, { status: 500 });
  }
}
