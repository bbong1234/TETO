'use client';

import { useState } from 'react';
import type { FinanceAccount, FinanceAccountType } from '@/types/teto';
import { FINANCE_ACCOUNT_TYPES, FINANCE_ACCOUNT_TYPE_LABELS, FINANCE_ACCOUNT_TYPE_ICONS } from '@/types/teto';

interface FinanceAccountCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (account: FinanceAccount) => void;
  onError?: (message: string) => void;
}

export default function FinanceAccountCreateDialog({
  open,
  onClose,
  onCreated,
  onError,
}: FinanceAccountCreateDialogProps) {
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<FinanceAccountType>('other');
  const [openingBalance, setOpeningBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onError?.('请输入账户名称');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/finance-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          account_type: accountType,
          opening_balance: openingBalance ? Number.parseFloat(openingBalance) : 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? json.error ?? '创建失败');
      onCreated(json.data as FinanceAccount);
      setName('');
      setAccountType('other');
      setOpeningBalance('');
      onClose();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">新建账户</h3>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="账户名称，如 招行储蓄卡"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {FINANCE_ACCOUNT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setAccountType(type);
                  if (!name.trim() && type !== 'other') {
                    setName(FINANCE_ACCOUNT_TYPE_LABELS[type]);
                  }
                }}
                className={[
                  'rounded-full px-2.5 py-1 text-[11px]',
                  accountType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {FINANCE_ACCOUNT_TYPE_ICONS[type]} {FINANCE_ACCOUNT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="期初余额（可选）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
