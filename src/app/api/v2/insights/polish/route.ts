import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * POST /api/v2/insights/polish
 * 接受事实总结列表，用 LLM 润色为更自然的中文表述
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { facts, context } = body as { facts: string[]; context?: string };

    if (!facts || !Array.isArray(facts) || facts.length === 0) {
      return NextResponse.json({ error: '需要提供事实列表' }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      // 无API Key时直接返回原始事实
      return NextResponse.json({ data: { polished: facts.join('\n'), is_fallback: true } });
    }

    const systemPrompt = `你是一个个人效率分析助手。用户会给你一组基于数据的事实陈述（由规则自动生成），请将它们润色为一段自然、连贯的中文总结。

要求：
1. 保留所有事实要点，不遗漏、不添加虚假信息
2. 语气友好但客观，像朋友间的建议
3. 用1-2段话组织，按主题分组（目标进展/计划执行/投入产出/时间分布）
4. 不要用列表格式，用自然段落
5. 字数控制在200字以内
6. 不要使用emoji`;

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
      return NextResponse.json({ data: { polished: facts.join('\n'), is_fallback: true } });
    }

    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content?.trim() || facts.join('\n');

    return NextResponse.json({ data: { polished, is_fallback: false } });
  } catch (err: any) {
    console.error('Polish API error:', err);
    return NextResponse.json(
      { data: { polished: '润色暂时不可用', is_fallback: true } },
      { status: 200 }
    );
  }
}
