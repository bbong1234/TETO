'use client';

import type { Record } from '@/types/teto';
import RecordItem from './RecordItem';

function formatTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface RecordListProps {
  records: Record[];
  onRecordClick: (record: Record) => void;
  onStarToggle: (record: Record) => void;
  compact?: boolean;
  aiPendingIds?: Set<string>;
  /** 多选模式 */
  selectionMode?: boolean;
  /** 已选中的 ID 集合 */
  selectedIds?: Set<string>;
  /** 切换选中 */
  onToggleSelect?: (id: string) => void;
  /** 完成计划 */
  onComplete?: (record: Record) => void;
  /** 推迟计划 */
  onPostpone?: (record: Record) => void;
  /** 取消计划 */
  onCancel?: (record: Record) => void;
  /** 想法转计划 */
  onConvertToPlan?: (record: Record) => void;
  /** 想法转事项 */
  onConvertToItem?: (record: Record) => void;
}

export default function RecordList({ records, onRecordClick, onStarToggle, compact, aiPendingIds, selectionMode, selectedIds, onToggleSelect, onComplete, onPostpone, onCancel, onConvertToPlan, onConvertToItem }: RecordListProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-sm">暂无记录</p>
        <p className="mt-1 text-xs">在上方输入框中快速记录</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 时间线竖线 */}
      <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-blue-200 via-slate-200 to-transparent rounded-full" />

      <div className="space-y-2">
        {records.map((record) => {
          const time = formatTimeShort(record.occurred_at) || formatTimeShort(record.created_at);
          return (
            <div key={record.id} className="relative flex gap-3">
              {/* 时间线节点 */}
              <div className="relative z-10 flex flex-col items-center pt-3 shrink-0">
                <span className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                  record.type === '计划' ? 'bg-blue-400' :
                  record.type === '想法' ? 'bg-amber-400' :
                  record.type === '总结' ? 'bg-slate-400' :
                  'bg-green-400'
                }`} />
                {time && (
                  <span className="mt-1 text-[9px] font-medium text-slate-400 leading-none whitespace-nowrap">
                    {time}
                  </span>
                )}
              </div>
              {/* 卡片 */}
              <div className="flex-1 min-w-0">
                <RecordItem
                  record={record}
                  onClick={() => onRecordClick(record)}
                  onStarToggle={() => onStarToggle(record)}
                  compact={compact}
                  aiPending={aiPendingIds?.has(record.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds?.has(record.id)}
                  onToggleSelect={() => onToggleSelect?.(record.id)}
                  onComplete={() => onComplete?.(record)}
                  onPostpone={() => onPostpone?.(record)}
                  onCancel={() => onCancel?.(record)}
                  onConvertToPlan={() => onConvertToPlan?.(record)}
                  onConvertToItem={() => onConvertToItem?.(record)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
