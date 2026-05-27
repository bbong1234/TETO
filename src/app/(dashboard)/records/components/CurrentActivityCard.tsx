'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, ArrowRightLeft, StickyNote, Loader2, ChevronDown, ChevronUp, Plus, Check } from 'lucide-react';
import type { Item, Record as TetoRecord, RecordType } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import StartActivityPanel, { type StartActivitySubmitPayload } from './StartActivityPanel';
import ActivityContextPicker, {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import { resolveContextLabel, resolveTargetItemId, buildItemPathLabel } from '@/lib/activity/item-tree';

interface CurrentActivityCardProps {
  items: Item[];
  refreshKey?: number;
  onChanged: () => void;
  onItemsChanged?: () => void;
  onActivityChange?: (activity: TetoRecord | null) => void;
  onError?: (message: string) => void;
}

type AttachType = '想法' | '计划';
type IdleMode = '想法' | '计划' | '发生';

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  refreshKey = 0,
  onChanged,
  onItemsChanged,
  onActivityChange,
  onError,
}: CurrentActivityCardProps) {
  const [activity, setActivity] = useState<TetoRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [panelMode, setPanelMode] = useState<'start' | 'switch' | 'backfill' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachText, setAttachText] = useState('');
  const [attachType, setAttachType] = useState<AttachType>('想法');
  const [attachSubmitting, setAttachSubmitting] = useState(false);
  const [idleContent, setIdleContent] = useState('');
  const [idleMode, setIdleMode] = useState<IdleMode>('发生');
  const [idleContext, setIdleContext] = useState<ActivityContextValue>(EMPTY_ACTIVITY_CONTEXT);
  const [idleSubmitting, setIdleSubmitting] = useState(false);
  const [panelInitialContent, setPanelInitialContent] = useState('');
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
  }, [fetchCurrent, refreshKey]);

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
          content: payload.content || '补记',
          type: '发生',
          lifecycle_status: 'completed',
          occurred_at: payload.occurred_at,
          occurred_at_end: payload.occurred_at_end,
          duration_minutes: duration,
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
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
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
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
    setPanelInitialContent('');
    setIdleContent('');
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

  const resolveIdleContent = (text: string): string =>
    resolveContextLabel(idleContext, items, text);

  const handleIdleSubmit = async () => {
    const text = idleContent.trim();
    const resolved = resolveIdleContent(text);
    if (!resolved && !resolveTargetItemId(idleContext)) {
      onError?.('请填写内容，或选择大类/事项');
      return;
    }
    setIdleSubmitting(true);
    try {
      if (idleMode === '发生') {
        const res = await fetch('/api/v2/activities/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: resolved || undefined,
            item_id: resolveTargetItemId(idleContext),
            sub_item_id: idleContext.subItemId || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error?.message ?? '开始失败');
        }
        const d = await res.json();
        setActivity(d.data?.record ?? null);
        setIdleContent('');
        setIdleContext(EMPTY_ACTIVITY_CONTEXT);
        onChanged();
        await fetchCurrent();
      } else {
        if (!text) {
          onError?.('想法/计划请填写具体内容');
          return;
        }
        const payload: {
          content: string;
          type: RecordType;
          date: string;
          item_id: string | null;
          sub_item_id: string | null;
          input_source: string;
          review_status: string;
          lifecycle_status?: string;
        } = {
          content: text,
          type: idleMode as RecordType,
          date: todayDateStr(),
          item_id: resolveTargetItemId(idleContext),
          sub_item_id: idleContext.subItemId || null,
          input_source: 'manual',
          review_status: 'confirmed',
        };
        if (idleMode === '计划') {
          payload.lifecycle_status = 'active';
        }
        const res = await fetch('/api/v2/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error?.message ?? '记录失败');
        }
        setIdleContent('');
        onChanged();
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '操作失败');
    } finally {
      setIdleSubmitting(false);
    }
  };

  const handleAttachRecord = async () => {
    if (!activity || !attachText.trim()) return;
    setAttachSubmitting(true);
    try {
      const payload: {
        content: string;
        type: AttachType;
        date: string;
        item_id: string | null;
        sub_item_id: string | null;
        input_source: string;
        review_status: string;
        lifecycle_status?: string;
      } = {
        content: attachText.trim(),
        type: attachType,
        date: todayDateStr(),
        item_id: activity.item_id ?? null,
        sub_item_id: activity.sub_item_id ?? null,
        input_source: 'manual',
        review_status: 'confirmed',
      };
      if (attachType === '计划') {
        payload.lifecycle_status = 'active';
      }
      const res = await fetch('/api/v2/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message ?? '挂载失败');
      }
      setAttachText('');
      setAttachOpen(false);
      onChanged();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '挂载失败');
    } finally {
      setAttachSubmitting(false);
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
            items={items}
            elapsed={elapsed}
            actionLoading={actionLoading}
            noteOpen={noteOpen}
            noteText={noteText}
            noteRef={noteRef}
            noteSubmitting={noteSubmitting}
            attachOpen={attachOpen}
            attachText={attachText}
            attachType={attachType}
            attachSubmitting={attachSubmitting}
            onStop={handleStop}
            onSwitch={() => setPanelMode('switch')}
            onToggleNote={() => {
              setNoteText(activity.note ?? '');
              setNoteOpen((v) => !v);
            }}
            onNoteChange={setNoteText}
            onSaveNote={handleSaveNote}
            onToggleAttach={() => setAttachOpen((v) => !v)}
            onAttachTextChange={setAttachText}
            onAttachTypeChange={setAttachType}
            onSubmitAttach={handleAttachRecord}
          />
        ) : (
          <IdleUnifiedInput
            items={items}
            onItemsChange={onItemsChanged}
            content={idleContent}
            mode={idleMode}
            context={idleContext}
            submitting={idleSubmitting}
            onContentChange={setIdleContent}
            onModeChange={setIdleMode}
            onContextChange={setIdleContext}
            onSubmit={handleIdleSubmit}
            onBackfill={() => setPanelMode('backfill')}
          />
        )}
      </div>

      <StartActivityPanel
        open={panelMode !== null}
        mode={panelMode ?? 'start'}
        items={items}
        onItemsChange={onItemsChanged}
        initialContent={panelInitialContent || undefined}
        onClose={() => {
          setPanelMode(null);
          setPanelInitialContent('');
        }}
        onSubmit={handlePanelSubmit}
      />
    </>
  );
}

