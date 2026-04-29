'use client';

import { CheckCircle2, CalendarClock, Layers, XCircle } from 'lucide-react';
import type { Record as TetoRecord, Phase } from '@/types/teto';

interface ItemTimelineProps {
  phases: Phase[];
  records: TetoRecord[];
  goalMap: Record<string, string>;
  onRecordClick: (record: TetoRecord) => void;
  onEditPhase: (phase: Phase) => void;
  onComplete?: (record: TetoRecord) => void;
  onPostpone?: (record: TetoRecord) => void;
  onCancel?: (record: TetoRecord) => void;
}

function isDateInPhase(dateStr: string | null | undefined, phase: Phase): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr).getTime();
  const start = phase.start_date ? new Date(phase.start_date).getTime() : -Infinity;
  const end = phase.end_date ? new Date(phase.end_date + 'T23:59:59').getTime() : Infinity;
  return date >= start && date <= end;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function formatPhaseRange(phase: Phase): string {
  const start = phase.start_date
    ? new Date(phase.start_date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  const end = phase.end_date
    ? new Date(phase.end_date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  if (start && end) return `${start} — ${end}`;
  if (start) return `${start} 起`;
  return '';
}

function getTimeValue(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return new Date(dateStr).getTime();
}

function RecordRow({
  record,
  onClick,
  onComplete,
  onPostpone,
  onCancel,
  phaseName,
}: {
  record: TetoRecord;
  onClick: () => void;
  onComplete?: () => void;
  onPostpone?: () => void;
  onCancel?: () => void;
  phaseName?: string;
}) {
  const hasMetric = record.metric_value != null && record.metric_value !== 0;
  const dateStr = formatDate(record.occurred_at || record.created_at);
  const canLifecycle = record.type === '计划' && (!record.lifecycle_status || record.lifecycle_status === 'active');

  return (
    <div
      className="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-white/60 cursor-pointer group transition-colors"
      onClick={onClick}
    >
      <span className="text-[11px] text-slate-400 shrink-0 w-12 pt-0.5">{dateStr}</span>
      {phaseName && (
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
          {phaseName}
        </span>
      )}
      <p className="flex-1 text-sm text-slate-700 line-clamp-2 leading-snug">{record.content}</p>
      {hasMetric && (
        <span className="shrink-0 text-[11px] font-semibold text-emerald-600 tabular-nums">
          +{record.metric_value!.toLocaleString()}{record.metric_unit ?? ''}
        </span>
      )}
      {canLifecycle && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onComplete?.(); }}
            className="p-1 rounded-lg text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
            title="完成"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPostpone?.(); }}
            className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
            title="推迟"
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
            className="p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="取消"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function PhaseMarker({
  phase,
  isCurrent,
  onEdit,
}: {
  phase: Phase;
  isCurrent: boolean;
  onEdit: (phase: Phase) => void;
}) {
  const range = formatPhaseRange(phase);

  return (
    <div className={`rounded-2xl border mb-3 ${isCurrent ? 'border-indigo-200 bg-indigo-50/40 shadow-sm' : 'border-slate-200/60 bg-slate-50/40'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 group">
        <div className={`w-1 h-5 rounded-full shrink-0 ${isCurrent ? 'bg-indigo-400' : 'bg-slate-300'}`} />
        <Layers className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? 'text-indigo-400' : 'text-slate-300'}`} />
        <span className={`text-sm font-semibold truncate flex-1 ${isCurrent ? 'text-indigo-800' : 'text-slate-600'}`}>
          {phase.title || '未命名阶段'}
        </span>
        {range && (
          <span className="shrink-0 text-[11px] text-slate-400">{range}</span>
        )}
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isCurrent ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
          {isCurrent ? '进行中' : '已结束'}
        </span>
        <button
          className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-all"
          onClick={(e) => { e.stopPropagation(); onEdit(phase); }}
          title="编辑阶段"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
      </div>
      {phase.description && (
        <div className="px-4 pb-2.5">
          <p className="text-xs text-slate-500 leading-relaxed">{phase.description}</p>
        </div>
      )}
    </div>
  );
}

