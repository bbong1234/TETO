'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WalletPeriodKey, WalletSummary } from '@/types/teto';

export function useWalletSummary(
  detailPeriod: WalletPeriodKey,
  accountId?: string | null
) {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ detail_period: detailPeriod });
      if (accountId) params.set('account_id', accountId);
      const res = await fetch(`/api/v2/wallet/summary?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || '请求失败');
      }
      setData(json.data as WalletSummary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [detailPeriod, accountId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}
