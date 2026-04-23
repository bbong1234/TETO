'use client';

type DatePreset = '7d' | '30d' | 'month' | 'custom';

interface DateRangeSelectorProps {
  preset: DatePreset;
  dateFrom: string;
  dateTo: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomDateChange: (from: string, to: string) => void;
}

const PRESETS = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'month', label: '本月' },
] as const;

export default function DateRangeSelector({
  preset,
  dateFrom,
  dateTo,
  onPresetChange,
  onCustomDateChange,
}: DateRangeSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPresetChange(p.key)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              preset === p.key
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onCustomDateChange(e.target.value, dateTo)}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-400">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onCustomDateChange(dateFrom, e.target.value)}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