export default function ItemTimeline({
  phases,
  records,
  goalMap: _goalMap,
  onRecordClick,
  onEditPhase,
  onComplete,
  onPostpone,
  onCancel,
}: ItemTimelineProps) {
  const isCurrentPhase = (p: Phase) => !p.end_date;

  // Sort records by occurred_at descending
  const sortedRecords = [...records].sort(
    (a, b) => getTimeValue(b.occurred_at || b.created_at) - getTimeValue(a.occurred_at || a.created_at)
  );

  // Sort phases by start_date descending (current phase first)
  const sortedPhases = [...phases].sort((a, b) => {
    const aCurrent = isCurrentPhase(a) ? 1 : 0;
    const bCurrent = isCurrentPhase(b) ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    return getTimeValue(b.start_date || b.created_at) - getTimeValue(a.start_date || a.created_at);
  });

  // Build phase map for quick lookup
  const phaseMap = new Map(phases.map(p => [p.id, p.title]));

  // Find which phase a record belongs to (by date matching)
  const getRecordPhase = (record: TetoRecord): Phase | undefined => {
    const dateStr = record.occurred_at || record.created_at;
    return sortedPhases.find(p => isDateInPhase(dateStr, p));
  };

  // Build timeline items: records and phase markers interleaved by time
  type TimelineItem =
    | { kind: 'record'; record: TetoRecord; time: number }
    | { kind: 'phase-marker'; phase: Phase; time: number };

  const timeline: TimelineItem[] = [];

  // Add phase markers (each at its start_date position)
  for (const phase of sortedPhases) {
    const phaseTime = phase.start_date
      ? new Date(phase.start_date).getTime()
      : new Date(phase.created_at).getTime();
    timeline.push({ kind: 'phase-marker', phase, time: phaseTime });
  }

  // Add records
  for (const record of sortedRecords) {
    const recordTime = getTimeValue(record.occurred_at || record.created_at);
    timeline.push({ kind: 'record', record, time: recordTime });
  }

  // Sort all items by time descending
  timeline.sort((a, b) => b.time - a.time);

  const hasContent = sortedPhases.length > 0 || sortedRecords.length > 0;

  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
        <p className="text-sm text-slate-400">暂无阶段或记录</p>
        <p className="text-xs text-slate-300 mt-1">在记录页创建记录时关联此事项</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Timeline: phase markers and records interleaved */}
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />

        {timeline.map((item, idx) => {
          if (item.kind === 'phase-marker') {
            return (
              <div key={`phase-${item.phase.id}`} className="relative pl-9">
                {/* Dot on timeline */}
                <div className={`absolute left-[18px] top-3 w-2.5 h-2.5 rounded-full border-2 ${isCurrentPhase(item.phase) ? 'bg-indigo-400 border-indigo-300' : 'bg-slate-300 border-slate-200'} z-10`} />
                <PhaseMarker
                  phase={item.phase}
                  isCurrent={isCurrentPhase(item.phase)}
                  onEdit={onEditPhase}
                />
              </div>
            );
          }

          // Record row
          const record = item.record;
          const matchedPhase = getRecordPhase(record);
          const phaseTag = matchedPhase ? phaseMap.get(matchedPhase.id) : undefined;

          return (
            <div key={`record-${record.id}`} className="relative pl-9">
              {/* Dot on timeline */}
              <div className="absolute left-[19px] top-2.5 w-1.5 h-1.5 rounded-full bg-slate-300 z-10" />
              <RecordRow
                record={record}
                onClick={() => onRecordClick(record)}
                onComplete={onComplete ? () => onComplete(record) : undefined}
                onPostpone={onPostpone ? () => onPostpone(record) : undefined}
                onCancel={onCancel ? () => onCancel(record) : undefined}
                phaseName={phaseTag}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { ItemTimelineProps };
