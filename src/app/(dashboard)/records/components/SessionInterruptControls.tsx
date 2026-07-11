'use client';

import { useRef, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import type { Record as TetoRecord, SessionState } from '@/types/teto';
import { isSessionPaused } from '@/lib/activity/session-utils';

type SessionAction = 'pause' | 'resume';

import type { SessionActionPayload } from '@/lib/activity/records-mutation';

interface SessionResponse {
  record: TetoRecord | null;
}

interface SessionInterruptControlsProps {
  activity: TetoRecord;
  disabled?: boolean;
  size?: 'sm' | 'md';
  onSessionAction?: (data: SessionActionPayload) => void;
  onCurrentChange: (record: TetoRecord | null) => void;
  onError?: (message: string) => void;
}

export default function SessionInterruptControls({
  activity,
  disabled = false,
  size = 'md',
  onSessionAction,
  onCurrentChange,
  onError,
}: SessionInterruptControlsProps) {
  const [loading, setLoading] = useState<SessionAction | null>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  const paused = isSessionPaused(activity.session_state);

  const callSession = async (action: SessionAction): Promise<SessionResponse | null> => {
    try {
      const res = await fetch('/api/v2/activities/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? '操作失败');
      }
      return data.data as SessionResponse;
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '操作失败');
      return null;
    }
  };

  const handlePause = async () => {
    const before = activityRef.current;
    const nowIso = new Date().toISOString();
    const optimistic: TetoRecord = {
      ...before,
      session_state: 'paused' as SessionState,
      paused_at: nowIso,
    };
    onCurrentChange(optimistic);
    onSessionAction?.({ record: optimistic, action: 'pause' });

    setLoading('pause');
    const result = await callSession('pause');
    setLoading(null);

    if (result?.record) {
      onCurrentChange(result.record);
      onSessionAction?.({ record: result.record, action: 'pause', syncOnly: true });
      return;
    }

    onCurrentChange(before);
    onSessionAction?.({ record: before, action: 'pause', syncOnly: true });
  };

  const handleResume = async () => {
    const before = activityRef.current;
    const optimistic: TetoRecord = {
      ...before,
      session_state: 'running' as SessionState,
      paused_at: null,
    };
    onCurrentChange(optimistic);
    onSessionAction?.({ record: optimistic, action: 'resume' });

    setLoading('resume');
    const result = await callSession('resume');
    setLoading(null);

    if (result?.record) {
      onCurrentChange(result.record);
      onSessionAction?.({ record: result.record, action: 'resume', syncOnly: true });
      return;
    }

    onCurrentChange(before);
    onSessionAction?.({ record: before, action: 'resume', syncOnly: true });
  };

  const btnBase =
    size === 'sm'
      ? 'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50'
      : 'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-50 sm:px-4 sm:py-2';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-2">
      {paused ? (
        <button
          type="button"
          disabled={disabled || loading !== null}
          onClick={handleResume}
          className={`${btnBase} bg-green-500 text-white hover:bg-green-600`}
        >
          {loading === 'resume' ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <Play className={iconSize} />
          )}
          继续
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || loading !== null}
          onClick={handlePause}
          className={`${btnBase} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          {loading === 'pause' ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <Pause className={iconSize} />
          )}
          暂停
        </button>
      )}
    </div>
  );
}
