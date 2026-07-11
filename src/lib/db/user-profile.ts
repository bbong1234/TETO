import { createClient } from '@/lib/supabase/server';
import type { UserProfile, Record as TetoRecord } from '@/types/teto';
import { calcNetDurationMinutes } from '@/lib/activity/session-utils';

const MOOD_MAP: Record<string, number> = {
  '很好': 5, '好': 4, '一般': 3, '差': 2, '很差': 1,
};

function moodToNumber(mood: string | null | undefined): number | null {
  if (!mood) return null;
  return MOOD_MAP[mood] ?? null;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`查询用户画像失败: ${error.message}`);
  return data as UserProfile | null;
}

export async function deriveAndUpsertUserProfile(userId: string): Promise<UserProfile> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const { data: records, error } = await supabase
    .from('records')
    .select('id, item_id, occurred_at, occurred_at_end, duration_minutes, mood, type, lifecycle_status')
    .eq('user_id', userId)
    .eq('type', '发生')
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`派生用户画像失败: ${error.message}`);

  const rows = (records ?? []) as TetoRecord[];
  const hourBuckets = new Array(24).fill(0) as number[];
  const itemMinutes = new Map<string, { title: string; minutes: number }>();
  let pauseCount = 0;
  const moods: number[] = [];

  for (const r of rows) {
    const mins = r.duration_minutes ?? calcNetDurationMinutes(r);
    if (r.occurred_at) {
      const hour = new Date(r.occurred_at).getHours();
      hourBuckets[hour] += mins;
    }
    if (r.item_id) {
      const prev = itemMinutes.get(r.item_id) ?? { title: r.item_id, minutes: 0 };
      prev.minutes += mins;
      itemMinutes.set(r.item_id, prev);
    }
    if ((r.paused_total_seconds ?? 0) > 0) pauseCount += 1;
    const m = moodToNumber(r.mood);
    if (m != null) moods.push(m);
  }

  // 补 item titles
  const itemIds = [...itemMinutes.keys()];
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('items')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', itemIds);
    for (const item of items ?? []) {
      const entry = itemMinutes.get(item.id);
      if (entry) entry.title = item.title;
    }
  }

  const active_hours = hourBuckets
    .map((minutes, hour) => ({ hour, minutes }))
    .filter((h) => h.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6);

  const top_items = [...itemMinutes.entries()]
    .map(([item_id, v]) => ({ item_id, item_title: v.title, minutes: v.minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const totalMins = rows.reduce((s, r) => s + (r.duration_minutes ?? calcNetDurationMinutes(r)), 0);
  const sessionCount = rows.filter((r) => r.lifecycle_status === 'completed').length;
  const avg_focus_minutes = sessionCount > 0 ? Math.round(totalMins / sessionCount) : null;

  const avgMood = moods.length > 0
    ? moods.reduce((a, b) => a + b, 0) / moods.length
    : null;

  const profile: Omit<UserProfile, 'updated_at'> & { updated_at: string } = {
    user_id: userId,
    active_hours,
    avg_focus_minutes,
    top_items,
    interrupt_patterns: pauseCount > 0
      ? [{ label: '暂停/打断', count: pauseCount }]
      : [],
    mood_summary: {
      average: avgMood,
      trend: 'stable' as const,
    },
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from('user_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();

  if (upsertErr) throw new Error(`保存用户画像失败: ${upsertErr.message}`);
  return upserted as UserProfile;
}
