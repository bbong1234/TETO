import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById, updateRecord, deleteRecord } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import { createUserRule, findMatchingRules } from '@/lib/db/user-rules';
import type { UpdateRecordPayload } from '@/types/teto';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const record = await getRecordById(userId, id);
    if (!record) {
      return NextResponse.json({ error: '记录不存在或不属于当前用户' }, { status: 404 });
    }

    return NextResponse.json({ data: record });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body: UpdateRecordPayload = await request.json();

    // 校验 item 归属
    if (body.item_id) {
      const supabase = await createClient();

      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('id, user_id')
        .eq('id', body.item_id)
        .maybeSingle();

      if (itemError) {
        throw new Error(`查询事项失败: ${itemError.message}`);
      }

      if (!item || item.user_id !== userId) {
        return NextResponse.json({ error: '事项不存在或不属于当前用户' }, { status: 404 });
      }
    }

    // 被动规则学习：检测用户修正并自动写入规则
    try {
      const oldRecord = await getRecordById(userId, id);
      if (oldRecord) {
        // 1. item_id 修正学习
        if (body.item_id && body.item_id !== oldRecord.item_id && oldRecord.raw_input) {
          const keyword = oldRecord.raw_input.slice(0, 30); // 取原始输入前30字符作为触发模式
          const existing = await findMatchingRules(userId, keyword);
          const alreadyHas = existing.some(r => r.rule_type === 'item_mapping' && r.target_id === body.item_id);
          if (!alreadyHas) {
            await createUserRule(userId, {
              rule_type: 'item_mapping',
              trigger_pattern: keyword,
              target_id: body.item_id!,
              target_type: 'item',
              confidence: 'high',
              source: 'ai_learned',
            });
          }
        }

        // 2. type 修正学习（记录类型路由）
        if (body.type && body.type !== oldRecord.type && oldRecord.raw_input) {
          const keyword = oldRecord.raw_input.slice(0, 30);
          const existing = await findMatchingRules(userId, keyword);
          const alreadyHas = existing.some(r => r.rule_type === 'type_routing' && r.trigger_pattern === keyword);
          if (!alreadyHas) {
            await createUserRule(userId, {
              rule_type: 'type_routing',
              trigger_pattern: keyword,
              target_id: body.type!,
              target_type: null,
              confidence: 'medium',
              source: 'ai_learned',
            });
          }
        }
      }
    } catch (learnErr) {
      // 规则学习失败不影响主流程
      console.error('被动规则学习失败:', learnErr);
    }

    const record = await updateRecord(userId, id, body);
    return NextResponse.json({ data: record });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    await deleteRecord(userId, id);
    return NextResponse.json({ data: { id } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
