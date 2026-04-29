import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById, updateRecord } from '@/lib/db/records';

/**
 * POST /api/v2/records/[id]/cancel
 * 取消一条计划记录：
 * 1. 验证原记录类型为"计划"
 * 2. 验证当前状态为 active（或空）
 * 3. 标记 lifecycle_status = 'cancelled'
 * 4. 不生成新记录，不创建关联
 * 5. 返回更新后的记录
 *
 * 与 complete（生成"发生"记录）和 postpone（生成新计划记录）不同，
 * cancel 只改状态，不产生任何新记录。
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
      return NextResponse.json({ error: '仅计划类型的记录可以执行"取消"操作' }, { status: 400 });
    }

    // 验证当前状态
    if (original.lifecycle_status && original.lifecycle_status !== 'active') {
      return NextResponse.json({ error: `该记录已处于 ${original.lifecycle_status} 状态，无法取消` }, { status: 400 });
    }

    // 标记原记录 lifecycle_status = cancelled
    const updated = await updateRecord(userId, id, { lifecycle_status: 'cancelled' });

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
