'use client';

import type { WalletTransaction } from '@/types/teto';
import { MONEY_DIRECTION_LABELS } from '@/types/teto';

interface WalletTransactionListProps {
  transactions: WalletTransaction[];
}

function formatRecordDate(tx: WalletTransaction): string {
  const iso = tx.occurred_at || tx.created_at || tx.date;
  if (!iso) return tx.date;
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WalletTransactionList({ transactions }: WalletTransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">收支明细</h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">在记录页为记录添加金额与账户后，钱包会自动汇总</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-800">收支明细</h2>
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
        {transactions.map((tx) => {
          const isIncome = tx.money_direction === 'income';
          const isTransfer = tx.money_direction === 'transfer';
          const directionLabel =
            MONEY_DIRECTION_LABELS[tx.money_direction ?? 'expense'] ?? '支出';

          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{tx.content || '未命名'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatRecordDate(tx)} · {tx.account_label}
                  {isTransfer && tx.transfer_to_label ? ` → ${tx.transfer_to_label}` : ''} · {directionLabel}
                </p>
              </div>
              <span
                className={[
                  'text-sm font-semibold tabular-nums shrink-0',
                  isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-800',
                ].join(' ')}
              >
                {isIncome ? '+' : isTransfer ? '⇄' : '-'}¥{tx.cost.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
