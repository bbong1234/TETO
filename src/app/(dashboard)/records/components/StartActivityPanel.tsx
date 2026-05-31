'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Item } from '@/types/teto';
import ActivityContextPicker, {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import { resolveContextLabel, resolveTargetItemId, validateActivityContext } from '@/lib/activity/item-tree';
import ToolLabelField, { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import BoundedTimeSelect, {
  buildGapEndOptions,
  buildGapStartOptions,
} from './BoundedTimeSelect';

export interface StartActivitySubmitPayload {
  content?: string;
  item_id?: string | null;
  sub_item_id?: string | null;
  phase_id?: string | null;
  tool_label?: string | null;
  occurred_at?: string;
  occurred_at_end?: string;
}

interface StartActivityPanelProps {
  open: boolean;
  mode: 'start' | 'switch' | 'backfill';
  items: Item[];
  initialContent?: string;
  initialStart?: string;
  initialEnd?: string;
  /** 补记归属日期 YYYY-MM-DD，默认今天 */
  backfillDate?: string;
  /** 来自空白时间段的边界（中间补记时首尾仍保留为空白） */
  gapStartIso?: string;
  gapEndIso?: string;
  onClose: () => void;
  onSubmit: (payload: StartActivitySubmitPayload) => Promise<void>;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
}

function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoToTimeHHMM(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateAndTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function formatBackfillDateLabel(date: string): string {
  if (date === todayDateStr()) return '今天';
  return date.replace(/-/g, '/');
}

function clampTimeHHMM(time: string, min?: string, max?: string): string {
  if (!time) return time;
  let t = time;
  if (min && t < min) t = min;
  if (max && t > max) t = max;
  return t;
}

export default function StartActivityPanel({
  open,
  mode,
  items,
  initialContent,
  initialStart,
  initialEnd,
  backfillDate,
  gapStartIso,
  gapEndIso,
  onClose,
  onSubmit,
  onItemsChange,
  onItemCreated,
  onCreateError,
}: StartActivityPanelProps) {
  const [context, setContext] = useState<ActivityContextValue>(EMPTY_ACTIVITY_CONTEXT);
  const [subItemsCount, setSubItemsCount] = useState(0);
  const [toolLabel, setToolLabel] = useState('');
  const [content, setContent] = useState(initialContent ?? '');
  const [recordDate, setRecordDate] = useState(backfillDate ?? todayDateStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubItemsCount(0);
    setContext(EMPTY_ACTIVITY_CONTEXT);
    setToolLabel('');
    setContent(initialContent ?? '');
    setError('');
    if (mode === 'backfill') {
      const date =
        backfillDate ??
        (initialStart ? new Date(initialStart).toISOString().slice(0, 10) : todayDateStr());
      setRecordDate(date);
      setStartTime(isoToTimeHHMM(initialStart ?? gapStartIso));
      setEndTime(isoToTimeHHMM(initialEnd ?? gapEndIso));
    }
  }, [open, mode, initialContent, initialStart, initialEnd, backfillDate, gapStartIso, gapEndIso]);

  const gapMinTime = gapStartIso ? isoToTimeHHMM(gapStartIso) : undefined;
  const gapMaxTime = gapEndIso ? isoToTimeHHMM(gapEndIso) : undefined;
  const hasGapBounds = !!(gapMinTime && gapMaxTime);

  const startTimeOptions = useMemo(
    () =>
      hasGapBounds ? buildGapStartOptions(gapMinTime!, gapMaxTime!, endTime || undefined) : [],
    [hasGapBounds, gapMinTime, gapMaxTime, endTime]
  );

  const endTimeOptions = useMemo(
    () =>
      hasGapBounds ? buildGapEndOptions(gapMinTime!, gapMaxTime!, startTime || undefined) : [],
    [hasGapBounds, gapMinTime, gapMaxTime, startTime]
  );

  if (!open) return null;

  const title =
    mode === 'backfill' ? '补记时间' : mode === 'switch' ? '切换到' : '开始一件事';

  const handleSubmit = async () => {
    setError('');
    const contextErr = validateActivityContext(context, items, subItemsCount);
    if (contextErr) {
      setError(contextErr);
      return;
    }
    const resolved = resolveContextLabel(context, items, content);
    if (!resolved && !resolveTargetItemId(context) && mode !== 'switch') {
      setError('请选择归属路径，或填写具体内容');
      return;
    }
    if (mode === 'backfill') {
      if (!startTime || !endTime) {
        setError('请填写开始和结束时间');
        return;
      }
      const occurredAt = dateAndTimeToIso(recordDate, startTime);
      const occurredAtEnd = dateAndTimeToIso(recordDate, endTime);
      if (Date.parse(occurredAtEnd) <= Date.parse(occurredAt)) {
        setError('结束时间必须晚于开始时间');
        return;
      }
      if (gapStartIso && Date.parse(occurredAt) < Date.parse(gapStartIso)) {
        setError('开始时间不能早于空白时段起点');
        return;
      }
      if (gapEndIso && Date.parse(occurredAtEnd) > Date.parse(gapEndIso)) {
        setError('结束时间不能晚于空白时段终点');
        return;
      }

      setSubmitting(true);
      try {
        await onSubmit({
          content: resolved || undefined,
          item_id: resolveTargetItemId(context),
          sub_item_id: context.subItemId || null,
          phase_id: context.phaseId || null,
          tool_label: toolLabel.trim() || null,
          occurred_at: occurredAt,
          occurred_at_end: occurredAtEnd,
        });
        if (toolLabel.trim()) void persistToolOptionIfNeeded(toolLabel);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失败');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        content: resolved || undefined,
        item_id: resolveTargetItemId(context),
        sub_item_id: context.subItemId || null,
        phase_id: context.phaseId || null,
        tool_label: toolLabel.trim() || null,
      });
      if (toolLabel.trim()) void persistToolOptionIfNeeded(toolLabel);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchToNone = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({});
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const gapHint =
    gapStartIso && gapEndIso
      ? `空白时段 ${isoToTimeHHMM(gapStartIso)} – ${isoToTimeHHMM(gapEndIso)}，补记中间一段后首尾仍计为空白`
      : null;

  const startTimeMin = gapMinTime;
  const startTimeMax = endTime
    ? gapMaxTime
      ? endTime < gapMaxTime
        ? endTime
        : gapMaxTime
      : endTime
    : gapMaxTime;
  const endTimeMin =
    startTime && gapMinTime
      ? startTime > gapMinTime
        ? startTime
        : gapMinTime
      : startTime || gapMinTime;
  const endTimeMax = gapMaxTime;

  const handleStartTimeChange = (raw: string) => {
    const next = clampTimeHHMM(raw, startTimeMin, startTimeMax);
    setStartTime(next);
    if (endTime && next >= endTime) {
      const adjustedEnd = clampTimeHHMM(endTimeMax ?? next, next, endTimeMax);
      if (adjustedEnd > next) {
        setEndTime(adjustedEnd);
      } else {
        setEndTime('');
      }
    }
    setError('');
  };

  const handleEndTimeChange = (raw: string) => {
    const min = endTimeMin;
    const next = clampTimeHHMM(raw, min, endTimeMax);
    if (startTime && next <= startTime) {
      setError('结束时间必须晚于开始时间');
      return;
    }
    setError('');
    setEndTime(next);
  };

  const handleGapStartSelect = (next: string) => {
    setStartTime(next);
    const ends = buildGapEndOptions(gapMinTime!, gapMaxTime!, next);
    if (ends.length === 0) {
      setEndTime('');
      return;
    }
    if (!endTime || endTime <= next || !ends.includes(endTime)) {
      setEndTime(ends[0]);
    }
    setError('');
  };

  const handleGapEndSelect = (next: string) => {
    setEndTime(next);
    const starts = buildGapStartOptions(gapMinTime!, gapMaxTime!, next);
    if (starts.length > 0 && (!startTime || startTime >= next || !starts.includes(startTime))) {
      setStartTime(starts[starts.length - 1]!);
    }
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4 sm:pb-4">
      <div className="flex max-h-[min(92dvh,calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px)-1.5rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[min(90dvh,640px)]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-4 px-4 py-4">
            <ActivityContextPicker
              items={items}
              value={context}
              onChange={setContext}
              onItemsChange={onItemsChange}
              onItemCreated={onItemCreated}
              onCreateError={onCreateError}
              onSubItemsLoaded={(subs) => setSubItemsCount(subs.length)}
            />

            <ToolLabelField value={toolLabel} onChange={setToolLabel} />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">记录内容（可选）</label>
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="例如：背了 30 个单词、写了方案"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>

            {mode === 'backfill' && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400">
                  日期：{formatBackfillDateLabel(recordDate)}
                </p>
                {gapHint && (
                  <p className="text-[10px] text-amber-600 leading-snug">{gapHint}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">开始</label>
                    {hasGapBounds ? (
                      <BoundedTimeSelect
                        value={startTime}
                        options={startTimeOptions}
                        onChange={handleGapStartSelect}
                      />
                    ) : (
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        min={startTimeMin}
                        max={startTimeMax}
                        className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">结束</label>
                    {hasGapBounds ? (
                      <BoundedTimeSelect
                        value={endTime}
                        options={endTimeOptions}
                        onChange={handleGapEndSelect}
                      />
                    ) : (
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        min={endTimeMin}
                        max={endTimeMax}
                        className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          {mode === 'switch' && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSwitchToNone}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              切换到无
            </button>
          )}
          <button
            type="button"
            disabled={
              submitting ||
              (mode === 'backfill' &&
                hasGapBounds &&
                (startTimeOptions.length === 0 || endTimeOptions.length === 0))
            }
            onClick={handleSubmit}
            className="ml-auto flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'backfill' ? '保存补记' : mode === 'switch' ? '确认切换' : '开始'}
          </button>
        </div>
      </div>
    </div>
  );
}
