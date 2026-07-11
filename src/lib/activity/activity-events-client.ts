import type { ActivityEvent, ActivityEventType } from '@/types/teto';

export async function fetchSessionEvents(sessionId: string): Promise<ActivityEvent[]> {
  try {
    const res = await fetch(`/api/v2/activity-events?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []) as ActivityEvent[];
  } catch {
    return [];
  }
}

export async function postSessionEvent(params: {
  sessionId: string;
  eventType: ActivityEventType;
  content?: string;
  payload?: { [key: string]: unknown };
}): Promise<ActivityEvent | null> {
  try {
    const res = await fetch('/api/v2/activity-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: params.sessionId,
        event_type: params.eventType,
        content: params.content ?? '',
        payload: params.payload ?? {},
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data ?? null) as ActivityEvent | null;
  } catch {
    return null;
  }
}
