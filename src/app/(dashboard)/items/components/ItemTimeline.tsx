'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, CalendarClock, Layers, XCircle, Check, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Record as TetoRecord, Phase } from '@/types/teto';

interface PlaceholderEntry {
  id: string;
  date: string;
}

interface ItemTimelineProps {
  phases: Phase[];
  records: TetoRecord[];
  goalMap: Record<string, string>;
  onRecordClick: (record: TetoRecord) => void;
  onEditPhase: (phase: Phase) => void;
  onComplete?: (record: TetoRecord) => void;
  onPostpone?: (record: TetoRecord) => void;
  onCancel?: (record: TetoRecord) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onBatchDelete?: () => void;
  batchDeleting?: boolean;
  placeholders?: PlaceholderEntry[];
  onSelectAllInYear?: (year: string) => void;
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

/** 从 time_text 中提取时间段排序权重（0-23），用于计划记录排序 */
function getTimeTextSortWeight(timeText: string | null | undefined): number {
  if (!timeText) return 12; // 无时间文本默认中午
  const lower = timeText.toLowerCase();
  if (lower.includes('凌晨') || lower.includes('深夜')) return 0;
  if (lower.includes('早上') || lower.includes('早晨') || lower.includes('清晨') || lower.includes('上午')) return 8;
  if (lower.includes('中午') || lower.includes('午饭') || lower.includes('午休')) return 12;
  if (lower.includes('下午')) return 15;
  if (lower.includes('傍晚') || lower.includes('黄昏')) return 18;
  if (lower.includes('晚上') || lower.includes('夜晚') || lower.includes('夜里') || lower.includes('晚饭')) return 20;
  // 尝试从 time_text 提取具体时间（如"明天下午3点"）
  const hourMatch = timeText.match(/(\d{1,2})\s*点/);
  if (hourMatch) {
    let h = parseInt(hourMatch[1]);
    if (h <= 12 && (lower.includes('下午') || lower.includes('晚上'))) h += 12;
    return h;
  }
  return 12; // 默认
}

/** 获取计划记录的可排序时间值（综合 time_anchor_date + time_text 时段权重） */
function getPlanSortValue(record: TetoRecord): number {
  // 优先使用 occurred_at（AI 增强后可能设了）
  if (record.occurred_at) return getTimeValue(record.occurred_at);
  // 其次 time_anchor_date + time_text 时段权重 → 构造一个可排序的伪时间戳
  const dateStr = record.time_anchor_date || record.created_at;
  const dateTs = getTimeValue(dateStr);
  if (dateTs === 0) return 0;
  // 在日期基础上加上小时权重（将小时权重转为毫秒偏移）
  const hourWeight = getTimeTextSortWeight(record.time_text);
  return dateTs + hourWeight * 3600 * 1000;
}

function RecordRow({
  record,
  onClick,
  onComplete,
  onPostpone,
  onCancel,
  phaseName,
  selectionMode,
  selected,
  onToggleSelect,
}: {
  record: TetoRecord;
  onClick: () => void;
  onComplete?: () => void;
  onPostpone?: () => void;
  onCancel?: () => void;
  phaseName?: string;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasMetric = record.metric_value != null && record.metric_value !== 0;
  const dateStr = formatDate(record.occurred_at || record.created_at);
  const canLifecycle = record.type === '计划' && (!record.lifecycle_status || record.lifecycle_status === 'active');

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 rounded-xl cursor-pointer group transition-colors ${
        selected ? 'bg-blue-50/60' : 'hover:bg-white/60'
      }`}
      onClick={selectionMode ? onToggleSelect : onClick}
    >
      {selectionMode && (
        <span className={`flex h-4 w-4 mt-0.5 shrink-0 items-center justify-center rounded border transition-colors ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'
        }`}>
          {selected && <Check className="h-3 w-3 text-white" />}
        </span>
      )}
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

function PlaceholderRow({ dateStr }: { dateStr: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-xl opacity-40">
      <span className="text-[11px] text-slate-400 shrink-0 w-12 pt-0.5">{dateStr}</span>
      <p className="flex-1 text-sm text-slate-400 italic">未记录</p>
      <span className="shrink-0 text-[11px] text-slate-300 tabular-nums">—</span>
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
  selectionMode,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onBatchDelete,
  batchDeleting,
  placeholders,
  onSelectAllInYear,
}: ItemTimelineProps) {
  const isCurrentPhase = (p: Phase) => !p.end_date;

  // Sort records with type-aware direction:
  // Plans: ascending (earliest first), using time_anchor_date + time_text for proper ordering
  // Others: descending (newest first)
  const sortedRecords = [...records].sort((a, b) => {
    const aIsPlan = a.type === '计划';
    const bIsPlan = b.type === '计划';
    // Plans before others
    if (aIsPlan !== bIsPlan) return aIsPlan ? -1 : 1;
    if (aIsPlan && bIsPlan) {
      // Plans: ascending (earliest first), using combined anchor date + time_text weight
      return getPlanSortValue(a) - getPlanSortValue(b);
    } else {
      // Others: descending (newest first)
      return getTimeValue(b.occurred_at || b.created_at) - getTimeValue(a.occurred_at || a.created_at);
    }
  });

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

  // Build timeline items: records, phase markers, and placeholders interleaved by time
  type TimelineItem =
    | { kind: 'record'; record: TetoRecord; time: number }
    | { kind: 'phase-marker'; phase: Phase; time: number }
    | { kind: 'placeholder'; placeholder: PlaceholderEntry; time: number };

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

  // Add placeholder entries (days with no records within goal range)
  for (const p of (placeholders || [])) {
    const t = new Date(p.date + 'T00:00:00Z').getTime();
    timeline.push({ kind: 'placeholder', placeholder: p, time: t });
  }

  // Sort all items by time descending
  timeline.sort((a, b) => b.time - a.time);

  // Year-based grouping: default all collapsed
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const yearGroups = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();
    for (const item of timeline) {
      let year = '未知';
      if (item.kind === 'record') {
        const d = item.record.occurred_at || item.record.created_at;
        if (d) year = new Date(d).getFullYear().toString();
      } else if (item.kind === 'phase-marker') {
        const d = item.phase.start_date || item.phase.created_at;
        if (d) year = new Date(d).getFullYear().toString();
      } else if (item.kind === 'placeholder') {
        year = new Date(item.placeholder.date).getFullYear().toString();
      }
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(item);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [timeline]);

  const toggleYearExpand = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const hasContent = sortedPhases.length > 0 || sortedRecords.length > 0 || (placeholders?.length ?? 0) > 0;

  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
        <p className="text-sm text-slate-400">暂无阶段或记录</p>
        <p className="text-xs text-slate-300 mt-1">在记录页创建记录时关联此事项</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* 多选操作栏 */}
      {selectionMode && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-xl bg-amber-50/60 border border-amber-100">
          <span className="text-xs text-slate-500">已选 {selectedIds?.size ?? 0} 条</span>
          <button
            onClick={onSelectAll}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            全选
          </button>
          <button
            onClick={onBatchDelete}
            disabled={!selectedIds?.size || batchDeleting}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            {batchDeleting ? '删除中...' : '删除选中'}
          </button>
        </div>
      )}

      {/* Year groups: reverse chronological, collapsible */}
      {yearGroups.map(([year, items]) => {
        const isExpanded = expandedYears.has(year);
        const recordItems = items.filter(i => i.kind === 'record');
        const recordCount = recordItems.length;
        const placeholderCount = items.filter(i => i.kind === 'placeholder').length;
        const allYearSelected = recordCount > 0 && recordItems.every(i => selectedIds?.has(i.record.id));

        return (
          <div key={year} className="mb-1">
            {/* Year header */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50/60 cursor-pointer hover:bg-slate-100/60 transition-colors select-none"
              onClick={() => toggleYearExpand(year)}
            >
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-slate-400" />
                : <ChevronRight className="h-4 w-4 text-slate-400" />
              }
              <span className="text-sm font-bold text-slate-700">{year}年</span>
              <span className="text-[11px] text-slate-400">
                {recordCount}条记录{placeholderCount > 0 ? ` · ${placeholderCount}天未记录` : ''}
              </span>
              {selectionMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectAllInYear?.(year); }}
                  className={`ml-auto rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    allYearSelected
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  {allYearSelected ? '取消全选' : '全选'}
                </button>
              )}
            </div>

            {/* Year content (expanded) */}
            {isExpanded && (
              <div className="relative mt-1">
                <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />

                {items.map((item) => {
                  if (item.kind === 'phase-marker') {
                    return (
                      <div key={`phase-${item.phase.id}`} className="relative pl-9">
                        <div className={`absolute left-[18px] top-3 w-2.5 h-2.5 rounded-full border-2 ${isCurrentPhase(item.phase) ? 'bg-indigo-400 border-indigo-300' : 'bg-slate-300 border-slate-200'} z-10`} />
                        <PhaseMarker
                          phase={item.phase}
                          isCurrent={isCurrentPhase(item.phase)}
                          onEdit={onEditPhase}
                        />
                      </div>
                    );
                  }

                  if (item.kind === 'placeholder') {
                    const formatted = formatDate(item.placeholder.date);
                    return (
                      <div key={item.placeholder.id} className="relative pl-9">
                        <div className="absolute left-[19px] top-2.5 w-1.5 h-1.5 rounded-full bg-slate-200 z-10" />
                        <PlaceholderRow dateStr={formatted} />
                      </div>
                    );
                  }

                  // Record row
                  const record = item.record;
                  const matchedPhase = getRecordPhase(record);
                  const phaseTag = matchedPhase ? phaseMap.get(matchedPhase.id) : undefined;

                  return (
                    <div key={`record-${record.id}`} className="relative pl-9">
                      <div className="absolute left-[19px] top-2.5 w-1.5 h-1.5 rounded-full bg-slate-300 z-10" />
                      <RecordRow
                        record={record}
                        onClick={() => onRecordClick(record)}
                        onComplete={onComplete ? () => onComplete(record) : undefined}
                        onPostpone={onPostpone ? () => onPostpone(record) : undefined}
                        onCancel={onCancel ? () => onCancel(record) : undefined}
                        phaseName={phaseTag}
                        selectionMode={selectionMode}
                        selected={selectedIds?.has(record.id)}
                        onToggleSelect={onToggleSelect ? () => onToggleSelect(record.id) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { ItemTimelineProps };
