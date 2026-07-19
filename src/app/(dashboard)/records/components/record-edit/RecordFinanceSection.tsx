'use client';

import { useEffect, useState } from 'react';
import {
  FINANCE_ACCOUNT_TYPE_ICONS,
  MONEY_DIRECTION_LABELS,
  type FinanceAccount,
} from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import {
  financeFieldsPatchForNone,
  formHasFinance,
  moneyDirectionLabel,
  resolveFormMoneyDirection,
} from '@/lib/activity/finance-account';
import RecordDetailSection from './RecordDetailSection';
import FinanceAccountCreateDialog from '@/app/(dashboard)/wallet/components/FinanceAccountCreateDialog';

interface RecordFinanceSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onError?: (message: string) => void;
}

export default function RecordFinanceSection({
  form,
  onPatch,
  onError,
}: RecordFinanceSectionProps) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const resolvedDirection = resolveFormMoneyDirection(form);
  const hasFinance = formHasFinance(form);
  const directionLabel = moneyDirectionLabel(resolvedDirection);

  const selectedAccount = accounts.find((a) => a.id === form.financeAccountId);
  const transferToAccount = accounts.find((a) => a.id === form.transferToAccountId);

  const summary = hasFinance
    ? `${directionLabel}${form.cost ? ` ¥${form.cost}` : ''}${
        selectedAccount || form.financeAccount
          ? ` · ${selectedAccount?.name ?? form.financeAccount}`
          : ''
      }${resolvedDirection === 'transfer' && transferToAccount ? ` → ${transferToAccount.name}` : ''}`
    : '';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch('/api/v2/finance-accounts');
        const json = await res.json();
        if (!cancelled && res.ok) {
          setAccounts(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectAccount = (account: FinanceAccount) => {
    onPatch({
      financeAccountId: account.id,
      financeAccount: account.name,
    });
  };

  const selectDirection = (direction: 'expense' | 'income' | 'transfer' | 'none') => {
    if (direction === 'none') {
      onPatch(financeFieldsPatchForNone());
      setOpen(false);
      return;
    }
    onPatch({
      moneyDirection: direction,
      transferToAccountId: direction === 'transfer' ? form.transferToAccountId : '',
    });
  };

  return (
    <RecordDetailSection title="收支">
      <div className="flex flex-wrap items-center gap-1.5">
        {hasFinance ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
          >
            {summary}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              onPatch({ moneyDirection: 'expense' });
            }}
            className="rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-600"
          >
            + 记一笔
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1">
            {(['expense', 'income', 'transfer', 'none'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => selectDirection(d)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  resolvedDirection === d
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {MONEY_DIRECTION_LABELS[d]}
              </button>
            ))}
          </div>

          {hasFinance && (
            <>
              <input
                type="number"
                value={form.cost}
                onChange={(e) => onPatch({ cost: e.target.value })}
                placeholder="金额"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />

              <div>
                <p className="text-[10px] text-slate-400 mb-1">
                  {resolvedDirection === 'transfer' ? '转出账户' : '账户'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {loadingAccounts && (
                    <span className="text-[10px] text-slate-400 px-2 py-1">加载账户…</span>
                  )}
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => selectAccount(account)}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        form.financeAccountId === account.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {account.icon ?? FINANCE_ACCOUNT_TYPE_ICONS[account.account_type]} {account.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:border-blue-300 hover:text-blue-600"
                  >
                    + 新建账户
                  </button>
                </div>
              </div>

              {resolvedDirection === 'transfer' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">转入账户</p>
                  <div className="flex flex-wrap gap-1">
                    {accounts
                      .filter((a) => a.id !== form.financeAccountId)
                      .map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => onPatch({ transferToAccountId: account.id })}
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            form.transferToAccountId === account.id
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {account.icon ?? FINANCE_ACCOUNT_TYPE_ICONS[account.account_type]} {account.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <input
                type="text"
                value={form.moneyCurrency}
                onChange={(e) => onPatch({ moneyCurrency: e.target.value })}
                placeholder="币种 CNY"
                className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
              />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              onPatch(financeFieldsPatchForNone());
              setOpen(false);
            }}
            className="text-[10px] text-slate-400 hover:text-red-500"
          >
            清除收支
          </button>
        </div>
      )}

      <FinanceAccountCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(account) => {
          setAccounts((prev) => [...prev, account]);
          selectAccount(account);
        }}
        onError={onError}
      />
    </RecordDetailSection>
  );
}
