import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export const runtime = 'nodejs';

/**
 * POST /api/v2/record-days/polish
 * 润色日记正文，不新增事实
 */
export async function POST(req: NextRequest) {
  const ctx = withTrace(req);
  try {
    await getCurrentUserId();
    const body = await req.json();
    const { diary, date } = body as { diary?: string; date?: string };

    const source = diary?.trim() ?? '';
    if (!source) {
      return apiSuccess({ polished: '', is_fallback: true }, ctx.traceId);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return apiSuccess({ polished: source, is_fallback: true }, ctx.traceId);
    }

    const systemPrompt = `你是个人日记写作助手。用户会给你一段日记草稿，请润色为更自然、连贯的中文段落。

要求：
1. 保留全部事实与感受，不遗漏、不捏造
2. 不能新增未出现的信息
3. 不能修改任何数字
4. 不做因果推断，不给建议
5. 用 1-2 段自然中文，不用列表
6. 不要使用 emoji`;

    const userPrompt = date
      ? `日期：${date}\n\n日记草稿：\n${source}`
      : `日记草稿：\n${source}`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek diary polish error:', errorText);
      return apiSuccess({ polished: source, is_fallback: true }, ctx.traceId);
    }

    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content?.trim() || source;

    return apiSuccess({ polished, is_fallback: false }, ctx.traceId);
  } catch (err: unknown) {
    console.error('Diary polish API error:', err);
    const message = err instanceof Error ? err.message : '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json(
      { data: { polished: '润色暂时不可用', is_fallback: true } },
      { status: 200 }
    );
  }
}
