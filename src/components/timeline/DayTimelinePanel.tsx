'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Plus, Trash2 } from 'lucide-react';
import type { DayTimeline, TimelineEntry } from '@/types/teto';
import { GAP_THRESHOLD_HINT } from '@/lib/activity/constants';
import { formatTimelineDuration } from '@/lib/activity/stats-utils';
import { isTimelineEntrySelectable } from '@/lib/activity/timeline-utils';
import {
  formatTimelineItemTagPath,
  splitTimelineTagPath,
  TIMELINE_ACTION_TAG_BLOCK,
  TIMELINE_ITEM_TAG_BLOCK,
} from '@/lib/activity/attribution-chip-styles';

function useElapsedSeconds(startIso: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startIso) {
      setElapsed(0);
      return;
    }
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(startIso)) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

interface DayTimelinePanelProps {
  data: DayTimeline;
  title?: string;
  emptyText?: string;
  showGapHint?: boolean;
  /** 标题行在最近滚动祖先内 sticky 置顶 */
  stickyHeader?: boolean;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
  onPlanComplete?: (entry: TimelineEntry) => void;
  /** 多选批量删除（今日时间线） */
  /** 日记模式：时间线底部新建记录 */
  showAddRecord?: boolean;
  onAddRecord?: () => void;
  focusedRecordId?: string | null;
  onFocusRecord?: (recordId: string | null) => void;
  multiSelect?: {
    selectedIds: Set<string>;
    onToggle: (entry: TimelineEntry) => void;
    onSelectAll: (entries: TimelineEntry[]) => void;
    onClear: () => void;
    onBatchDelete: () => void;
    deleting?: boolean;
  };
}

