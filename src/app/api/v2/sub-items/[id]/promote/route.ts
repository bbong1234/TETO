import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getSubItemById, promoteSubItemToItem } from '@/lib/db/sub-items';

/**
 * POST /api/v2/sub-items/{id}/promote
 * 子项升格为独立事项
 *
 * Body:
 *   migrate_records: boolean (default: true) — 是否迁移历史记录
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    // 检查子项是否存在
    const subItem = await getSubItemById(userId, id);
    if (!subItem) {
      return NextResponse.json({ error: '子项不存在或不属于当前用户' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const migrateRecords = body.migrate_records !== false; // 默认 true

    const result = await promoteSubItemToItem(userId, id, migrateRecords);

    return NextResponse.json({
      data: {
        new_item_id: result.newItemId,
        sub_item: result.subItem,
        migrated_records: migrateRecords,
      }
    });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
