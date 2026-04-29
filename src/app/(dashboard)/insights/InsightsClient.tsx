'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import DateRangeSelector from './components/DateRangeSelector';
import RecordStats from './components/RecordStats';
import ItemPortrait from './components/ItemPortrait';
import TimeDistribution from './components/TimeDistribution';
import CrossItemComparison from './components/CrossItemComparison';
import PhaseInsights from './components/PhaseInsights';
import GoalInsights from './components/GoalInsights';
import UnassignedStats from './components/UnassignedStats';
import FourAxesInsight from './components/FourAxesInsight';
import PeriodComparison from './components/PeriodComparison';
import FactSummary from './components/FactSummary';
import RulePanel from './components/RulePanel';
import MetricsByItem from './components/MetricsByItem';
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
        <button
          onClick={() => {
            const params = new URLSearchParams();
            if (dateFrom) params.set('date_from', dateFrom);
            if (dateTo) params.set('date_to', dateTo);
            window.open(`/api/v2/export/records?${params.toString()}`, '_blank');
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          导出
        </button>
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
            {insightsData.inferred_stats && insightsData.inferred_stats.inferred_count > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                <p className="text-[11px] text-amber-700">
                  含 {insightsData.inferred_stats.inferred_count} 条推断数据（占比 {insightsData.inferred_stats.inferred_ratio}%），统计口径默认仅基于事实记录
                </p>
              </div>
            )}
            <ItemPortrait data={insightsData.item_overview} />
            <TimeDistribution data={insightsData.time_distribution} />
            <CrossItemComparison data={insightsData.item_time_ranking} />
            {insightsData.unassigned_stats && (
              <UnassignedStats
                unassigned_count={insightsData.unassigned_stats.unassigned_count}
                unassigned_duration_minutes={insightsData.unassigned_stats.unassigned_duration_minutes}
                unassigned_cost={insightsData.unassigned_stats.unassigned_cost}
                total_count={insightsData.unassigned_stats.total_count}
              />
            )}
            {insightsData.four_axes && <FourAxesInsight data={insightsData.four_axes} />}
            {insightsData.metrics_by_item && <MetricsByItem metrics={insightsData.metrics_by_item} />}
            {insightsData.period_comparison && <PeriodComparison {...insightsData.period_comparison} />}
            {insightsData.four_axes && (
              <FactSummary
                four_axes={insightsData.four_axes}
                period_comparison={insightsData.period_comparison || null}
              />
            )}
            <PhaseInsights data={insightsData.phaseInsights} />
            <GoalInsights data={insightsData.goalInsights} />
            <RulePanel />
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
