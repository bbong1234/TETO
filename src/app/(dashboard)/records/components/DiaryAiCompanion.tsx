'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';
import { diaryDocumentToPlainText, summarizeRecordsForChat } from '@/lib/activity/diary-document';
import { genTraceId } from '@/lib/observability/id-registry';
import { jsonHeadersWithTrace } from '@/lib/observability/client-request';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface DiaryAiCompanionProps {
  date: string;
  body: string;
  dayRecords: TetoRecord[];
  onAppendToDiary: (text: string) => void;
  onError: (message: string) => void;
  fillHeight?: boolean;
}

function ChatBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={[
          'max-w-[90%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed',
          isUser ? 'bg-[#95ec69] text-slate-800' : 'bg-slate-100 text-slate-700',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  );
}

export default function DiaryAiCompanion({
  date,
  body,
  dayRecords,
  onAppendToDiary,
  onError,
  fillHeight = false,
}: DiaryAiCompanionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '我可以根据你今天的时间线和日记提问，或建议补充内容。有什么想聊的？',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestedAppend, setSuggestedAppend] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, suggestedAppend]);

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: '我可以根据你今天的时间线和日记提问，或建议补充内容。有什么想聊的？',
      },
    ]);
    setSuggestedAppend(null);
    setInput('');
  }, [date]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setSuggestedAppend(null);

    try {
      const traceId = genTraceId();
      const res = await fetch('/api/v2/record-days/chat', {
        method: 'POST',
        headers: jsonHeadersWithTrace(traceId),
        body: JSON.stringify({
          date,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
          diaryBlocks: [],
          recordsSummary: summarizeRecordsForChat(dayRecords),
          diaryPlainText: diaryDocumentToPlainText({ version: 3, body, links: [], contextNotes: '' }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'AI 回复失败');

      const reply = json.data?.reply?.trim();
      if (reply) {
        setMessages((prev) => [
          ...prev,
          { id: `assistant-${Date.now()}`, role: 'assistant', text: reply },
        ]);
      }
      const append = json.data?.suggestedAppend?.trim();
      if (append) setSuggestedAppend(append);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'AI 回复失败');
    } finally {
      setSending(false);
    }
  }, [body, date, dayRecords, input, messages, onError, sending]);

  return (
    <div
      className={
        fillHeight
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80'
          : 'mt-2 flex h-[min(240px,32vh)] min-h-[160px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80'
      }
    >
      <div className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500">
        AI 日记助手
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role} text={message.text} />
        ))}
        {suggestedAppend && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-2">
            <p className="text-[11px] text-slate-600">建议补充到日记：</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-800">{suggestedAppend}</p>
            <button
              type="button"
              onClick={() => {
                onAppendToDiary(suggestedAppend);
                setSuggestedAppend(null);
              }}
              className="mt-2 rounded-md bg-indigo-500 px-2 py-1 text-[11px] text-white hover:bg-indigo-600"
            >
              采纳到日记
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-2 py-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="向 AI 提问或请它帮你补充日记…"
          disabled={sending}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={sending || !input.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40"
          aria-label="发送"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
