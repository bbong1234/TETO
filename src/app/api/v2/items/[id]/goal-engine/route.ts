import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { computeGoalEngineForItem } from '@/lib/db/goal-engine';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/v2/items/{id}/goal-engine
 * 返回该事项下所有量化目标的引擎计算结果数组
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id: itemId } = await params;

    // 校验事项归属
    const supabase = await createClient();
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, user_id')
      .eq('id', itemId)
      .maybeSingle();

    if (itemError) {
      throw new Error(`查询事项失败: ${itemError.message}`);
    }

    if (!item || item.user_id !== userId) {
      return NextResponse.json({ error: '事项不存在或不属于当前用户' }, { status: 404 });
    }

    const results = await computeGoalEngineForItem(userId, itemId);
    return NextResponse.json({ data: results });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
