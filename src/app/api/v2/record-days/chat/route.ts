import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';

export const runtime = 'nodejs';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/v2/record-days/chat
 * 基于当日日记与时间线进行对话式提问与补充建议
 */
export async function POST(req: NextRequest) {
  const ctx = withTrace(req);
  try {
    await getCurrentUserId();
    const body = await req.json();
    const {
      date,
      messages = [],
      diaryPlainText = '',
      recordsSummary = '',
    } = body as {
      date?: string;
      messages?: ChatTurn[];
      diaryPlainText?: string;
      recordsSummary?: string;
    };

    const turns = Array.isArray(messages)
      ? messages.filter(
          (message): message is ChatTurn =>
            message &&
            typeof message === 'object' &&
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string'
        )
      : [];

    const lastUser = [...turns].reverse().find((message) => message.role === 'user');
    if (!lastUser?.content.trim()) {
      return apiSuccess(
        { reply: '可以先告诉我今天有什么感受，或问我哪里还可以补充。', is_fallback: true },
        ctx.traceId
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return apiSuccess(
        {
          reply:
            '今天的时间线和日记我都看到了。你觉得还有哪些感受或细节想写进日记？（未配置 AI 密钥，暂为离线提示）',
          is_fallback: true,
        },
        ctx.traceId
      );
    }

    const systemPrompt = `你是个人日记助手。用户正在写 ${date ?? '当天'} 的日记。

你会收到：
1. 当日时间线记录摘要
2. 用户当前日记正文（含与时间线关联的内容）

你的任务：
- 用简短、温和的中文向用户提问，帮助发现遗漏的感受、细节或反思
- 可以建议 1 句可追加到日记的自由文本（不要重写整篇日记）
- 不要捏造时间线中不存在的事实
- 不要输出 markdown 列表，保持口语化
- 回复控制在 120 字以内

如果适合追加一句日记，在回复最后一行单独输出：
SUGGEST_APPEND: <建议追加的一句话>`;

    const contextBlock = [
      date ? `日期：${date}` : '',
      recordsSummary ? `时间线：\n${recordsSummary}` : '时间线：（暂无记录）',
      diaryPlainText ? `日记：\n${diaryPlainText}` : '日记：（尚未撰写）',
    ]
      .filter(Boolean)
      .join('\n\n');

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: contextBlock },
      ...turns.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    ];

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: chatMessages,
        temperature: 0.6,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek diary chat error:', errorText);
      return apiSuccess(
        {
          reply: '暂时无法连接 AI，你可以先手动补充日记，或稍后再试。',
          is_fallback: true,
        },
        ctx.traceId
      );
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content?.trim() || '') as string;

    let suggestedAppend: string | undefined;
    let reply = raw;
    const suggestMatch = raw.match(/\nSUGGEST_APPEND:\s*([\s\S]+)$/);
    if (suggestMatch) {
      suggestedAppend = suggestMatch[1].trim();
      reply = raw.replace(/\nSUGGEST_APPEND:\s*[\s\S]+$/, '').trim();
    }

    return apiSuccess(
      {
        reply: reply || '还有什么想补充的吗？',
        suggestedAppend,
        is_fallback: false,
      },
      ctx.traceId
    );
  } catch (err: unknown) {
    console.error('Diary chat API error:', err);
    const message = err instanceof Error ? err.message : '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
