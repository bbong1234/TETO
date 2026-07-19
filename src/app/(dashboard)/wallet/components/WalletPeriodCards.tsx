'use client';

import type { WalletPeriodSummary, WalletPeriodKey } from '@/types/teto';

interface WalletPeriodCardsProps {
  periods: WalletPeriodSummary[];
  selectedPeriod: WalletPeriodKey;
  onSelect: (period: WalletPeriodKey) => void;
}

function formatMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

export default function WalletPeriodCards({
  periods,
  selectedPeriod,
  onSelect,
}: WalletPeriodCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {periods.map((period) => {
        const active = period.period === selectedPeriod;
        const hasData = period.total_expense > 0 || period.total_income > 0;

        return (
          <button
            key={period.period}
            type="button"
            onClick={() => onSelect(period.period)}
            className={[
              'rounded-2xl border p-4 text-left transition-colors',
              active
                ? 'border-amber-300 bg-amber-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40',
            ].join(' ')}
          >
            <p className="text-sm font-semibold text-slate-800">{period.label}</p>
            <p className="mt-2 text-[11px] text-slate-400">
              {period.date_from === period.date_to
                ? period.date_from
                : `${period.date_from} 至 ${period.date_to}`}
            </p>

            {hasData ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">支出</span>
                  <span className="tabular-nums font-medium text-slate-800">
                    {formatMoney(period.total_expense)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">收入</span>
                  <span className="tabular-nums font-medium text-emerald-600">
                    {formatMoney(period.total_income)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-500">结余</span>
                  <span
                    className={[
                      'tabular-nums font-semibold',
                      period.net >= 0 ? 'text-emerald-700' : 'text-rose-600',
                    ].join(' ')}
                  >
                    {period.net >= 0 ? '+' : ''}
                    {formatMoney(period.net)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">暂无收支</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
