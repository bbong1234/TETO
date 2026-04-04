import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createTaskGoal, getTaskGoal } from '@/lib/db/tasks';
import type { TaskGoalFormValues } from '@/types/tasks';

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 从查询参数中获取taskId
    const url = new URL(request.url);
    const taskId = url.searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json({ error: '缺少task_id参数' }, { status: 400 });
    }

    const goal = await getTaskGoal(userId, taskId);

    if (!goal) {
      return NextResponse.json({ error: '目标值不存在' }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error('获取目标值失败:', error);
    return NextResponse.json({ error: '获取目标值失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { task_id, ...values } = body;

    if (!task_id) {
      return NextResponse.json({ error: '缺少task_id参数' }, { status: 400 });
    }

    const goal = await createTaskGoal(userId, task_id, values as TaskGoalFormValues);

    if (!goal) {
      return NextResponse.json({ error: '创建目标值失败' }, { status: 500 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error('创建目标值失败:', error);
    return NextResponse.json({ error: '创建目标值失败' }, { status: 500 });
  }
}
