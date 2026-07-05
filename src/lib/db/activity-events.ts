import { createClient } from '@/lib/supabase/server';
import type { ActivityEvent, CreateActivityEventPayload } from '@/types/teto';

export async function listActivityEvents(
  userId: string,
  sessionId: string
): Promise<ActivityEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });

  if (error) {
    throw new Error(`查询活动事件失败: ${error.message}`);
  }

  return (data ?? []) as ActivityEvent[];
}

export async function createActivityEvent(
  userId: string,
  payload: CreateActivityEventPayload
): Promise<ActivityEvent> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_events')
    .insert({
      user_id: userId,
      session_id: payload.session_id,
      event_type: payload.event_type,
      content: payload.content ?? '',
      payload: payload.payload ?? {},
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建活动事件失败: ${error.message}`);
  }

  return data as ActivityEvent;
}

export async function createActivityEvents(
  userId: string,
  payloads: CreateActivityEventPayload[]
): Promise<ActivityEvent[]> {
  if (payloads.length === 0) return [];
  const results: ActivityEvent[] = [];
  for (const p of payloads) {
    results.push(await createActivityEvent(userId, p));
  }
  return results;
}

export async function getRecentSessionEventsForContext(
  userId: string,
  sessionId: string,
  limit = 20
): Promise<ActivityEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`查询会话上下文失败: ${error.message}`);
  }

  return ((data ?? []) as ActivityEvent[]).reverse();
}
