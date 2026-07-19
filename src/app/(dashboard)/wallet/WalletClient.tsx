'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import type { WalletPeriodKey } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { useWalletSummary } from './useWalletSummary';
import WalletPeriodCards from './components/WalletPeriodCards';
import WalletAccountPanel from './components/WalletAccountPanel';
import WalletTransactionList from './components/WalletTransactionList';
import WalletTotalAssetsBar from './components/WalletTotalAssetsBar';
import WalletAccountCards from './components/WalletAccountCards';
import WalletAccountManageDrawer from './components/WalletAccountManageDrawer';
import WalletStructurePanel from './components/WalletStructurePanel';
import WalletGoalsPanel from './components/WalletGoalsPanel';

export default function WalletClient() {
  const [selectedPeriod, setSelectedPeriod] = useState<WalletPeriodKey>('today');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const { toasts, showError, dismissToast } = useToast();
  const { data, loading, error, refetch } = useWalletSummary(selectedPeriod, selectedAccountId);

  const selectedPeriodSummary = useMemo(
    () => data?.periods.find((p) => p.period === selectedPeriod) ?? null,
    [data, selectedPeriod]
  );

  const handleRefetch = () => {
    void refetch().catch(() => showError('刷新失败'));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 lg:p-6">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-amber-600" />
          <h1 className="text-xl font-bold text-slate-900">钱包</h1>
        </div>
        <Link
          href="/records"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          去记录页记账
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
        {loading && (
          <div className="rounded-xl border border-slate-100 bg-white p-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载钱包数据…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={handleRefetch}
              className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <RefreshCw className="h-3 w-3" />
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <WalletTotalAssetsBar totalAssets={data.total_assets} />

            <WalletAccountCards
              accounts={data.accounts}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
              onManage={() => setManageOpen(true)}
            />

            <WalletPeriodCards
              periods={data.periods}
              selectedPeriod={selectedPeriod}
              onSelect={setSelectedPeriod}
            />

            <WalletAccountPanel
              title={`${selectedPeriodSummary?.label ?? '当前周期'} · 分账户`}
              accounts={selectedPeriodSummary?.by_account ?? []}
            />

            <WalletStructurePanel
              byCategory={data.structure?.by_category ?? []}
              byItem={data.structure?.by_item ?? []}
            />

            <WalletGoalsPanel
              periodExpense={selectedPeriodSummary?.total_expense ?? 0}
              onError={showError}
            />

            <WalletTransactionList transactions={data.transactions} />
          </>
        )}
      </div>

      <WalletAccountManageDrawer
        open={manageOpen}
        accounts={data?.accounts ?? []}
        onClose={() => setManageOpen(false)}
        onUpdated={() => void refetch()}
        onError={showError}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