export default function DayTimelinePanel({
  data,
  title = '今日时间线',
  emptyText = '今天还没有时间记录。',
  showGapHint = false,
  stickyHeader = false,
  onEntryClick,
  onGapClick,
  onPlanComplete,
  showAddRecord = false,
  onAddRecord,
  focusedRecordId = null,
  onFocusRecord,
  multiSelect,
}: DayTimelinePanelProps) {
  const pinned = data.records.filter((r) => r.is_pinned);
  const timed = data.records.filter(
    (r) => !r.is_pinned && (r.start_time || r.is_gap)
  );
  const timedEntries = timed;
  const untimed = data.records.filter(
    (r) => !r.is_pinned && !r.start_time && !r.is_gap
  );
  const untimedIdeas = untimed.filter((r) => r.kind === 'idea' || r.kind === 'summary');
  const untimedPlans = untimed.filter((r) => r.kind === 'plan');
  const untimedOther = untimed.filter(
    (r) => r.kind !== 'idea' && r.kind !== 'summary' && r.kind !== 'plan'
  );

  const selectableEntries = useMemo(
    () => data.records.filter(isTimelineEntrySelectable),
    [data.records]
  );

  const rowProps = {
    onEntryClick,
    onGapClick,
    onPlanComplete,
    multiSelect,
    focusedRecordId,
    onFocusRecord,
  };

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
          {showAddRecord && onAddRecord && (
            <AddRecordButton onClick={onAddRecord} className="mt-4" />
          )}
        </div>
      </div>
    );
  }

  if (stickyHeader) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* 固定标题区 */}
        <div className="shrink-0 pb-2">
          <Header title={title} count={data.record_count} />
          {multiSelect && (
            <MultiSelectToolbar
              selectedCount={multiSelect.selectedIds.size}
              selectableCount={selectableEntries.length}
              deleting={multiSelect.deleting}
              onSelectAll={() => multiSelect.onSelectAll(selectableEntries)}
              onClear={multiSelect.onClear}
              onBatchDelete={multiSelect.onBatchDelete}
            />
          )}
          {showGapHint && (
            <p className="mt-1 text-[10px] text-slate-400 leading-snug px-0.5">{GAP_THRESHOLD_HINT}</p>
          )}
        </div>
        {/* 可滚动白卡片：仅此处滑动 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 space-y-3">
            {pinned.length > 0 && (
              <div className="space-y-1">
                <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-blue-500">今日待办</p>
                {pinned.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {timedEntries.length > 0 && (
              <div className="space-y-1.5">
                {pinned.length > 0 && <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">时间序</p>}
                {timedEntries.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {untimedIdeas.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-amber-600">想法与回顾</p>
                {untimedIdeas.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {untimedPlans.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-blue-500">未定时计划</p>
                {untimedPlans.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {untimedOther.length > 0 && (
              <div className="space-y-1">
                {untimedOther.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {showAddRecord && onAddRecord && <AddRecordButton onClick={onAddRecord} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
        <>
        <Header title={title} count={data.record_count} />
        {multiSelect && (
          <MultiSelectToolbar
            selectedCount={multiSelect.selectedIds.size}
            selectableCount={selectableEntries.length}
            deleting={multiSelect.deleting}
            onSelectAll={() => multiSelect.onSelectAll(selectableEntries)}
            onClear={multiSelect.onClear}
            onBatchDelete={multiSelect.onBatchDelete}
          />
        )}
        {showGapHint && (
          <p className="text-[10px] text-slate-400 leading-snug px-0.5">{GAP_THRESHOLD_HINT}</p>
        )}
      </>
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
                {...rowProps}
              />
            ))}
          </div>
        )}

        {timedEntries.length > 0 && (
          <div className="space-y-1.5">
            {pinned.length > 0 && (
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                时间序
              </p>
            )}
            {timedEntries.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                {...rowProps}
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
                {...rowProps}
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
                {...rowProps}
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
                {...rowProps}
              />
            ))}
          </div>
        )}
        {showAddRecord && onAddRecord && <AddRecordButton onClick={onAddRecord} />}
      </div>
    </div>
  );
}

function AddRecordButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 ${className}`}
    >
      <Plus className="h-4 w-4" />
      新建记录
    </button>
  );
}

function UnassignedBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-dashed border-slate-300 bg-slate-50 text-slate-500">
      未归类
    </span>
  );
}

function timelineRowClass(entry: TimelineEntry, hasHandler: boolean): string {
  const base = 'flex w-full items-baseline gap-3 rounded-lg px-2.5 py-2 text-left transition-colors';

  if (entry.is_gap) {
    return `${base}${hasHandler ? ' cursor-pointer hover:bg-slate-50/60' : ''}`;
  }

  if (entry.is_pinned) {
    return `${base} border border-dashed border-blue-200 bg-white hover:bg-slate-50/80`;
  }

  if (entry.is_current) {
    return `${base} border border-blue-300 bg-white ring-1 ring-blue-100/80 hover:bg-blue-50/30`;
  }

  if (entry.is_unassigned && (entry.kind === 'activity' || !entry.kind)) {
    return `${base} border border-dashed border-slate-300 bg-white hover:bg-slate-50/80`;
  }

  if (entry.kind === 'plan') {
    return `${base} border border-dashed border-blue-100 bg-white hover:bg-slate-50/80`;
  }

  if (entry.kind === 'activity' || entry.start_time) {
    return `${base} border border-slate-200 bg-white hover:bg-slate-50/80`;
  }

  return `${base}${hasHandler ? ' hover:bg-slate-50/80' : ''}`;
}

function timelineTimeClass(entry: TimelineEntry): string {
  const base = 'w-[7.5rem] shrink-0 text-right text-xs tabular-nums';
  if (entry.is_gap) {
    return `${base} text-slate-400`;
  }
  if (entry.is_current) {
    return `${base} font-semibold text-blue-700`;
  }
  if (
    entry.kind === 'activity' ||
    entry.is_unassigned ||
    entry.start_time
  ) {
    return `${base} font-semibold text-slate-700`;
  }
  return `${base} text-slate-400`;
}

function timelineContentClass(entry: TimelineEntry): string {
  const base = 'flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm';
  if (entry.is_gap) {
    return `${base} text-slate-500`;
  }
  if (entry.is_current) {
    return `${base} font-medium text-slate-800`;
  }
  if (entry.kind === 'plan') {
    return `${base} text-blue-800`;
  }
  if (entry.kind === 'idea' || entry.kind === 'summary') {
    return `${base} text-slate-600`;
  }
  return `${base} text-slate-700`;
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

function TimelineAttributionChips({ entry }: { entry: TimelineEntry }) {
  const parts =
    entry.tag_path_parts && entry.tag_path_parts.length > 0
      ? entry.tag_path_parts
      : entry.tag_path
        ? splitTimelineTagPath(entry.tag_path)
        : [];

  if (parts.length === 0 && !entry.action_label) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {parts.length > 0 && (
        <span className={TIMELINE_ITEM_TAG_BLOCK}>
          {formatTimelineItemTagPath(parts)}
        </span>
      )}
      {entry.action_label && (
        <span className={TIMELINE_ACTION_TAG_BLOCK}>{entry.action_label}</span>
      )}
    </span>
  );
}

function TimelineEntryContent({ entry }: { entry: TimelineEntry }) {
  if (entry.is_gap) {
    return <span>{entry.text}</span>;
  }

  const hasStructured =
    Boolean(entry.tag_path) ||
    Boolean(entry.tag_path_parts?.length) ||
    Boolean(entry.action_label) ||
    Boolean(entry.detail_text);

  if (!hasStructured) {
    return <span>{entry.text}</span>;
  }

  return (
    <>
      <TimelineAttributionChips entry={entry} />
      {entry.detail_text && (
        <span className="text-slate-600">{entry.detail_text}</span>
      )}
    </>
  );
}

function TimelineRow({
  entry,
  onEntryClick,
  onGapClick,
  onPlanComplete,
  multiSelect,
  focusedRecordId = null,
  onFocusRecord,
}: {
  entry: TimelineEntry;
  onEntryClick?: (entry: TimelineEntry) => void;
  onGapClick?: (entry: TimelineEntry) => void;
  onPlanComplete?: (entry: TimelineEntry) => void;
  multiSelect?: DayTimelinePanelProps['multiSelect'];
  focusedRecordId?: string | null;
  onFocusRecord?: (recordId: string | null) => void;
}) {
  const selectable = Boolean(multiSelect && isTimelineEntrySelectable(entry));
  const isSelected = selectable && multiSelect!.selectedIds.has(entry.id);
  const selectionActive = Boolean(multiSelect && multiSelect.selectedIds.size > 0);
  const isLinkable = isTimelineEntrySelectable(entry);
  const isFocused = isLinkable && focusedRecordId === entry.id;

  const baseHandler = entry.is_gap ? onGapClick : onEntryClick;
  const handler =
    selectable && selectionActive
      ? () => multiSelect!.onToggle(entry)
      : baseHandler
        ? (clicked: TimelineEntry) => {
            if (isLinkable) onFocusRecord?.(clicked.id);
            baseHandler(clicked);
          }
        : isLinkable
          ? (clicked: TimelineEntry) => onFocusRecord?.(clicked.id)
          : undefined;
  const liveSeconds = useElapsedSeconds(entry.is_current ? entry.occurred_at : undefined);
  const displaySeconds =
    entry.kind === 'activity' || entry.is_gap || entry.is_current
      ? entry.is_current
        ? liveSeconds
        : entry.duration_seconds ??
          (entry.duration_minutes != null && entry.duration_minutes > 0
            ? entry.duration_minutes * 60
            : undefined)
      : undefined;

  const timeLabel = entry.is_current
    ? `${entry.start_time} - 进行中`
    : entry.end_time
      ? `${entry.start_time} - ${entry.end_time}`
      : entry.start_time ?? entry.time_label ?? (entry.is_pinned ? '今日' : '');

  const rowClass = `${timelineRowClass(entry, Boolean(handler))}${isSelected ? ' bg-blue-50/80 ring-1 ring-blue-200' : ''}${isFocused ? ' timeline-entry--focused' : ''}`;
  const linkProps = isLinkable
    ? { 'data-timeline-record-id': entry.id }
    : {};

  const inner = (
    <>
      {selectable && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => multiSelect!.onToggle(entry)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
          aria-label="选择记录"
        />
      )}
      <span className={timelineTimeClass(entry)}>
        {timeLabel || '—'}
      </span>
      <span className={timelineContentClass(entry)}>
        {entry.is_current && (
          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white">
            进行中
          </span>
        )}
        <KindBadge entry={entry} />
        {entry.is_unassigned && !entry.is_gap && <UnassignedBadge />}
        <TimelineEntryContent entry={entry} />
        {displaySeconds != null && displaySeconds > 0 && (
          <span className="text-xs text-slate-400">
            {entry.is_current ? '已进行 ' : ''}
            {formatTimelineDuration(displaySeconds)}
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
    const useDivRow = Boolean(multiSelect) || hasNestedButton;
    if (useDivRow) {
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
          {...linkProps}
        >
          {inner}
        </div>
      );
    }
    return (
      <button type="button" onClick={() => handler(entry)} className={rowClass} {...linkProps}>
        {inner}
      </button>
    );
  }

  return (
    <div className={rowClass} {...linkProps}>
      {inner}
    </div>
  );
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

function MultiSelectToolbar({
  selectedCount,
  selectableCount,
  deleting,
  onSelectAll,
  onClear,
  onBatchDelete,
}: {
  selectedCount: number;
  selectableCount: number;
  deleting?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onBatchDelete: () => void;
}) {
  if (selectableCount === 0) return null;

  const allSelected = selectedCount === selectableCount;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSelectAll}
        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
      >
        {allSelected ? '取消全选' : '全选'}
      </button>
      {selectedCount > 0 && (
        <>
          <span className="text-[10px] text-slate-500">已选 {selectedCount} 条</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
          >
            清空
          </button>
          <button
            type="button"
            onClick={onBatchDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {deleting ? '删除中…' : `删除 (${selectedCount})`}
          </button>
        </>
      )}
    </div>
  );
}
