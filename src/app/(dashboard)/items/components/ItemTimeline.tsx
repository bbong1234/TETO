'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Clock } from 'lucide-react';
import type { Record as TetoRecord, Phase } from '@/types/teto';

interface ItemTimelineProps {
  phases: Phase[];
  records: TetoRecord[];
  goalMap: Record<string, string>;
  onRecordClick: (record: TetoRecord) => void;
  onEditPhase: (phase: Phase) => void;
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

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatPhaseRange(phase: Phase): string {
  const start = phase.start_date
    ? new Date(phase.start_date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric' })
    : null;
  const end = phase.end_date
    ? new Date(phase.end_date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric' })
    : null;
  if (start && end) return `${start} — ${end}`;
  if (start) return `${start} 起`;
  return '';
}

function RecordRow({ record, onClick }: { record: TetoRecord; onClick: () => void }) {
  const hasMetric = record.metric_value != null && record.metric_value !== 0;
  const dateStr = formatDate(record.occurred_at || record.created_at);

  return (
    <div
      className="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-white/60 cursor-pointer group transition-colors"
      onClick={onClick}
    >
      <span className="text-[11px] text-slate-400 shrink-0 w-12 pt-0.5">{dateStr}</span>
      <p className="flex-1 text-sm text-slate-700 line-clamp-2 leading-snug">{record.content}</p>
      {hasMetric && (
        <span className="shrink-0 text-[11px] font-semibold text-emerald-600 tabular-nums">
          +{record.metric_value!.toLocaleString()}{record.metric_unit ?? ''}
        </span>
      )}
    </div>
  );
}

function PhaseChapter({
  phase,
  records,
  isCurrentPhase,
  onRecordClick,
  onEditPhase,
}: {
  phase: Phase;
  records: TetoRecord[];
  isCurrentPhase: boolean;
  onRecordClick: (r: TetoRecord) => void;
  onEditPhase: (p: Phase) => void;
}) {
  const [expanded, setExpanded] = useState(isCurrentPhase);
  const range = formatPhaseRange(phase);
  const metricRecords = records.filter(r => r.metric_value != null && r.metric_value !== 0);
  const totalMetric = metricRecords.reduce((s, r) => s + (r.metric_value ?? 0), 0);
  const unit = metricRecords[0]?.metric_unit ?? '';

  return (
    <div className={`mb-3 rounded-2xl overflow-hidden border ${isCurrentPhase ? 'border-indigo-200 shadow-sm' : 'border-slate-200/60'}`}>
      {/* 章节头 */}
      <div
        className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none ${
          isCurrentPhase ? 'bg-indigo-50/80' : 'bg-slate-50/60 hover:bg-slate-100/60'
        } transition-colors`}
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`shrink-0 ${isCurrentPhase ? 'text-indigo-400' : 'text-slate-300'}`}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        {/* 竖线装饰 */}
        <div className={`w-1 h-4 rounded-full shrink-0 ${isCurrentPhase ? 'bg-indigo-400' : 'bg-slate-300'}`} />

        <span className={`text-sm font-semibold truncate flex-1 ${isCurrentPhase ? 'text-indigo-800' : 'text-slate-700'}`}>
          {phase.title || '未命名阶段'}
        </span>

        {isCurrentPhase && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">进行中</span>
        )}

        {range && (
          <span className="shrink-0 text-[11px] text-slate-400">{range}</span>
        )}

        {totalMetric > 0 && (
          <span className="shrink-0 text-[11px] font-semibold text-emerald-600 tabular-nums">
            {totalMetric.toLocaleString()}{unit}
          </span>
        )}

        <span className="shrink-0 text-[11px] text-slate-400">{records.length} 条</span>

        <button
          className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-all"
          onClick={e => { e.stopPropagation(); onEditPhase(phase); }}
          title="编辑阶段"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      {/* 记录列表 */}
      {expanded && (
        <div className="px-2 py-1.5 space-y-0.5">
          {records.length === 0 ? (
            <p className="text-[11px] text-slate-300 px-3 py-2">暂无记录</p>
          ) : (
            records.map(r => (
              <RecordRow key={r.id} record={r} onClick={() => onRecordClick(r)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ItemTimeline({
  phases,
  records,
  goalMap,
  onRecordClick,
  onEditPhase,
}: ItemTimelineProps) {
  // 按 start_date 降序排列阶段（当前阶段优先）
  const sortedPhases = [...phases].sort((a, b) => {
    const aIsCurrent = a.status === '进行中' ? 1 : 0;
    const bIsCurrent = b.status === '进行中' ? 1 : 0;
    if (aIsCurrent !== bIsCurrent) return bIsCurrent - aIsCurrent;
    return new Date(b.start_date || b.created_at).getTime() - new Date(a.start_date || a.created_at).getTime();
  });

  // 按 occurred_at 降序排列记录
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.occurred_at || b.created_at).getTime() - new Date(a.occurred_at || a.created_at).getTime()
  );

  // 将记录归入阶段
  const phaseRecordsMap = new Map<string, TetoRecord[]>();
  for (const p of sortedPhases) phaseRecordsMap.set(p.id, []);
  const unnamedRecords: TetoRecord[] = [];

  for (const r of sortedRecords) {
    const matched = sortedPhases.find(p => isDateInPhase(r.occurred_at || r.created_at, p));
    if (matched) {
      phaseRecordsMap.get(matched.id)!.push(r);
    } else {
      unnamedRecords.push(r);
    }
  }

  const hasContent = sortedPhases.length > 0 || unnamedRecords.length > 0;

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
      {/* 各阶段章节 */}
      {sortedPhases.map(phase => (
        <PhaseChapter
          key={phase.id}
          phase={phase}
          records={phaseRecordsMap.get(phase.id) ?? []}
          isCurrentPhase={phase.status === '进行中'}
          onRecordClick={onRecordClick}
          onEditPhase={onEditPhase}
        />
      ))}

      {/* 未归入阶段的记录 */}
      {unnamedRecords.length > 0 && (
        <UnnamedChapter records={unnamedRecords} onRecordClick={onRecordClick} />
      )}
    </div>
  );
}

function UnnamedChapter({ records, onRecordClick }: { records: TetoRecord[]; onRecordClick: (r: TetoRecord) => void }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-3 rounded-2xl overflow-hidden border border-slate-200/60">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none bg-slate-50/60 hover:bg-slate-100/60 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-slate-300">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <div className="w-1 h-4 rounded-full shrink-0 bg-slate-200" />
        <span className="text-sm font-medium text-slate-500 flex-1">未归入阶段</span>
        <span className="text-[11px] text-slate-400">{records.length} 条</span>
      </div>
      {expanded && (
        <div className="px-2 py-1.5 space-y-0.5">
          {records.map(r => (
            <RecordRow key={r.id} record={r} onClick={() => onRecordClick(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { ItemTimelineProps };
