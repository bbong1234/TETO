'use client';

import { useEffect, useState } from 'react';
import { calcNetElapsedSeconds } from '@/lib/activity/session-utils';
import type { Record as TetoRecord } from '@/types/teto';

/** 从 startIso 起至今的经过秒数，每秒刷新 */
export function useElapsedSeconds(startIso: string | null | undefined): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startIso) {
      setElapsedSeconds(0);
      return;
    }
    const update = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(startIso)) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startIso]);

  return elapsedSeconds;
}

/**
 * 会话净经过秒数：扣除暂停累计；暂停态下数值冻结。
 * 输入为会话 record（含 paused_total_seconds / paused_at / session_state）。
 */
export function useSessionElapsedSeconds(
  activity: Pick<
    TetoRecord,
    'occurred_at' | 'occurred_at_end' | 'paused_total_seconds' | 'paused_at' | 'session_state'
  > | null | undefined
): number {
  const startIso = activity?.occurred_at;
  const pausedAt = activity?.paused_at ?? null;
  const pausedTotal = activity?.paused_total_seconds ?? 0;
  const state = activity?.session_state;
  const occurredAtEnd = activity?.occurred_at_end ?? null;

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startIso) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startIso, pausedAt, pausedTotal, state, occurredAtEnd]);

  if (!startIso) return 0;

  return calcNetElapsedSeconds(
    {
      occurred_at: startIso,
      occurred_at_end: occurredAtEnd,
      paused_total_seconds: pausedTotal,
      paused_at: pausedAt,
      session_state: state,
    },
    new Date(nowMs).toISOString()
  );
}
