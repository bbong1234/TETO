import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById, createRecord, updateRecord } from '@/lib/db/records';
import { createRecordLink } from '@/lib/db/record-links';

/**
 * POST /api/v2/records/[id]/complete
 * 完成一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 新建一条"发生"记录（content 相同，occurred_at = now）
 * 3. 创建 record_link: 新记录 → 原记录，link_type = 'completes'
 * 4. 原记录 lifecycle_status 标记为 'completed'
 * 5. 返回新创建的记录
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    // 获取原记录
    const original = await getRecordById(userId, id);
    if (!original) {
      return NextResponse.json({ error: '记录不存在或不属于当前用户' }, { status: 404 });
    }

    // 验证类型必须为"计划"
    if (original.type !== '计划') {
      return NextResponse.json({ error: '仅计划类型的记录可以执行"完成"操作' }, { status: 400 });
    }

    // 验证当前状态
    if (original.lifecycle_status && original.lifecycle_status !== 'active') {
      return NextResponse.json({ error: `该记录已处于 ${original.lifecycle_status} 状态，无法完成` }, { status: 400 });
    }

    // 新建一条"发生"记录
    const now = new Date().toISOString();
    const newRecord = await createRecord(userId, {
      content: original.content,
      date: new Date().toISOString().split('T')[0],
      type: '发生',
      occurred_at: now,
      item_id: original.item_id || undefined,
      goal_id: original.goal_id || undefined,
      mood: original.mood || undefined,
      energy: original.energy || undefined,
      duration_minutes: original.duration_minutes ?? undefined,
      location: original.location || undefined,
      people: original.people || undefined,
    });

    // 创建关联: 新记录 completes 原记录
    await createRecordLink(userId, {
      source_id: newRecord.id,
      target_id: id,
      link_type: 'completes',
    });

    // 标记原记录 lifecycle_status = completed
    await updateRecord(userId, id, { lifecycle_status: 'completed' });

    return NextResponse.json({ data: newRecord }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
