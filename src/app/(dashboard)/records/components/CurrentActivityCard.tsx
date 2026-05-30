'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, ArrowRightLeft, StickyNote, Loader2, ChevronDown, ChevronUp, Plus, Check } from 'lucide-react';
import type { Item, Record as TetoRecord, RecordType, CreateRecordPayload } from '@/types/teto';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import { DIARY_ITEM_TITLE } from '@/lib/activity/constants';
import StartActivityPanel, { type StartActivitySubmitPayload } from './StartActivityPanel';
import ActivityContextPicker, {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import { postBackfillRecord } from '@/lib/activity/post-backfill-record';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { resolveContextLabel, resolveTargetItemId, buildItemPathLabel, validateActivityContext } from '@/lib/activity/item-tree';
import ToolLabelField, { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import { CurrentActivityCardSkeleton } from '@/components/ui/PageSkeletons';

interface CurrentActivityCardProps {
  items: Item[];
  refreshKey?: number;
  /** 父级快速切换后递增，用于同步当前活动（0 = 不覆盖初次 fetch） */
  activitySyncToken?: number;
  syncActivity?: TetoRecord | null;
  onChanged: () => void;
  onItemsChanged?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
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
  activitySyncToken = 0,
  syncActivity,
  onChanged,
  onItemsChanged,
  onItemCreated,
  onCreateError,
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
  const [idleSubItemsCount, setIdleSubItemsCount] = useState(0);
  const [idleToolLabel, setIdleToolLabel] = useState('');
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
    if (!activitySyncToken) return;
    setActivity(syncActivity ?? null);
    setLoading(false);
  }, [activitySyncToken, syncActivity]);

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
      await postBackfillRecord(payload, todayDateStr());
    } else {
      const res = await fetch('/api/v2/activities/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: payload.content,
          item_id: payload.item_id,
          sub_item_id: payload.sub_item_id,
          tool_label: payload.tool_label,
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
    const contextErr = validateActivityContext(idleContext, items, idleSubItemsCount);
    if (contextErr) {
      onError?.(contextErr);
      return;
    }
    const resolved = resolveIdleContent(text);
    if (!resolved && !resolveTargetItemId(idleContext)) {
      onError?.('请填写内容，或选择大类与事项');
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
            tool_label: idleToolLabel.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error?.message ?? '开始失败');
        }
        const d = await res.json();
        setActivity(d.data?.record ?? null);
        if (idleToolLabel.trim()) void persistToolOptionIfNeeded(idleToolLabel);
        setIdleContent('');
        setIdleToolLabel('');
        setIdleContext(EMPTY_ACTIVITY_CONTEXT);
        onChanged();
        await fetchCurrent();
      } else {
        if (!text) {
          onError?.('想法/计划请填写具体内容');
          return;
        }
        const payload: CreateRecordPayload = {
          content: text,
          type: idleMode as RecordType,
          date: todayDateStr(),
          item_id: resolveTargetItemId(idleContext) ?? undefined,
          sub_item_id: idleContext.subItemId || null,
          tool_label: idleToolLabel.trim() || null,
          input_source: 'manual',
          review_status: 'confirmed',
        };
        if (idleMode === '计划') {
          payload.lifecycle_status = 'active';
          payload.time_anchor_date = todayDateStr();
        }
        await postManualRecord(payload);
        if (idleToolLabel.trim()) void persistToolOptionIfNeeded(idleToolLabel);
        setIdleContent('');
        setIdleToolLabel('');
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
      const payload: CreateRecordPayload = {
        content: attachText.trim(),
        type: attachType,
        date: todayDateStr(),
        item_id: activity.item_id ?? undefined,
        sub_item_id: activity.sub_item_id ?? null,
        input_source: 'manual',
        review_status: 'confirmed',
      };
      if (attachType === '计划') {
        payload.lifecycle_status = 'active';
        payload.time_anchor_date = todayDateStr();
      }
      await postManualRecord(payload);
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
    return <CurrentActivityCardSkeleton />;
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
            onItemCreated={onItemCreated}
            onCreateError={onCreateError}
            content={idleContent}
            mode={idleMode}
            context={idleContext}
            toolLabel={idleToolLabel}
            submitting={idleSubmitting}
            onContentChange={setIdleContent}
            onModeChange={setIdleMode}
            onContextChange={setIdleContext}
            onToolLabelChange={setIdleToolLabel}
            onSubItemsLoaded={(subs) => setIdleSubItemsCount(subs.length)}
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
        onItemCreated={onItemCreated}
        onCreateError={onCreateError}
        initialContent={panelInitialContent || undefined}
        backfillDate={todayDateStr()}
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
  toolLabel,
  submitting,
  onContentChange,
  onModeChange,
  onContextChange,
  onToolLabelChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  onSubmit,
  onBackfill,
}: {
  items: Item[];
  content: string;
  mode: IdleMode;
  context: ActivityContextValue;
  toolLabel: string;
  submitting: boolean;
  onContentChange: (v: string) => void;
  onModeChange: (v: IdleMode) => void;
  onContextChange: (v: ActivityContextValue) => void;
  onToolLabelChange: (v: string) => void;
  onSubItemsLoaded?: (subItems: import('@/types/teto').SubItem[]) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubmit: () => void;
  onBackfill: () => void;
}) {
  const placeholders: { [K in IdleMode]: string } = {
    发生: '具体做了什么？例如：背了 30 个单词…',
    计划: '记下要做的事…',
    想法: '随手记一条想法…',
  };

  const hasDiaryItem = items.some((i) => i.title === DIARY_ITEM_TITLE);

  const [subItemsCount, setSubItemsCount] = useState(0);

  const canSubmit =
    mode === '发生'
      ? Boolean(resolveTargetItemId(context))
      : Boolean(content.trim()) &&
        !validateActivityContext(context, items, subItemsCount);

  return (
    <div className="space-y-3 px-4 py-4">
      <ActivityContextPicker
        items={items}
        value={context}
        onChange={onContextChange}
        onItemsChange={onItemsChange}
        onItemCreated={onItemCreated}
        onCreateError={onCreateError}
        onSubItemsLoaded={(subs) => {
          setSubItemsCount(subs.length);
          onSubItemsLoaded?.(subs);
        }}
        compact
      />
      <ToolLabelField value={toolLabel} onChange={onToolLabelChange} compact />
      <input
        type="text"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && onSubmit()}
        placeholder={placeholders[mode]}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {mode === '想法' && (
        <p className="text-[10px] text-slate-400 leading-snug">
          {hasDiaryItem
            ? `日复盘可归属「${DIARY_ITEM_TITLE}」事项；项目复盘建议写在对应子项下。`
            : `建议新建「${DIARY_ITEM_TITLE}」事项作为日复盘入口；项目复盘写在对应子项下。`}
        </p>
      )}
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
