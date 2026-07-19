'use client';

import { useState } from 'react';
import type { FinanceAccount } from '@/types/teto';
import {
  FINANCE_ACCOUNT_TYPE_ICONS,
  FINANCE_ACCOUNT_TYPE_LABELS,
  FINANCE_ACCOUNT_TYPES,
} from '@/types/teto';
import FinanceAccountCreateDialog from './FinanceAccountCreateDialog';

interface WalletAccountManageDrawerProps {
  open: boolean;
  accounts: FinanceAccount[];
  onClose: () => void;
  onUpdated: () => void;
  onError?: (message: string) => void;
}

export default function WalletAccountManageDrawer({
  open,
  accounts,
  onClose,
  onUpdated,
  onError,
}: WalletAccountManageDrawerProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');

  if (!open) return null;

  const startEdit = (account: FinanceAccount) => {
    setEditingId(account.id);
    setEditBalance(String(account.opening_balance));
  };

  const saveBalance = async (accountId: string) => {
    try {
      const res = await fetch(`/api/v2/finance-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_balance: Number.parseFloat(editBalance) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? '保存失败');
      setEditingId(null);
      onUpdated();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '保存失败');
    }
  };

  const archiveAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/v2/finance-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message ?? '归档失败');
      }
      onUpdated();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '归档失败');
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[110] bg-black/30"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[111] max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl lg:mx-auto lg:max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">账户管理</h3>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="text-xs font-medium text-blue-600"
          >
            + 新建
          </button>
        </div>
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-slate-200 p-3 flex items-center gap-3"
            >
              <span className="text-lg">
                {account.icon ?? FINANCE_ACCOUNT_TYPE_ICONS[account.account_type]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{account.name}</p>
                <p className="text-[10px] text-slate-400">
                  {FINANCE_ACCOUNT_TYPE_LABELS[account.account_type]} · 余额 ¥
                  {(account.current_balance ?? account.opening_balance).toFixed(2)}
                </p>
                {editingId === account.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      value={editBalance}
                      onChange={(e) => setEditBalance(e.target.value)}
                      className="w-28 rounded border border-slate-200 px-2 py-1 text-xs"
                      placeholder="期初余额"
                    />
                    <button
                      type="button"
                      onClick={() => void saveBalance(account.id)}
                      className="text-[10px] text-blue-600"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(account)}
                    className="mt-1 text-[10px] text-slate-400 hover:text-blue-600"
                  >
                    调整期初余额
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void archiveAccount(account.id)}
                className="text-[10px] text-slate-400 hover:text-red-500 shrink-0"
              >
                归档
              </button>
            </div>
          ))}
        </div>
      </div>
      <FinanceAccountCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          onUpdated();
        }}
        onError={onError}
      />
    </>
  );
}
