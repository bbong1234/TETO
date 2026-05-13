'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GoalEngineResult } from '@/types/teto';

/**
 * 目标引擎数据获取 Hook（统一接口）
 * 返回事项下所有目标的引擎计算结果
 */
export function useGoalEngine(itemId: string, refreshKey?: number) {
  const [data, setData] = useState<GoalEngineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEngine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/items/${itemId}/goal-engine`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '获取引擎数据失败');
      }
      const json = await res.json();
      setData(json.data || []);
    } catch (err: any) {
      setError(err.message || '获取引擎数据失败');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchEngine();
  }, [fetchEngine, refreshKey]);

  return { data, loading, error, refetch: fetchEngine };
}
