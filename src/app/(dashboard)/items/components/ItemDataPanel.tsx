'use client';

import { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DailyStat {
  date: string;
  record_count: number;
  total_duration_minutes: number;
  total_cost: number;
  metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
}

interface ItemDataPanelProps {
  dailyStats: DailyStat[];
}

/** 基础数据看板：无目标也能看趋势 */
export default function ItemDataPanel({ dailyStats }: ItemDataPanelProps) {
  const analysis = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) return null;

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    // 近7天数据
    const last7 = dailyStats.filter(d => d.date > sevenDaysAgoStr);
    // 前7天数据（用于对比）
    const prev7 = dailyStats.filter(d => d.date > fourteenDaysAgoStr && d.date <= sevenDaysAgoStr);

    const sumField = (arr: DailyStat[], field: 'record_count' | 'total_duration_minutes' | 'total_cost') =>
      arr.reduce((s, d) => s + d[field], 0);

    const last7Count = sumField(last7, 'record_count');
    const prev7Count = sumField(prev7, 'record_count');
    const last7Duration = sumField(last7, 'total_duration_minutes');
    const prev7Duration = sumField(prev7, 'total_duration_minutes');

    // 计算近7天的 metric 聚合
    const metricMap7 = new Map<string, { total: number; unit: string }>();
    for (const d of last7) {
      for (const m of d.metrics) {
        const existing = metricMap7.get(m.metric_name);
        if (existing) { existing.total += m.total_value; }
        else { metricMap7.set(m.metric_name, { total: m.total_value, unit: m.metric_unit }); }
      }
    }

    // 前7天的 metric 聚合
    const metricMapPrev = new Map<string, number>();
    for (const d of prev7) {
      for (const m of d.metrics) {
        metricMapPrev.set(m.metric_name, (metricMapPrev.get(m.metric_name) || 0) + m.total_value);
      }
    }

    const countChange = prev7Count > 0 ? ((last7Count - prev7Count) / prev7Count * 100) : (last7Count > 0 ? 100 : 0);
    const durationChange = prev7Duration > 0 ? ((last7Duration - prev7Duration) / prev7Duration * 100) : (last7Duration > 0 ? 100 : 0);

    // 近7天的活跃天数
    const activeDays = last7.filter(d => d.record_count > 0).length;
    const avgPerDay = activeDays > 0 ? (last7Count / activeDays).toFixed(1) : '0';

    return {
      last7Count,
      last7Duration,
      countChange,
      durationChange,
      activeDays,
      avgPerDay,
      metrics: Array.from(metricMap7.entries()).map(([name, { total, unit }]) => ({
        name,
        total,
        unit,
        prevTotal: metricMapPrev.get(name) || 0,
      })),
      // 简化柱状图数据（近14天）
      bars: dailyStats.slice(-14).map(d => ({
        date: d.date.slice(5), // MM-DD
        count: d.record_count,
        duration: d.total_duration_minutes,
      })),
    };
  }, [dailyStats]);

  if (!analysis) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">近30天暂无数据</p>
      </div>
    );
  }

  const maxCount = Math.max(...analysis.bars.map(b => b.count), 1);

  return (
    <div className="space-y-4">
      {/* 概览卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">近7天记录</p>
          <p className="text-lg font-bold text-slate-800">{analysis.last7Count}</p>
          <ChangeIndicator value={analysis.countChange} />
        </div>
        <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">近7天时长</p>
          <p className="text-lg font-bold text-slate-800">{(analysis.last7Duration / 60).toFixed(1)}h</p>
          <ChangeIndicator value={analysis.durationChange} />
        </div>
        <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">日均记录</p>
          <p className="text-lg font-bold text-slate-800">{analysis.avgPerDay}</p>
          <p className="text-[10px] text-slate-400">{analysis.activeDays}/7 天活跃</p>
        </div>
      </div>

      {/* metric 聚合 */}
      {analysis.metrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {analysis.metrics.map(m => {
            const change = m.prevTotal > 0 ? ((m.total - m.prevTotal) / m.prevTotal * 100) : (m.total > 0 ? 100 : 0);
            return (
              <div key={m.name} className="rounded-xl bg-purple-50/80 px-3 py-2 flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-sm font-semibold text-purple-700">{m.total.toLocaleString()}{m.unit}</span>
                <span className="text-[10px] text-slate-500">{m.name}</span>
                <ChangeIndicator value={change} />
              </div>
            );
          })}
        </div>
      )}

      {/* 简化柱状图 */}
      {analysis.bars.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 mb-2">近14天记录数</p>
          <div className="flex items-end gap-1 h-16">
            {analysis.bars.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t bg-indigo-400/70 min-h-[2px] transition-all"
                  style={{ height: `${Math.max((bar.count / maxCount) * 56, 2)}px` }}
                  title={`${bar.date}: ${bar.count}条`}
                />
                {i % 2 === 0 && <span className="text-[8px] text-slate-300">{bar.date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeIndicator({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
        <Minus className="h-2.5 w-2.5" />0%
      </span>
    );
  }
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${isUp ? 'text-emerald-500' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {isUp ? '+' : ''}{value.toFixed(0)}%
    </span>
  );
}
