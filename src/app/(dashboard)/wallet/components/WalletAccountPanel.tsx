'use client';

import type { WalletAccountRow } from '@/types/teto';

interface WalletAccountPanelProps {
  title: string;
  accounts: WalletAccountRow[];
}

function AccountBar({
  value,
  maxValue,
  barClass,
}: {
  value: number;
  maxValue: number;
  barClass: string;
}) {
  if (value <= 0) return null;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${barClass}`}
        style={{ width: `${(value / maxValue) * 100}%` }}
      />
    </div>
  );
}

export default function WalletAccountPanel({ title, accounts }: WalletAccountPanelProps) {
  if (accounts.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">该周期暂无分账户数据</p>
        </div>
      </div>
    );
  }

  const maxExpense = Math.max(...accounts.map((a) => a.expense), 1);
  const maxIncome = Math.max(...accounts.map((a) => a.income), 1);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
        {accounts.map((account) => (
          <div key={account.account_id ?? account.label} className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">
                {account.icon ? `${account.icon} ` : ''}
                {account.label}
              </span>
              <span
                className={[
                  'text-sm font-semibold tabular-nums shrink-0',
                  account.net >= 0 ? 'text-emerald-700' : 'text-rose-600',
                ].join(' ')}
              >
                {account.net >= 0 ? '+' : ''}¥{account.net.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span>支出</span>
                  <span className="tabular-nums text-slate-700">¥{account.expense.toFixed(2)}</span>
                </div>
                <AccountBar value={account.expense} maxValue={maxExpense} barClass="bg-amber-400" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span>收入</span>
                  <span className="tabular-nums text-emerald-600">¥{account.income.toFixed(2)}</span>
                </div>
                <AccountBar value={account.income} maxValue={maxIncome} barClass="bg-emerald-400" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
