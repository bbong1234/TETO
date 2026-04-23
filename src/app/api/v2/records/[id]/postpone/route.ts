import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById, createRecord, updateRecord } from '@/lib/db/records';
import { createRecordLink } from '@/lib/db/record-links';

/**
 * POST /api/v2/records/[id]/postpone
 * 推迟一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 新建一条"计划"记录（content 相同，time_anchor_date = new_date）
 * 3. 创建 record_link: 新记录 → 原记录，link_type = 'postponed_from'
 * 4. 原记录 lifecycle_status 标记为 'postponed'
 * 5. 返回新创建的记录
 *
 * Body: { new_date: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body = await request.json();

    const { new_date } = body as { new_date?: string };
    if (!new_date) {
      return NextResponse.json({ error: 'new_date 为必填字段' }, { status: 400 });
    }

    // 获取原记录
    const original = await getRecordById(userId, id);
    if (!original) {
      return NextResponse.json({ error: '记录不存在或不属于当前用户' }, { status: 404 });
    }

    // 验证类型必须为"计划"
    if (original.type !== '计划') {
      return NextResponse.json({ error: '仅计划类型的记录可以执行"推迟"操作' }, { status: 400 });
    }

    // 验证当前状态
    if (original.lifecycle_status && original.lifecycle_status !== 'active') {
      return NextResponse.json({ error: `该记录已处于 ${original.lifecycle_status} 状态，无法推迟` }, { status: 400 });
    }

    // 新建一条"计划"记录，投影到新日期
    const newRecord = await createRecord(userId, {
      content: original.content,
      date: new_date,
      type: '计划',
      time_anchor_date: new_date,
      item_id: original.item_id || undefined,
      goal_id: original.goal_id || undefined,
      duration_minutes: original.duration_minutes ?? undefined,
      location: original.location || undefined,
      people: original.people || undefined,
    });

    // 创建关联: 新记录 postponed_from 原记录
    await createRecordLink(userId, {
      source_id: newRecord.id,
      target_id: id,
      link_type: 'postponed_from',
    });

    // 标记原记录 lifecycle_status = postponed
    await updateRecord(userId, id, { lifecycle_status: 'postponed' });

    return NextResponse.json({ data: newRecord }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
