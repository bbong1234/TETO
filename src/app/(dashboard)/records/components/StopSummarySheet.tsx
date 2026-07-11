'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { ActivityEvent, Item, Record as TetoRecord } from '@/types/teto';
import { buildTimelineTagPath } from '@/lib/activity/item-tree';
import { formatStatDuration } from '@/lib/activity/stats-utils';
import { useSessionElapsedSeconds } from '@/hooks/use-elapsed-seconds';

export interface BlockStopSummary {
  recordCount: number;
}

interface StopSummarySheetProps {
  open: boolean;
  activity: TetoRecord;
  items: Item[];
  submitting?: boolean;
  /** 块时间停止：仅展示总时长与记录条数 */
  blockSummary?: BlockStopSummary | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatTimeRange(activity: TetoRecord): string {
  const start = activity.occurred_at
    ? new Date(activity.occurred_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const end = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const elapsedSeconds = activity.occurred_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(activity.occurred_at)) / 1000))
    : 0;
  const durationLabel = formatStatDuration(elapsedSeconds);
  return `${start}–${end}（${durationLabel}）`;
}

const USER_EVENT_TYPES = new Set(['ai_user', 'progress', 'idea', 'plan', 'milestone']);

function BlockStopSummaryBody({
  activity,
  recordCount,
}: {
  activity: TetoRecord;
  recordCount: number;
}) {
  const totalSeconds = useSessionElapsedSeconds(activity);

  return (
    <div className="space-y-3 py-2 text-center">
      <p className="text-sm text-slate-600">确认结束本次块时间吗？</p>
      <div className="rounded-xl bg-slate-50 px-4 py-5">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
          {formatStatDuration(totalSeconds)}
        </p>
        <p className="mt-1 text-xs text-slate-500">本次块时间共计</p>
      </div>
      <p className="text-sm text-slate-600">
        共 <span className="font-semibold text-slate-900">{recordCount}</span> 条记录
      </p>
    </div>
  );
}

export default function StopSummarySheet({
  open,
  activity,
  items,
  submitting = false,
  blockSummary = null,
  onConfirm,
  onCancel,
}: StopSummarySheetProps) {
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);
  const isBlockStop = Boolean(blockSummary);

  useEffect(() => {
    if (!open) return;
    setShowEvents(false);
    setSelectedEventIds(new Set());
    setEvents([]);
  }, [open, activity.id]);

  const tagPath = useMemo(
    () => buildTimelineTagPath(activity, items),
    [activity, items]
  );

  const loadEvents = async () => {
    if (events.length > 0) {
      setShowEvents((v) => !v);
      return;
    }
    setEventsLoading(true);
    setShowEvents(true);
    try {
      const res = await fetch(`/api/v2/activity-events?session_id=${activity.id}`);
      const data = await res.json();
      const list: ActivityEvent[] = Array.isArray(data.data) ? data.data : [];
      setEvents(list.filter((e) => USER_EVENT_TYPES.has(e.event_type) && e.content?.trim()));
    } finally {
      setEventsLoading(false);
    }
  };

  const toggleEventId = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const splitSelectedEvents = async () => {
    if (selectedEventIds.size === 0) return;
    setSplitting(true);
    try {
      const today = activity.date ?? new Date().toISOString().split('T')[0];
      for (const event of events.filter((e) => selectedEventIds.has(e.id))) {
        await fetch('/api/v2/records?enhance=client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: event.content,
            type: event.event_type === 'plan' ? '计划' : event.event_type === 'idea' ? '想法' : '发生',
            date: today,
            item_id: activity.item_id ?? undefined,
            sub_item_id: activity.sub_item_id ?? null,
            phase_id: activity.phase_id ?? null,
            input_source: 'manual',
            review_status: 'unchecked',
            occurred_at: event.occurred_at,
          }),
        });
      }
      setSelectedEventIds(new Set());
    } finally {
      setSplitting(false);
    }
  };

  if (!open) return null;

  const summaryRows: { label: string; value: string }[] = [];
  if (activity.location?.trim()) summaryRows.push({ label: '地点', value: activity.location.trim() });
  if (activity.cost != null && activity.cost > 0) summaryRows.push({ label: '金额', value: `¥${activity.cost}` });
  if (activity.mood) summaryRows.push({ label: '心情', value: activity.mood });
  if (activity.body_state) summaryRows.push({ label: '身体', value: activity.body_state });

  const eventTypeLabel = (t: ActivityEvent['event_type']) => {
    if (t === 'ai_user' || t === 'progress') return '进展';
    if (t === 'idea') return '想法';
    if (t === 'plan') return '计划';
    if (t === 'milestone') return '里程碑';
    return t;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={onCancel} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">结束活动</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {isBlockStop && blockSummary ? (
            <BlockStopSummaryBody activity={activity} recordCount={blockSummary.recordCount} />
          ) : (
            <>
              <div>
                <p className="text-base font-medium text-slate-900">{activity.content}</p>
                <p className="mt-1 text-xs text-slate-500">{formatTimeRange(activity)}</p>
                {tagPath && (
                  <p className="mt-1.5 text-xs text-blue-600">{tagPath}</p>
                )}
              </div>

              {summaryRows.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  {summaryRows.map((row) => (
                    <span key={row.label}>
                      {row.label}：{row.value}
                    </span>
                  ))}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={loadEvents}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <span className="font-medium">查看会话事件（可选拆分为记录）</span>
                  {eventsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : showEvents ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {showEvents && !eventsLoading && (
                  <div className="space-y-1.5 border-t border-slate-100 px-3 py-2">
                    {events.length === 0 ? (
                      <p className="py-2 text-xs text-slate-400">无可拆分事件</p>
                    ) : (
                      <>
                        <p className="mb-2 text-[10px] text-slate-400">勾选想单独保存的事件：</p>
                        {events.map((event) => (
                          <label
                            key={event.id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition-colors hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedEventIds.has(event.id)}
                              onChange={() => toggleEventId(event.id)}
                              className="mt-0.5 rounded border-slate-300"
                            />
                            <div className="min-w-0">
                              <span className="mr-1 inline-block rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">
                                {eventTypeLabel(event.event_type)}
                              </span>
                              <span className="text-xs text-slate-700">{event.content}</span>
                            </div>
                          </label>
                        ))}
                        {selectedEventIds.size > 0 && (
                          <button
                            type="button"
                            onClick={splitSelectedEvents}
                            disabled={splitting}
                            className="mt-2 flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
                          >
                            {splitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                            拆分 {selectedEventIds.size} 条为独立记录
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            确认结束
          </button>
        </div>
      </div>
    </div>
  );
}
