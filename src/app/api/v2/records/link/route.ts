import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/v2/records/link
 * 将两条记录建立关联（设置 linked_record_id）
 *
 * Body: { record_id: string; linked_record_id: string | null }
 *   - linked_record_id = null 表示取消关联
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { record_id, linked_record_id } = body as {
      record_id?: string;
      linked_record_id?: string | null;
    };

    if (!record_id) {
      return NextResponse.json({ error: 'record_id 为必填字段' }, { status: 400 });
    }

    const supabase = await createClient();

    // 验证 record 归属
    const { data: record, error: recErr } = await supabase
      .from('records')
      .select('id, user_id')
      .eq('id', record_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (recErr) throw new Error(`查询记录失败: ${recErr.message}`);
    if (!record) {
      return NextResponse.json({ error: '记录不存在或不属于当前用户' }, { status: 404 });
    }

    // 如果要关联，验证目标记录归属
    if (linked_record_id) {
      const { data: linked, error: linkErr } = await supabase
        .from('records')
        .select('id, user_id')
        .eq('id', linked_record_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (linkErr) throw new Error(`查询关联记录失败: ${linkErr.message}`);
      if (!linked) {
        return NextResponse.json({ error: '关联目标记录不存在或不属于当前用户' }, { status: 404 });
      }

      // 防止自关联
      if (linked_record_id === record_id) {
        return NextResponse.json({ error: '不能关联自己' }, { status: 400 });
      }
    }

    // 更新 linked_record_id
    const { error: updateErr } = await supabase
      .from('records')
      .update({ linked_record_id: linked_record_id ?? null })
      .eq('id', record_id)
      .eq('user_id', userId);

    if (updateErr) throw new Error(`更新关联失败: ${updateErr.message}`);

    return NextResponse.json({ data: { record_id, linked_record_id: linked_record_id ?? null } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
