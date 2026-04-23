import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/v2/records/batch-delete
 * 批量删除记录（仅删除属于当前用户的记录）
 * body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要删除的记录 ID 列表' }, { status: 400 });
    }

    if (ids.length > 200) {
      return NextResponse.json({ error: '单次最多删除 200 条记录' }, { status: 400 });
    }

    const supabase = await createClient();

    // 先验证所有权，只操作属于当前用户的记录
    const { data: ownedRecords } = await supabase
      .from('records')
      .select('id')
      .in('id', ids)
      .eq('user_id', userId);

    const ownedIds = (ownedRecords ?? []).map((r: { id: string }) => r.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ data: { deleted: 0 } });
    }

    // 先删除关联的 record_links（避免 RLS 阻止 CASCADE）
    await supabase
      .from('record_links')
      .delete()
      .or(`source_id.in.(${ownedIds.join(',')}),target_id.in.(${ownedIds.join(',')})`);

    // 删除关联的标签
    await supabase
      .from('record_tags')
      .delete()
      .in('record_id', ownedIds);

    // 删除记录（仅限当前用户的）
    const { error, count } = await supabase
      .from('records')
      .delete({ count: 'exact' })
      .in('id', ownedIds)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`批量删除失败: ${error.message}`);
    }

    return NextResponse.json({ data: { deleted: count } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
