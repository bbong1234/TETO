'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, RefreshCw, Download } from 'lucide-react';
import DateRangeSelector from './components/DateRangeSelector';
import TodayTimelinePanel from './components/TodayTimelinePanel';
import YesterdayTimelinePanel from './components/YesterdayTimelinePanel';
import ActivityHeatmapPanel from './components/ActivityHeatmapPanel';
import InsightSummaryPanel from './components/InsightSummaryPanel';
import ItemActivityPanel from './components/ItemActivityPanel';
import GoalProgressPanel from './components/GoalProgressPanel';
import TimeDistributionPanel from './components/TimeDistributionPanel';
import PeriodComparisonPanel from './components/PeriodComparisonPanel';
import DataReviewPanel from './components/DataReviewPanel';
import FactSourcePanel from './components/FactSourcePanel';
import CorrectionsTrendsPanel from './components/CorrectionsTrendsPanel';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { useInsights } from './useInsights';

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
    date_from = date_to;
  }

  return { date_from, date_to };
}

export default function InsightsClient() {
  const [preset, setPreset] = useState<DatePreset>('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { toasts, showError, dismissToast } = useToast();

  const onLoadError = useCallback(() => {
    showError('加载洞察数据失败');
  }, [showError]);

  const { data: insightsData, loading, error, refetch } = useInsights(dateFrom, dateTo, {
    onLoadError,
  });

  // Initialize dates
  useEffect(() => {
    const range = getDateRange(preset);
    setDateFrom(range.date_from);
    setDateTo(range.date_to);
  }, []);

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
      <div className="flex-shrink-0 flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h1 className="text-xl font-bold text-slate-900">洞察</h1>
        </div>
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
              onClick={() => void refetch()}
              className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <RefreshCw className="h-3 w-3" />
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && insightsData && (
          <>
            {/* 1. 今日时间线 */}
            <TodayTimelinePanel data={insightsData.recent_timeline.today} />

            {/* 2. 昨日时间线 */}
            <YesterdayTimelinePanel data={insightsData.recent_timeline.yesterday} />

            {/* 3. 活跃热力图 */}
            <ActivityHeatmapPanel days={insightsData.activity_heatmap.days} />

            {/* 4. 本期摘要 */}
            <InsightSummaryPanel facts={insightsData.summary.headline_facts} />

            {/* 5. 日期范围选择器 */}
            <DateRangeSelector
              preset={preset}
              dateFrom={dateFrom}
              dateTo={dateTo}
              rangeLabel={insightsData.range.label}
              onPresetChange={handlePresetChange}
              onCustomDateChange={handleCustomDateChange}
            />

            {/* 6. 事项活动 */}
            <ItemActivityPanel
              active_items={insightsData.items.active_items}
              time_ranking={insightsData.items.time_ranking}
              stagnant_items={insightsData.items.stagnant_items}
            />

            {/* 7. 目标进度 */}
            <GoalProgressPanel progress={insightsData.goals.progress} />

            {/* 8. 时间分布 */}
            <TimeDistributionPanel data={insightsData.time_distribution} />

            {/* 9. 周期对比 */}
            <PeriodComparisonPanel changes={insightsData.comparison.changes} />

            {/* 10. 数据待整理 */}
            <DataReviewPanel data={insightsData.data_review} />

            {/* 11. 事实来源 & AI 润色 */}
            <FactSourcePanel facts={insightsData.facts} />
            {/* 12. 纠错趋势 */}
            <CorrectionsTrendsPanel />
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
