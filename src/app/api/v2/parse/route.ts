import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { parseSemantic } from '@/lib/ai/parse-semantic';
import { parseWithFallback, shouldFallback } from '@/lib/ai/parse-rules-fallback';

/**
 * POST /api/v2/parse
 * 调用 DeepSeek LLM 解析自然语言输入为语义结构
 *
 * Body: { input: string; date?: string }
 * Returns: { data: ParseSemanticResult }
 */
export async function POST(request: NextRequest) {
  try {
    // 验证登录
    await getCurrentUserId();

    const body = await request.json();
    const { input, date, recent_records, items } = body as {
      input?: string;
      date?: string;
      recent_records?: Array<{ id: string; content: string; date: string; type: string }>;
      items?: Array<{ id: string; title: string }>;
    };
    
    if (!input || !input.trim()) {
      return NextResponse.json({ error: 'input 为必填字段' }, { status: 400 });
    }

    if (input.length > 2000) {
      return NextResponse.json({ error: 'input 过长，最多2000字符' }, { status: 400 });
    }
    
    let result;
    try {
      result = await parseSemantic(input.trim(), date, recent_records, items);
    } catch (err: any) {
      // AI 解析失败 → 尝试本地规则兜底
      const fallbackReason = shouldFallback(err);
      if (fallbackReason) {
        const fallbackResult = parseWithFallback(input.trim(), date || new Date().toISOString().split('T')[0], items || [], fallbackReason);
        return NextResponse.json({ data: fallbackResult });
      }
      const message = err.message || '服务器错误';
      if (message === '请先登录' || message === '获取用户信息失败') {
        return NextResponse.json({ error: message }, { status: 401 });
      }
      if (message.includes('DeepSeek API')) {
        return NextResponse.json({ error: message }, { status: 502 });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ data: result });
  } catch (error: any) {
    const message = error.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
