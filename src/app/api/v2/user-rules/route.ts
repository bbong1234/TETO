import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import {
  getUserRules,
  getUserRuleById,
  createUserRule,
  updateUserRule,
  deleteUserRule,
  resetUserRules,
} from '@/lib/db/user-rules';
import type { RuleType, RuleSource } from '@/lib/db/user-rules';

const VALID_RULE_TYPES: RuleType[] = ['item_mapping', 'sub_item_mapping', 'type_routing', 'fuzzy_resolution'];
const VALID_SOURCES: RuleSource[] = ['ai_learned', 'user_set', 'system_default'];

/**
 * GET /api/v2/user-rules
 * 获取用户规则列表
 * Query: rule_type, is_active, source
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const rule_type = searchParams.get('rule_type') as RuleType | null;
    const is_active = searchParams.get('is_active');
    const source = searchParams.get('source') as RuleSource | null;

    if (rule_type && !VALID_RULE_TYPES.includes(rule_type)) {
      return NextResponse.json({ error: `rule_type 必须为: ${VALID_RULE_TYPES.join(', ')}` }, { status: 400 });
    }
    if (source && !VALID_SOURCES.includes(source)) {
      return NextResponse.json({ error: `source 必须为: ${VALID_SOURCES.join(', ')}` }, { status: 400 });
    }

    const rules = await getUserRules(userId, {
      rule_type: rule_type || undefined,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      source: source || undefined,
    });

    return NextResponse.json({ data: rules });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/v2/user-rules
 * 创建用户规则
 * Body: { rule_type, trigger_pattern, target_id?, target_type?, confidence?, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const { rule_type, trigger_pattern, target_id, target_type, confidence, source } = body as {
      rule_type?: string;
      trigger_pattern?: string;
      target_id?: string | null;
      target_type?: string | null;
      confidence?: string;
      source?: string;
    };

    if (!rule_type || !trigger_pattern) {
      return NextResponse.json({ error: 'rule_type 和 trigger_pattern 为必填' }, { status: 400 });
    }

    if (!VALID_RULE_TYPES.includes(rule_type as RuleType)) {
      return NextResponse.json({ error: `rule_type 必须为: ${VALID_RULE_TYPES.join(', ')}` }, { status: 400 });
    }

    if (target_type && !['item', 'sub_item'].includes(target_type)) {
      return NextResponse.json({ error: 'target_type 必须为: item 或 sub_item' }, { status: 400 });
    }

    if (confidence && !['high', 'medium', 'low'].includes(confidence)) {
      return NextResponse.json({ error: 'confidence 必须为: high, medium, low' }, { status: 400 });
    }

    const rule = await createUserRule(userId, {
      rule_type: rule_type as RuleType,
      trigger_pattern,
      target_id: target_id ?? null,
      target_type: (target_type as 'item' | 'sub_item') ?? null,
      confidence: (confidence as 'high' | 'medium' | 'low') ?? 'high',
      source: (source as RuleSource) ?? 'ai_learned',
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/v2/user-rules?id=xxx
 * 更新用户规则
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id 查询参数为必填' }, { status: 400 });
    }

    const body = await request.json();
    const rule = await updateUserRule(userId, id, body);

    return NextResponse.json({ data: rule });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/user-rules?id=xxx
 * 删除单条规则
 * 或 DELETE /api/v2/user-rules?reset=all
 * 或 DELETE /api/v2/user-rules?reset=item_mapping
 * 重置规则
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reset = searchParams.get('reset');

    if (reset) {
      // 重置模式
      const ruleType = reset === 'all' ? undefined : (reset as RuleType);
      if (ruleType && !VALID_RULE_TYPES.includes(ruleType)) {
        return NextResponse.json({ error: `reset 类型必须为: all, ${VALID_RULE_TYPES.join(', ')}` }, { status: 400 });
      }
      const count = await resetUserRules(userId, ruleType);
      return NextResponse.json({ data: { deleted_count: count } });
    }

    if (!id) {
      return NextResponse.json({ error: 'id 或 reset 参数为必填' }, { status: 400 });
    }

    await deleteUserRule(userId, id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
