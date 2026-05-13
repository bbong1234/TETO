import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';

export const runtime = 'edge';

/**
 * POST /api/v2/insights/polish
 * 接受事实总结列表，用 LLM 润色为更自然的中文表述
 */
export async function POST(req: NextRequest) {
  const ctx = withTrace(req);
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const { facts, context } = body as { facts: string[]; context?: string };

    if (!facts || !Array.isArray(facts) || facts.length === 0) {
      return apiError(ERROR_CODES.INSIGHT_QUERY_INVALID, '需要提供事实列表', ctx.traceId, 400);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      // 无API Key时直接返回原始事实
      return apiSuccess({ polished: facts.join('\n'), is_fallback: true }, ctx.traceId);
    }

    const systemPrompt = `你是一个个人效率分析助手。用户会给你一组基于数据的事实陈述（由规则自动生成），请将它们润色为一段自然、连贯的中文总结。

要求：
1. 保留所有事实要点，不遗漏、不添加虚假信息
2. 不能新增事实（只能润色已有事实）
3. 不能修改任何数字
4. 不能做因果推断（不使用"因为"、"导致"、"所以"等词）
5. 不能给建议（不使用"应该"、"建议"、"可以尝试"等词）
6. 不能把相关说成导致
7. 用1-2段话组织，按主题分组
8. 不要用列表格式，用自然段落
9. 字数控制在200字以内
10. 不要使用emoji`;

    const userPrompt = context
      ? `背景：${context}\n\n事实：\n${facts.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}`
      : `事实：\n${facts.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek polish error:', errorText);
      return apiSuccess({ polished: facts.join('\n'), is_fallback: true }, ctx.traceId);
    }

    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content?.trim() || facts.join('\n');

    return apiSuccess({ polished, is_fallback: false }, ctx.traceId);
  } catch (err: any) {
    console.error('Polish API error:', err);
    const message = err.message || '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json(
      { data: { polished: '润色暂时不可用', is_fallback: true } },
      { status: 200 }
    );
  }
}
