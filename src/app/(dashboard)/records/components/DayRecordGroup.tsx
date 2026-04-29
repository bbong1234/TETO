'use client';

import type { ReactNode } from 'react';
import type { Record } from '@/types/teto';
import RecordList from './RecordList';

interface DayRecordGroupProps {
  date: string;
  records: Record[];
  layout?: 'stacked' | 'column';
  /** 列模式顶部插槽（如 QuickInput），仅 layout=column 时渲染 */
  headerSlot?: ReactNode;
  aiPendingIds?: Set<string>;
  /** 多选模式 */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onRecordClick: (record: Record) => void;
  onStarToggle: (record: Record) => void;
  onComplete?: (record: Record) => void;
  onPostpone?: (record: Record) => void;
  onCancel?: (record: Record) => void;
  onConvertToPlan?: (record: Record) => void;
  onConvertToItem?: (record: Record) => void;
  onError: (message: string) => void;
}

function formatDisplayDate(dateStr: string, short?: boolean): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const label = short
    ? `${d.getMonth() + 1}/${d.getDate()} 周${weekDays[d.getDay()]}`
    : `${d.getMonth() + 1}月${d.getDate()}日 周${weekDays[d.getDay()]}`;

  if (dateStr === todayStr) return `${label} · 今天`;
  return label;
}

export default function DayRecordGroup({
  date,
  records,
  layout = 'stacked',
  headerSlot,
  aiPendingIds,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onRecordClick,
  onStarToggle,
  onComplete,
  onPostpone,
  onCancel,
  onConvertToPlan,
  onConvertToItem,
  onError,
}: DayRecordGroupProps) {
  // 列模式：固定头 + 可滚动记录区 + 底部总结
  if (layout === 'column') {
    return (
      <div className="w-[82vw] sm:w-[380px] h-full shrink-0 flex flex-col rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {/* 日期头 */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-900">{formatDisplayDate(date, true)}</h2>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {records.length}
            </span>
          </div>
        </div>

        {/* 顶部插槽（如 QuickInput） */}
        {headerSlot && (
          <div className="flex-shrink-0 border-b border-slate-100">
            {headerSlot}
          </div>
        )}

        {/* 可滚动记录区 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {records.length > 0 ? (
            <RecordList
              records={records}
              onRecordClick={onRecordClick}
              onStarToggle={onStarToggle}
              aiPendingIds={aiPendingIds}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onComplete={onComplete}
              onPostpone={onPostpone}
              onCancel={onCancel}
              onConvertToPlan={onConvertToPlan}
              onConvertToItem={onConvertToItem}
              compact
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center">
              <p className="text-[11px] text-slate-400">当日无记录</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 堆叠模式（默认）
  return (
    <div>
      {/* 日期分组头 */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-900">{formatDisplayDate(date)}</h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {records.length} 条
        </span>
      </div>

      {/* 记录列表 */}
      {records.length > 0 ? (
        <RecordList
          records={records}
          onRecordClick={onRecordClick}
          onStarToggle={onStarToggle}
          aiPendingIds={aiPendingIds}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onComplete={onComplete}
          onPostpone={onPostpone}
          onCancel={onCancel}
          onConvertToPlan={onConvertToPlan}
          onConvertToItem={onConvertToItem}
        />
      ) : (
        <div className="rounded-xl bg-white/50 p-4 text-center border border-dashed border-slate-200">
          <p className="text-xs text-slate-400">当日无记录</p>
        </div>
      )}
    </div>
  );
}
