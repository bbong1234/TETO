import type { Record as TetoRecord, SessionState } from '@/types/teto';

/** 计算会话净时长（秒），服务端权威 */
export function calcNetElapsedSeconds(
  record: Pick<TetoRecord, 'occurred_at' | 'occurred_at_end' | 'paused_total_seconds' | 'paused_at' | 'session_state'>,
  nowIso = new Date().toISOString()
): number {
  if (!record.occurred_at) return 0;

  const endMs = record.occurred_at_end
    ? Date.parse(record.occurred_at_end)
    : Date.now();
  const startMs = Date.parse(record.occurred_at);
  let grossSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

  let pausedTotal = record.paused_total_seconds ?? 0;

  // 当前正在暂停中，累加本次暂停段
  if (record.paused_at && !record.occurred_at_end) {
    const pauseStartMs = Date.parse(record.paused_at);
    const pauseEndMs = record.session_state === 'paused' || record.session_state === 'nested_paused'
      ? Date.parse(nowIso)
      : pauseStartMs;
    pausedTotal += Math.max(0, Math.floor((pauseEndMs - pauseStartMs) / 1000));
  }

  return Math.max(0, grossSeconds - pausedTotal);
}

/** 净时长转分钟（四舍五入） */
export function calcNetDurationMinutes(
  record: Pick<TetoRecord, 'occurred_at' | 'occurred_at_end' | 'paused_total_seconds' | 'paused_at' | 'session_state'>,
  nowIso?: string
): number {
  return Math.round(calcNetElapsedSeconds(record, nowIso) / 60);
}

export function isSessionPaused(state?: SessionState | null): boolean {
  return state === 'paused' || state === 'nested_paused';
}

export function canResumeSession(state?: SessionState | null): boolean {
  return state === 'paused';
}

export function canEnterNested(state?: SessionState | null): boolean {
  return state === 'running';
}

/** 块时间刚进入、尚未开始计时（L1 进入时的暂停态） */
export function isBlockAwaitingStart(
  record: Pick<
    TetoRecord,
    'session_state' | 'occurred_at' | 'occurred_at_end' | 'paused_total_seconds' | 'paused_at'
  >
): boolean {
  if (!isSessionPaused(record.session_state)) return false;
  return calcNetElapsedSeconds(record) === 0;
}

/** 从事件流生成滚动摘要 content */
export function buildSessionSummaryFromEvents(
  events: Array<{ event_type: string; content: string; occurred_at: string }>
): string {
  const parts: string[] = [];
  for (const ev of events) {
    const text = ev.content?.trim();
    if (!text) continue;
    if (ev.event_type === 'progress' || ev.event_type === 'milestone') {
      parts.push(text);
    } else if (ev.event_type === 'structured' && text) {
      parts.push(text);
    }
  }
  if (parts.length === 0) return '';
  // 取最近 3 条进度/里程碑
  return parts.slice(-3).join(' → ');
}
