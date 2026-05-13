'use client';

import { Filter } from 'lucide-react';
import type { Item, RecordType } from '@/types/teto';
import { RECORD_TYPES } from '@/types/teto';

interface FilterBarProps {
  filterType: RecordType | '';
  filterItemId: string;
  items: Item[];
  onFilterTypeChange: (type: RecordType | '') => void;
  onFilterItemChange: (itemId: string) => void;
}

export default function FilterBar({
  filterType,
  filterItemId,
  items,
  onFilterTypeChange,
  onFilterItemChange,
}: FilterBarProps) {
  const hasFilter = filterType || filterItemId;

  return (
    <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Filter className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-medium text-slate-500">筛选</span>
        {hasFilter && (
          <button
            onClick={() => {
              onFilterTypeChange('');
              onFilterItemChange('');
            }}
            className="ml-auto text-[10px] text-blue-500 hover:text-blue-600 font-medium"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 类型过滤 */}
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          onClick={() => onFilterTypeChange('')}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
            !filterType
              ? 'bg-blue-500 text-white'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          全部
        </button>
        {RECORD_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onFilterTypeChange(filterType === t ? '' : t)}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
              filterType === t
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 事项下拉 */}
      <div className="flex gap-2">
        <select
          value={filterItemId}
          onChange={(e) => onFilterItemChange(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部事项</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
