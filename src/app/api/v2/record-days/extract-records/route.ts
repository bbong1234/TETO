import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess } from '@/lib/api/handler-wrapper';
import {
  buildExtractRecordsPrompt,
  parseExtractRecordsResponse,
} from '@/lib/activity/diary-extract-records';

export const runtime = 'nodejs';

/**
 * POST /api/v2/record-days/extract-records
 * 从日记正文中抽取可写入时间线的事件候选
 */
export async function POST(req: NextRequest) {
  const ctx = withTrace(req);
  try {
    await getCurrentUserId();
    const body = await req.json();
    const {
      date = '',
      diaryPlainText = '',
      recordsSummary = '',
      linkedRecordIds = [],
    } = body as {
      date?: string;
      diaryPlainText?: string;
      recordsSummary?: string;
      linkedRecordIds?: string[];
    };

    const plain = diaryPlainText.trim();
    if (!plain) {
      return apiSuccess({ candidates: [], is_fallback: true }, ctx.traceId);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return apiSuccess({ candidates: [], is_fallback: true }, ctx.traceId);
    }

    const { systemPrompt, userPrompt } = buildExtractRecordsPrompt({
      date,
      diaryPlainText: plain,
      recordsSummary,
      linkedRecordIds: Array.isArray(linkedRecordIds) ? linkedRecordIds : [],
    });

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
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek diary extract-records error:', errorText);
      return apiSuccess({ candidates: [], is_fallback: true }, ctx.traceId);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    const parsed = parseExtractRecordsResponse(content);

    return apiSuccess({ candidates: parsed, is_fallback: false }, ctx.traceId);
  } catch (err: unknown) {
    console.error('Diary extract-records API error:', err);
    const message = err instanceof Error ? err.message : '服务器错误';
    if (message === '请先登录' || message === '获取用户信息失败') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return apiSuccess({ candidates: [], is_fallback: true }, ctx.traceId);
  }
}
