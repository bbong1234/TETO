// 任务记录API - 处理任务记录的获取和保存
import { NextResponse } from 'next/server';
import { getTaskRecordsByDate, saveTaskRecord, getTaskRecordsByDateRange, getAllTaskRecords } from '@/lib/db/tasks';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const all = url.searchParams.get('all');

    if (date) {
      // 获取指定日期的记录（今日视图）
      const records = await getTaskRecordsByDate(userId, date);
      return NextResponse.json(records);
    } else if (startDate && endDate) {
      // 获取日期范围内的记录
      const records = await getTaskRecordsByDateRange(userId, startDate, endDate);
      return NextResponse.json(records);
    } else if (all === 'true') {
      // 获取所有记录（全量视图）
      const records = await getAllTaskRecords(userId);
      return NextResponse.json(records);
    } else {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }
  } catch (error) {
    console.error('获取任务记录失败:', error);
    return NextResponse.json({ error: '获取任务记录失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const recordData = await request.json();
    const { task_id, record_date, value_boolean, value_number } = recordData;

    if (!task_id || !record_date) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const savedRecord = await saveTaskRecord(userId, task_id, record_date, {
      value_boolean,
      value_number
    });

    if (!savedRecord) {
      return NextResponse.json({ error: '保存任务记录失败' }, { status: 500 });
    }

    return NextResponse.json(savedRecord, { status: 201 });
  } catch (error) {
    console.error('保存任务记录失败:', error);
    return NextResponse.json({ error: '保存任务记录失败' }, { status: 500 });
  }
}
