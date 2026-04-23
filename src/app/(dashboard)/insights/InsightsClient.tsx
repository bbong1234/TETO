'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import DateRangeSelector from './components/DateRangeSelector';
import RecordStats from './components/RecordStats';
import ItemStats from './components/ItemStats';
import PhaseInsights from './components/PhaseInsights';
import GoalInsights from './components/GoalInsights';
import type { InsightsData } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';

type DatePreset = '7d' | '30d' | 'month' | 'custom';

function getDateRange(preset: DatePreset): { date_from: string; date_to: string } {
  const today = new Date();
  const date_to = today.toISOString().split('T')[0];

  let date_from: string;
  if (preset === '7d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    date_from = from.toISOString().split('T')[0];
  } else if (preset === '30d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    date_from = from.toISOString().split('T')[0];
  } else if (preset === 'month') {
    date_from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  } else {
    // custom - should not reach here
    date_from = date_to;
  }

  return { date_from, date_to };
}

export default function InsightsClient() {
  const [preset, setPreset] = useState<DatePreset>('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toasts, showError, dismissToast } = useToast();

  // Initialize dates
  useEffect(() => {
    const range = getDateRange(preset);
    setDateFrom(range.date_from);
    setDateTo(range.date_to);
  }, []);

  const fetchInsights = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/insights?date_from=${from}&date_to=${to}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '请求失败');
      }
      const json = await res.json();
      setInsightsData(json.data);
    } catch (err: any) {
      setError(err.message || '加载失败');
      showError('加载洞察数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when date range changes
  useEffect(() => {
    if (dateFrom && dateTo) {
      fetchInsights(dateFrom, dateTo);
    }
  }, [dateFrom, dateTo, fetchInsights]);

  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset as DatePreset);
    if (newPreset !== 'custom') {
      const range = getDateRange(newPreset as DatePreset);
      setDateFrom(range.date_from);
      setDateTo(range.date_to);
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    setPreset('custom');
    setDateFrom(from);
    setDateTo(to);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 lg:p-6">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h1 className="text-xl font-bold text-slate-900">洞察</h1>
        </div>
        <DateRangeSelector
          preset={preset}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onPresetChange={handlePresetChange}
          onCustomDateChange={handleCustomDateChange}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-slate-500">加载中...</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => fetchInsights(dateFrom, dateTo)}
              className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <RefreshCw className="h-3 w-3" />
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && insightsData && (
          <>
            <RecordStats data={insightsData.record_overview} />
            <ItemStats data={insightsData.item_overview} />
            <PhaseInsights data={insightsData.phaseInsights} />
            <GoalInsights data={insightsData.goalInsights} />
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
