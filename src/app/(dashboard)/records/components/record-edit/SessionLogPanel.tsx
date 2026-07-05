'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, Bot, User } from 'lucide-react';
import type { ActivityEvent, ActivityEventType } from '@/types/teto';

const EVENT_TYPE_LABELS: Partial<Record<ActivityEventType, string>> = {
  progress: '进展',
  idea: '想法',
  plan: '计划',
  milestone: '里程碑',
  pause: '已暂停',
  resume: '已恢复',
  sub_start: '子任务开始',
  sub_end: '子任务结束',
};

function EventBubble({ event }: { event: ActivityEvent }) {
  const isUser = event.event_type === 'ai_user';
  const isAi = event.event_type === 'ai_reply';
  const isSystem = !isUser && !isAi;

  const time = new Date(event.occurred_at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSystem && !event.content?.trim()) return null;

  if (isSystem) {
    const label = EVENT_TYPE_LABELS[event.event_type];
    return (
      <div className="flex items-center gap-2 py-0.5">
        <div className="flex-1 border-t border-slate-100" />
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          event.event_type === 'milestone' ? 'bg-amber-50 text-amber-600' :
          event.event_type === 'idea' ? 'bg-purple-50 text-purple-600' :
          event.event_type === 'plan' ? 'bg-indigo-50 text-indigo-600' :
          'bg-slate-100 text-slate-400'
        }`}>
          {label ?? event.event_type}
          {event.content ? `：${event.content}` : ''}
        </span>
        <div className="flex-1 border-t border-slate-100" />
        <span className="shrink-0 text-[9px] text-slate-300">{time}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-500' : 'bg-slate-200'
      }`}>
        {isUser ? <User className="h-3 w-3 text-white" /> : <Bot className="h-3 w-3 text-slate-500" />}
      </div>
      <div className={`max-w-[85%] space-y-0.5 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
          isUser
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : 'bg-slate-100 text-slate-700 rounded-tl-sm'
        }`}>
          {event.content}
        </div>
        <span className="text-[9px] text-slate-300 px-1">{time}</span>
      </div>
    </div>
  );
}

interface SessionLogPanelProps {
  sessionId: string;
}

export default function SessionLogPanel({ sessionId }: SessionLogPanelProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v2/activity-events?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data && Array.isArray(data.data)) {
          setEvents(data.data as ActivityEvent[]);
        } else {
          setError('加载失败');
        }
      })
      .catch(() => {
        if (!cancelled) setError('加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  const visibleEvents = events.filter(
    (e) => e.event_type !== 'structured'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-center text-xs text-slate-400">{error}</p>;
  }

  if (visibleEvents.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">暂无对话记录</p>;
  }

  return (
    <div className="space-y-2">
      {visibleEvents.map((event) => (
        <EventBubble key={event.id} event={event} />
      ))}
    </div>
  );
}

export function SessionLogSection({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <MessageCircle className="h-4 w-4 text-slate-400" />
        <span className="flex-1 text-left">块时间对话原文</span>
        <span className="text-[10px] text-slate-400">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <SessionLogPanel sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
