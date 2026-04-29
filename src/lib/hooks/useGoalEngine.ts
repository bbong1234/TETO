'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GoalEngineResult, RepeatGoalEngineResult } from '@/types/teto';

/**
 * 量化目标引擎 Hook
 * 调用 /api/v2/items/{itemId}/goal-engine 获取该事项下所有量化目标和重复型目标的计算结果
 */
export function useGoalEngine(itemId: string) {
  const [data, setData] = useState<GoalEngineResult[]>([]);
  const [repeatData, setRepeatData] = useState<RepeatGoalEngineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEngine = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/items/${itemId}/goal-engine`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }
      const json = await res.json();
      setData(json.data || []);
      setRepeatData(json.repeatGoals || []);
    } catch (err: any) {
      console.error('量化引擎数据获取失败:', err);
      setError(err.message || '未知错误');
      setData([]);
      setRepeatData([]);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchEngine();
  }, [fetchEngine]);

  return { data, repeatData, loading, error, refetch: fetchEngine };
}
