'use client';

import type { FinanceAccount } from '@/types/teto';
import { FINANCE_ACCOUNT_TYPE_ICONS } from '@/types/teto';

interface WalletAccountCardsProps {
  accounts: FinanceAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
  onManage?: () => void;
}

export default function WalletAccountCards({
  accounts,
  selectedAccountId,
  onSelect,
  onManage,
}: WalletAccountCardsProps) {
  if (accounts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">我的账户</h2>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="text-xs text-slate-500 hover:text-blue-600"
          >
            管理
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={[
            'shrink-0 min-w-[7rem] rounded-2xl border p-3 text-left transition-colors',
            selectedAccountId === null
              ? 'border-amber-300 bg-amber-50'
              : 'border-slate-200 bg-white hover:border-amber-200',
          ].join(' ')}
        >
          <p className="text-xs font-medium text-slate-600">全部账户</p>
          <p className="mt-1 text-[10px] text-slate-400">查看汇总</p>
        </button>
        {accounts.map((account) => {
          const active = selectedAccountId === account.id;
          const balance = account.current_balance ?? account.opening_balance;
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => onSelect(account.id)}
              className={[
                'shrink-0 min-w-[8.5rem] rounded-2xl border p-3 text-left transition-colors',
                active
                  ? 'border-amber-300 bg-amber-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-amber-200',
              ].join(' ')}
            >
              <p className="text-xs font-medium text-slate-800 truncate">
                {account.icon ?? FINANCE_ACCOUNT_TYPE_ICONS[account.account_type]} {account.name}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                ¥{balance.toFixed(2)}
              </p>
              {(account.period_expense != null || account.period_income != null) && (
                <p className="mt-1 text-[10px] text-slate-400">
                  本期 -{account.period_expense?.toFixed(0) ?? 0} / +{account.period_income?.toFixed(0) ?? 0}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