function ActiveState({
  activity,
  items,
  elapsed,
  actionLoading,
  noteOpen,
  noteText,
  noteRef,
  noteSubmitting,
  attachOpen,
  attachText,
  attachType,
  attachSubmitting,
  onStop,
  onSwitch,
  onToggleNote,
  onNoteChange,
  onSaveNote,
  onToggleAttach,
  onAttachTextChange,
  onAttachTypeChange,
  onSubmitAttach,
}: {
  activity: TetoRecord;
  items: Item[];
  elapsed: number;
  actionLoading: boolean;
  noteOpen: boolean;
  noteText: string;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  noteSubmitting: boolean;
  attachOpen: boolean;
  attachText: string;
  attachType: AttachType;
  attachSubmitting: boolean;
  onStop: () => void;
  onSwitch: () => void;
  onToggleNote: () => void;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
  onToggleAttach: () => void;
  onAttachTextChange: (v: string) => void;
  onAttachTypeChange: (v: AttachType) => void;
  onSubmitAttach: () => void;
}) {
  const contextLabel = activity.item_id
    ? buildItemPathLabel(items, activity.item_id)
    : '';

  return (
    <div className="space-y-0">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full bg-green-400 ring-2 ring-green-100" />
        <div className="flex-1 min-w-0">
          {contextLabel && (
            <div className="text-[11px] font-medium text-blue-600">{contextLabel}</div>
          )}
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
          onClick={onToggleAttach}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-violet-600 hover:bg-violet-50"
        >
          <Plus className="h-3.5 w-3.5" />
          挂载
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

      {attachOpen && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={attachText}
              onChange={(e) => onAttachTextChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmitAttach()}
              placeholder="例如：A项目下午要报批…"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              autoFocus
            />
            <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
              {(['想法', '计划'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onAttachTypeChange(t)}
                  className={`px-2 py-2 text-[10px] font-medium ${
                    attachType === t
                      ? t === '计划'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-purple-500 text-white'
                      : 'bg-white text-slate-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!attachText.trim() || attachSubmitting}
              onClick={onSubmitAttach}
              className="shrink-0 rounded-lg bg-violet-500 px-2.5 py-2 text-white hover:bg-violet-600 disabled:opacity-50"
            >
              {attachSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            创建独立{attachType}记录，关联当前
            {contextLabel ? `「${contextLabel}」` : '活动'}
          </p>
        </div>
      )}

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

function IdleUnifiedInput({
  items,
  content,
  mode,
  context,
  submitting,
  onContentChange,
  onModeChange,
  onContextChange,
  onItemsChange,
  onSubmit,
  onBackfill,
}: {
  items: Item[];
  content: string;
  mode: IdleMode;
  context: ActivityContextValue;
  submitting: boolean;
  onContentChange: (v: string) => void;
  onModeChange: (v: IdleMode) => void;
  onContextChange: (v: ActivityContextValue) => void;
  onItemsChange?: () => void;
  onSubmit: () => void;
  onBackfill: () => void;
}) {
  const placeholders: { [K in IdleMode]: string } = {
    发生: '具体做了什么？例如：背了 30 个单词…',
    计划: '记下要做的事…',
    想法: '随手记一条想法…',
  };

  const canSubmit =
    mode === '发生'
      ? Boolean(content.trim() || context.categoryItemId || context.itemId)
      : Boolean(content.trim());

  return (
    <div className="space-y-3 px-4 py-4">
      <ActivityContextPicker
        items={items}
        value={context}
        onChange={onContextChange}
        onItemsChange={onItemsChange}
        compact
      />
      <input
        type="text"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && onSubmit()}
        placeholder={placeholders[mode]}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['发生', '想法', '计划'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onModeChange(t)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                mode === t
                  ? t === '发生'
                    ? 'bg-blue-500 text-white'
                    : t === '计划'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-purple-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={submitting || !canSubmit}
          onClick={onSubmit}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : mode === '发生' ? (
            <Play className="h-3.5 w-3.5" />
          ) : null}
          {mode === '发生' ? '开始' : '记录'}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onBackfill}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            补记
          </button>
        </div>
      </div>
    </div>
  );
}
