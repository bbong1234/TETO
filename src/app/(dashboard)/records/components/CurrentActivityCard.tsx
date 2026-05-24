'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, ArrowRightLeft, StickyNote, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Item, Record } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import StartActivityPanel, { type StartActivitySubmitPayload } from './StartActivityPanel';

interface CurrentActivityCardProps {
  items: Item[];
  onChanged: () => void;
  onActivityChange?: (activity: Record | null) => void;
}

function useElapsed(startIso: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startIso) {
      setElapsed(0);
      return;
    }
    const update = () => {
      setElapsed(Math.max(0, Math.round((Date.now() - Date.parse(startIso)) / 60000)));
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [startIso]);

  return elapsed;
}

export default function CurrentActivityCard({
  items,
  onChanged,
  onActivityChange,
}: CurrentActivityCardProps) {
  const [activity, setActivity] = useState<Record | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [panelMode, setPanelMode] = useState<'start' | 'switch' | 'backfill' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const elapsed = useElapsed(activity?.occurred_at);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/activities/current');
      const data = await res.json();
      const act = data.data ?? null;
      setActivity(act);
      onActivityChange?.(act);
    } catch {
      setActivity(null);
      onActivityChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [onActivityChange]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  useEffect(() => {
    if (noteOpen) setTimeout(() => noteRef.current?.focus(), 50);
  }, [noteOpen]);

  const handleStop = async () => {
    if (!activity) return;
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      const duration = activity.occurred_at
        ? Math.max(0, Math.round((Date.parse(now) - Date.parse(activity.occurred_at)) / 60000))
        : null;
      await fetch(`/api/v2/records/${activity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurred_at_end: now,
          duration_minutes: duration,
          lifecycle_status: 'completed',
        }),
      });
      setActivity(null);
      onActivityChange?.(null);
      onChanged();
    } finally {
      setActionLoading(false);
    }
  };

  const handlePanelSubmit = async (payload: StartActivitySubmitPayload) => {
    if (panelMode === 'backfill') {
      const today = new Date().toISOString().slice(0, 10);
      const startDate = payload.occurred_at
        ? new Date(payload.occurred_at).toISOString().slice(0, 10)
        : today;
      const duration =
        payload.occurred_at && payload.occurred_at_end
          ? Math.max(
              0,
              Math.round(
                (Date.parse(payload.occurred_at_end) - Date.parse(payload.occurred_at)) / 60000
              )
            )
          : undefined;
      const res = await fetch('/api/v2/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: startDate,
          content:
            payload.content ||
            payload.subcategory ||
            payload.category ||
            '补记',
          type: '发生',
          lifecycle_status: 'completed',
          occurred_at: payload.occurred_at,
          occurred_at_end: payload.occurred_at_end,
          duration_minutes: duration,
          category: payload.category,
          subcategory: payload.subcategory,
          item_id: payload.item_id,
          input_source: 'manual',
          review_status: 'confirmed',
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message ?? '补记失败');
      }
    } else {
      const res = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: payload.content,
          category: payload.category,
          subcategory: payload.subcategory,
          item_id: payload.item_id,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message ?? '操作失败');
      }
      const d = await res.json();
      setActivity(d.data?.record ?? null);
    }
    onChanged();
    await fetchCurrent();
  };

  const handleSaveNote = async () => {
    if (!activity || !noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      await fetch(`/api/v2/records/${activity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText.trim() }),
      });
      setActivity((prev) => (prev ? { ...prev, note: noteText.trim() } : prev));
      setNoteOpen(false);
      setNoteText('');
    } finally {
      setNoteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {activity ? (
          <ActiveState
            activity={activity}
            elapsed={elapsed}
            actionLoading={actionLoading}
            noteOpen={noteOpen}
            noteText={noteText}
            noteRef={noteRef}
            noteSubmitting={noteSubmitting}
            onStop={handleStop}
            onSwitch={() => setPanelMode('switch')}
            onToggleNote={() => {
              setNoteText(activity.note ?? '');
              setNoteOpen((v) => !v);
            }}
            onNoteChange={setNoteText}
            onSaveNote={handleSaveNote}
          />
        ) : (
          <IdleState
            onStart={() => setPanelMode('start')}
            onBackfill={() => setPanelMode('backfill')}
          />
        )}
      </div>

      <StartActivityPanel
        open={panelMode !== null}
        mode={panelMode ?? 'start'}
        items={items}
        onClose={() => setPanelMode(null)}
        onSubmit={handlePanelSubmit}
      />
    </>
  );
}

function ActiveState({
  activity,
  elapsed,
  actionLoading,
  noteOpen,
  noteText,
  noteRef,
  noteSubmitting,
  onStop,
  onSwitch,
  onToggleNote,
  onNoteChange,
  onSaveNote,
}: {
  activity: Record;
  elapsed: number;
  actionLoading: boolean;
  noteOpen: boolean;
  noteText: string;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  noteSubmitting: boolean;
  onStop: () => void;
  onSwitch: () => void;
  onToggleNote: () => void;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
}) {
  const categoryLabel = [activity.category, activity.subcategory].filter(Boolean).join(' / ');
  const itemLabel = activity.item?.title;

  return (
    <div className="space-y-0">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full bg-green-400 ring-2 ring-green-100" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
            {categoryLabel && <span className="font-medium text-blue-600">{categoryLabel}</span>}
            {categoryLabel && itemLabel && <span>/</span>}
            {itemLabel && <span>{itemLabel}</span>}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
            {activity.content}
          </p>
          {activity.occurred_at && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              开始{' '}
              {new Date(activity.occurred_at).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-400">
            已进行 {formatDurationMinutes(elapsed)}
          </p>
        </div>
      </div>

      {/* 操作按钮行 */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <button
          type="button"
          disabled={actionLoading}
          onClick={onSwitch}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          切换
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {actionLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
          结束
        </button>
        <button
          type="button"
          onClick={onToggleNote}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
        >
          <StickyNote className="h-3.5 w-3.5" />
          {noteOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* 笔记展开区 */}
      {noteOpen && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {activity.note && !noteText && (
            <p className="text-xs text-slate-400 italic">当前笔记：{activity.note}</p>
          )}
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="记一条关于当前事项的笔记…"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!noteText.trim() || noteSubmitting}
              onClick={onSaveNote}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {noteSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              保存笔记
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IdleState({
  onStart,
  onBackfill,
}: {
  onStart: () => void;
  onBackfill: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
        <span className="text-sm text-slate-400">当前没有进行中的事项</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBackfill}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          补记
        </button>
        <button
          type="button"
          onClick={onStart}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
        >
          <Play className="h-3.5 w-3.5" />
          开始
        </button>
      </div>
    </div>
  );
}
