'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import type { DayTimeline, TimelineEntry } from '@/types/teto';
import { GAP_THRESHOLD_HINT } from '@/lib/activity/constants';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';

function useElapsedMinutes(startIso: string | null | undefined): number {
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

interface DayTimelinePanelProps {
  data: DayTimeline;
  title?: string;
  emptyText?: string;
  showGapHint?: boolean;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
  onPlanComplete?: (entry: TimelineEntry) => void;
}

export default function DayTimelinePanel({
  data,
  title = '今日时间线',
  emptyText = '今天还没有时间记录。',
  showGapHint = false,
  onEntryClick,
  onGapClick,
  onPlanComplete,
}: DayTimelinePanelProps) {
  const pinned = data.records.filter((r) => r.is_pinned);
  const timed = data.records.filter(
    (r) => !r.is_pinned && (r.start_time || r.is_gap)
  );
  const reversed = [...timed].reverse();
  const currentFirst = reversed.filter((r) => r.is_current);
  const restTimed = reversed.filter((r) => !r.is_current);
  const timedEntries = [...currentFirst, ...restTimed];
  const untimed = data.records.filter(
    (r) => !r.is_pinned && !r.start_time && !r.is_gap
  );
  const untimedIdeas = untimed.filter((r) => r.kind === 'idea' || r.kind === 'summary');
  const untimedPlans = untimed.filter((r) => r.kind === 'plan');
  const untimedOther = untimed.filter(
    (r) => r.kind !== 'idea' && r.kind !== 'summary' && r.kind !== 'plan'
  );

  if (
    pinned.length === 0 &&
    timedEntries.length === 0 &&
    untimed.length === 0
  ) {
    return (
      <div className="space-y-3">
        <Header title={title} />
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
          <p className="text-sm text-slate-400">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header title={title} count={data.record_count} />
      {showGapHint && (
        <p className="text-[10px] text-slate-400 leading-snug px-0.5">{GAP_THRESHOLD_HINT}</p>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        {pinned.length > 0 && (
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-blue-500">
              今日待办
            </p>
            {pinned.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                onGapClick={onGapClick}
                onPlanComplete={onPlanComplete}
              />
            ))}
          </div>
        )}

        {timedEntries.length > 0 && (
          <div className="space-y-1">
            {pinned.length > 0 && (
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                时间序
              </p>
            )}
            {timedEntries.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                onGapClick={onGapClick}
                onPlanComplete={onPlanComplete}
              />
            ))}
          </div>
        )}

        {untimedIdeas.length > 0 && (
          <div className="space-y-1 border-t border-slate-100 pt-2">
            <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-amber-600">
              想法与回顾
            </p>
            {untimedIdeas.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                onGapClick={onGapClick}
                onPlanComplete={onPlanComplete}
              />
            ))}
          </div>
        )}

        {untimedPlans.length > 0 && (
          <div className="space-y-1 border-t border-slate-100 pt-2">
            <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-blue-500">
              未定时计划
            </p>
            {untimedPlans.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                onGapClick={onGapClick}
                onPlanComplete={onPlanComplete}
              />
            ))}
          </div>
        )}

        {untimedOther.length > 0 && (
          <div className="space-y-1">
            {untimedOther.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                onGapClick={onGapClick}
                onPlanComplete={onPlanComplete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KindBadge({ entry }: { entry: TimelineEntry }) {
  if (entry.is_gap) return null;
  const kind = entry.kind ?? (entry.is_current ? 'activity' : undefined);
  if (!kind || kind === 'activity') return null;

  const labels: Record<string, string> = {
    plan: '计划',
    idea: '想法',
    summary: '回顾',
  };
  const colors: Record<string, string> = {
    plan: 'bg-blue-100 text-blue-700',
    idea: 'bg-amber-100 text-amber-800',
    summary: 'bg-slate-100 text-slate-600',
  };
  const label = labels[kind];
  if (!label) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[kind]}`}>
      {label}
    </span>
  );
}

function TimelineRow({
  entry,
  onEntryClick,
  onGapClick,
  onPlanComplete,
}: {
  entry: TimelineEntry;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
  onPlanComplete?: (entry: TimelineEntry) => void;
}) {
  const handler = entry.is_gap ? onGapClick : onEntryClick;
  const liveMinutes = useElapsedMinutes(entry.is_current ? entry.occurred_at : undefined);
  const displayMinutes =
    entry.kind === 'activity' || entry.is_gap || entry.is_current
      ? entry.is_current
        ? liveMinutes
        : entry.duration_minutes
      : undefined;

  const timeLabel = entry.is_current
    ? `${entry.start_time} - 进行中`
    : entry.end_time
      ? `${entry.start_time} - ${entry.end_time}`
      : entry.start_time ?? entry.time_label ?? (entry.is_pinned ? '今日' : '');

  const rowClass = `flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
    entry.is_gap
      ? 'border border-dashed border-amber-200 bg-amber-50/50 hover:bg-amber-50'
      : entry.is_pinned
        ? 'border border-dashed border-blue-200 bg-blue-50/40'
        : entry.is_current
          ? 'border border-blue-200 bg-blue-50/60 ring-1 ring-blue-100'
          : entry.kind === 'plan'
            ? 'border border-dashed border-blue-100 bg-blue-50/20 hover:bg-blue-50/40'
            : handler
              ? 'hover:bg-slate-50'
              : ''
  }`;

  const inner = (
    <>
      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-400">
        {timeLabel || '—'}
      </span>
      <span
        className={`flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${
          entry.is_gap
            ? 'text-amber-700'
            : entry.is_current
              ? 'font-medium text-blue-800'
              : entry.kind === 'plan'
                ? 'text-blue-800'
                : entry.kind === 'idea' || entry.kind === 'summary'
                  ? 'text-slate-600'
                  : 'text-slate-700'
        }`}
      >
        {entry.is_current && (
          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white">
            进行中
          </span>
        )}
        <KindBadge entry={entry} />
        <span>{entry.text}</span>
        {displayMinutes != null && displayMinutes > 0 && (
          <span className="text-xs text-slate-400">
            {entry.is_current ? '已进行 ' : ''}
            {formatDurationMinutes(displayMinutes)}
          </span>
        )}
      </span>
      {entry.is_pinned && onPlanComplete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlanComplete(entry);
          }}
          className="shrink-0 rounded-lg p-1 text-green-500 hover:bg-green-50"
          aria-label="完成计划"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
    </>
  );

  if (handler) {
    const hasNestedButton = entry.is_pinned && Boolean(onPlanComplete);
    if (hasNestedButton) {
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handler(entry)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handler(entry);
            }
          }}
          className={`${rowClass} cursor-pointer`}
        >
          {inner}
        </div>
      );
    }
    return (
      <button type="button" onClick={() => handler(entry)} className={rowClass}>
        {inner}
      </button>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}

function Header({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-blue-500" />
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {count != null && count > 0 && <span className="text-[10px] text-slate-400">{count} 条</span>}
    </div>
  );
}
