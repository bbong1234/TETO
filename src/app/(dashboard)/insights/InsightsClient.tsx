'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { BarChart3, RefreshCw, Download, Loader2 } from 'lucide-react';
import DateRangeSelector from './components/DateRangeSelector';
import TodayTimelinePanel from './components/TodayTimelinePanel';
import YesterdayTimelinePanel from './components/YesterdayTimelinePanel';
import ActivityHeatmapPanel from './components/ActivityHeatmapPanel';
import InsightSummaryPanel from './components/InsightSummaryPanel';
import ItemActivityPanel from './components/ItemActivityPanel';
import GoalProgressPanel from './components/GoalProgressPanel';
import PredictionPanel from './components/PredictionPanel';
import MoodEnergyTrendPanel from './components/MoodEnergyTrendPanel';
import ExpenseSummaryPanel from './components/ExpenseSummaryPanel';
import FunctionTagInsightsPanel from './components/FunctionTagInsightsPanel';
import TodayActivityStats from '../records/components/TodayActivityStats';
import type { Item, Record as TetoRecord } from '@/types/teto';
import TimeDistributionPanel from './components/TimeDistributionPanel';
import PeriodComparisonPanel from './components/PeriodComparisonPanel';
import DataReviewPanel from './components/DataReviewPanel';
import FactSourcePanel from './components/FactSourcePanel';
import CorrectionsTrendsPanel from './components/CorrectionsTrendsPanel';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { useInsights } from './useInsights';
import { InsightsPageSkeleton } from '@/components/ui/PageSkeletons';
import type { InsightMetricId, InsightsData } from '@/types/teto';

type DatePreset = '7d' | '30d' | 'month' | 'custom';

const FAST_METRICS: InsightMetricId[] = ['recent_timeline', 'activity_heatmap'];
const SLOW_METRICS: InsightMetricId[] = [
  'summary',
  'items',
  'goals',
  'time_distribution',
  'comparison',
  'data_review',
  'mood_energy',
  'expense',
];

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

function mergeInsights(fast: InsightsData, slow: InsightsData | null): InsightsData {
  if (!slow) return fast;
  return {
    ...fast,
    summary: slow.summary,
    range: slow.range,
    items: slow.items,
    goals: slow.goals,
    time_distribution: slow.time_distribution,
    comparison: slow.comparison,
    data_review: slow.data_review,
    facts: slow.facts,
    mood_energy: slow.mood_energy,
    expense: slow.expense,
  };
}

function DeferredSectionSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 flex items-center gap-2 text-sm text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </div>
  );
}

function TodayActivityStatsSection({ date }: { date: string }) {
  const [records, setRecords] = useState<TetoRecord[]>([]);
  const [currentActivity, setCurrentActivity] = useState<TetoRecord | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v2/records/bootstrap?date=${date}&limit=200`);
        const data = await res.json();
        if (cancelled) return;
        setRecords(data.data?.records ?? []);
        setItems(data.data?.items ?? []);
        setCurrentActivity(data.data?.current_activity ?? null);
      } catch {
        if (!cancelled) {
          setRecords([]);
          setItems([]);
          setCurrentActivity(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (loading) return <DeferredSectionSkeleton label="正在加载今日统计…" />;

  return (
    <TodayActivityStats
      records={records}
      date={date}
      currentActivity={currentActivity}
      items={items}
    />
  );
}

export default function InsightsClient() {
  const initialRange = getDateRange('7d');
  const [preset, setPreset] = useState<DatePreset>('7d');
  const [dateFrom, setDateFrom] = useState(initialRange.date_from);
  const [dateTo, setDateTo] = useState(initialRange.date_to);
  const { toasts, showError, dismissToast } = useToast();

  const onLoadError = useCallback(() => {
    showError('加载洞察数据失败');
  }, [showError]);

  const {
    data: fastData,
    loading: fastLoading,
    error: fastError,
    refetch: refetchFast,
  } = useInsights(dateFrom, dateTo, { metrics: FAST_METRICS, onLoadError });

  const {
    data: slowData,
    loading: slowLoading,
    error: slowError,
    refetch: refetchSlow,
  } = useInsights(dateFrom, dateTo, { metrics: SLOW_METRICS, onLoadError });

  const insightsData = useMemo(
    () => (fastData ? mergeInsights(fastData, slowData) : null),
    [fastData, slowData]
  );

  const loading = fastLoading;
  const error = fastError || slowError;
  const refetch = useCallback(() => {
    void refetchFast();
    void refetchSlow();
  }, [refetchFast, refetchSlow]);

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

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isTodayRange = dateFrom === dateTo && dateFrom === todayStr;

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 lg:p-6">
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

      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
        {loading && <InsightsPageSkeleton />}

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
            <TodayTimelinePanel data={insightsData.recent_timeline.today} />
            {isTodayRange && <TodayActivityStatsSection date={todayStr} />}
            <YesterdayTimelinePanel data={insightsData.recent_timeline.yesterday} />
            <ActivityHeatmapPanel days={insightsData.activity_heatmap.days} />

            {slowLoading ? (
              <DeferredSectionSkeleton label="正在加载摘要与统计..." />
            ) : (
              <>
                <InsightSummaryPanel facts={insightsData.summary.headline_facts} />

                <DateRangeSelector
                  preset={preset}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  rangeLabel={insightsData.range.label}
                  onPresetChange={handlePresetChange}
                  onCustomDateChange={handleCustomDateChange}
                />

                <ItemActivityPanel
                  active_items={insightsData.items.active_items}
                  time_ranking={insightsData.items.time_ranking}
                  stagnant_items={insightsData.items.stagnant_items}
                />

                <GoalProgressPanel progress={insightsData.goals.progress} />
                <PredictionPanel progress={insightsData.goals.progress} />
                <MoodEnergyTrendPanel data={insightsData.mood_energy} />
                <ExpenseSummaryPanel data={insightsData.expense} />

                {/* 职能标签跨项目时间汇总 */}
                {dateFrom && dateTo && (
                  <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">职能动作分布</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-500">跨项目</span>
                    </div>
                    <FunctionTagInsightsPanel dateFrom={dateFrom} dateTo={dateTo} />
                  </section>
                )}

                <TimeDistributionPanel data={insightsData.time_distribution} />
                <PeriodComparisonPanel changes={insightsData.comparison.changes} />
                <DataReviewPanel data={insightsData.data_review} />
                <FactSourcePanel facts={insightsData.facts} />
              </>
            )}
          </>
        )}

        {/* 与主洞察并行加载，不阻塞首屏 */}
        <CorrectionsTrendsPanel />
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
