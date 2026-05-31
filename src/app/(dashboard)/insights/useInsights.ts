'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { InsightsData, InsightMetricId } from '@/types/teto';

export interface UseInsightsOptions {
  /** 只算指定块（与服务端 `?metrics=` 一致）；不传则全量 */
  metrics?: InsightMetricId[];
  onLoadError?: () => void;
  /** 为 false 时不发起请求（用于分阶段加载） */
  enabled?: boolean;
}

/**
 * 洞察页数据：GET /api/v2/insights
 */
export function useInsights(dateFrom: string, dateTo: string, options?: UseInsightsOptions) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(() => Boolean(dateFrom && dateTo));
  const [error, setError] = useState<string | null>(null);

  const onLoadErrorRef = useRef(options?.onLoadError);
  onLoadErrorRef.current = options?.onLoadError;

  const metrics = options?.metrics;
  const metricsKey = metrics?.length ? metrics.join(',') : '';
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const enabled = options?.enabled !== false;

  const fetchInsights = useCallback(async () => {
    if (!dateFrom || !dateTo || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const m = metricsRef.current;
      if (m?.length) {
        params.set('metrics', m.join(','));
      }
      const res = await fetch(`/api/v2/insights?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || '请求失败');
      }
      const json = await res.json();
      setData(json.data as InsightsData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
      onLoadErrorRef.current?.();
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, metricsKey, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void fetchInsights();
  }, [fetchInsights, enabled]);

  return { data, loading, error, refetch: fetchInsights };
}
