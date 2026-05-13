'use client';

import { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { SubItem } from '@/types/teto';
import { tokens } from '@/design/loader';

interface DailyStat {
  date: string;
  sub_item_id: string | null;
  record_count: number;
  total_duration_minutes: number;
  total_cost: number;
  metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
}

interface ItemDataPanelProps {
  dailyStats: DailyStat[];
  subItems?: SubItem[];
  activeSubItemId?: string | null;
}

// 子项配色（从设计令牌 chart.series 读取）
const SUB_ITEM_COLORS = tokens.chart.series.map((line, i) => {
  const tailwindColors = ['indigo', 'emerald', 'amber', 'purple', 'rose', 'cyan'] as const;
  return {
    bg: `bg-${tailwindColors[i]}-400` as string,
    line,
    label: `text-${tailwindColors[i]}-600` as string,
  };
});

const DEFAULT_LINE_COLOR = tokens.chart.series[0];

/** 基础数据看板：无目标也能看趋势 */
export default function ItemDataPanel({ dailyStats, subItems = [], activeSubItemId }: ItemDataPanelProps) {
  // 按 activeSubItemId 过滤 dailyStats
  const filteredStats = useMemo(() => {
    if (!activeSubItemId || activeSubItemId === '__orphan__') return dailyStats;
    return dailyStats.filter(d => d.sub_item_id === activeSubItemId);
  }, [dailyStats, activeSubItemId]);

  // 子项 ID → 颜色索引
  const subItemColorMap = useMemo(() => {
    const map = new Map<string, number>();
    subItems.forEach((sub, i) => map.set(sub.id, i % SUB_ITEM_COLORS.length));
    return map;
  }, [subItems]);

  // 生成近7天连续日期（无论是否有数据）
  const last7Days = useMemo(() => {
    const days: Array<{ date: string; label: string }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: dateStr, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return days;
  }, []);

  const analysis = useMemo(() => {
    if (!filteredStats || filteredStats.length === 0) {
      // 即使没有数据也返回基础结构（图表显示全0）
      return {
        last7Count: 0,
        last7Duration: 0,
        countChange: 0,
        durationChange: 0,
        activeDays: 0,
        avgPerDay: '0',
        metrics: [] as Array<{ name: string; total: number; unit: string; prevTotal: number }>,
        chartMetric: null as { name: string; total: number; unit: string } | null,
        // 主度量概览数据
        metric7d: 0,
        metric7dPrev: 0,
        metric7dAvg: '0',
        metric7dChange: 0,
        chartData: last7Days.map(day => ({ date: day.label, total: 0 })),
        hasSubItems: false,
      };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    // 近7天 / 前7天（聚合日期维度，忽略 sub_item_id 分组做汇总）
    const last7 = filteredStats.filter(d => d.date > sevenDaysAgoStr);
    const prev7 = filteredStats.filter(d => d.date > fourteenDaysAgoStr && d.date <= sevenDaysAgoStr);

    // 去重日期求和（同一日期可能有多个 sub_item_id 行）
    const sumByDateField = (arr: DailyStat[], field: 'record_count' | 'total_duration_minutes' | 'total_cost') => {
      const byDate = new Map<string, number>();
      for (const d of arr) byDate.set(d.date, (byDate.get(d.date) || 0) + d[field]);
      return Array.from(byDate.values()).reduce((s, v) => s + v, 0);
    };

    const last7Count = sumByDateField(last7, 'record_count');
    const prev7Count = sumByDateField(prev7, 'record_count');
    const last7Duration = sumByDateField(last7, 'total_duration_minutes');
    const prev7Duration = sumByDateField(prev7, 'total_duration_minutes');

    // 近7天 metric 聚合
    const metricMap7 = new Map<string, { total: number; unit: string }>();
    for (const d of last7) {
      for (const m of d.metrics) {
        const existing = metricMap7.get(m.metric_name);
        if (existing) { existing.total += m.total_value; }
        else { metricMap7.set(m.metric_name, { total: m.total_value, unit: m.metric_unit }); }
      }
    }

    // 前7天 metric 聚合
    const metricMapPrev = new Map<string, number>();
    for (const d of prev7) {
      for (const m of d.metrics) {
        metricMapPrev.set(m.metric_name, (metricMapPrev.get(m.metric_name) || 0) + m.total_value);
      }
    }

    const countChange = prev7Count > 0 ? ((last7Count - prev7Count) / prev7Count * 100) : (last7Count > 0 ? 100 : 0);
    const durationChange = prev7Duration > 0 ? ((last7Duration - prev7Duration) / prev7Duration * 100) : (last7Duration > 0 ? 100 : 0);

    // 活跃天数（去重日期）
    const activeDates7 = new Set(last7.filter(d => d.record_count > 0).map(d => d.date));
    const activeDays = activeDates7.size;
    const avgPerDay = activeDays > 0 ? (last7Count / activeDays).toFixed(1) : '0';

    // 确定图表主 metric：优先取近7天总量最大的 metric_name
    const chartMetric = (() => {
      let best = { name: '', total: 0, unit: '' };
      for (const [name, { total, unit }] of metricMap7) {
        if (total > best.total) best = { name, total, unit };
      }
      return best.name ? best : null;
    })();

    // 主度量概览数据
    const metric7d = chartMetric ? (metricMap7.get(chartMetric.name)?.total ?? 0) : 0;
    const metric7dPrev = chartMetric ? (metricMapPrev.get(chartMetric.name) ?? 0) : 0;
    const metric7dAvg = activeDays > 0 && chartMetric ? (metric7d / activeDays).toFixed(1) : '0';
    const metric7dChange = metric7dPrev > 0 ? ((metric7d - metric7dPrev) / metric7dPrev * 100) : (metric7d > 0 ? 100 : 0);

    // 是否展示子项分组折线
    const hasSubItems = subItems.length > 0 && !activeSubItemId;

    // 构建折线图数据：近7天连续日期
    const chartData = last7Days.map(day => {
      const dayRows = filteredStats.filter(d => d.date === day.date);
      const entry: { [key: string]: string | number } = { date: day.label };

      if (chartMetric) {
        if (hasSubItems) {
          let total = 0;
          for (const sub of subItems) {
            const subVal = dayRows
              .filter(r => r.sub_item_id === sub.id)
              .reduce((s, r) => s + (r.metrics.find(m => m.metric_name === chartMetric.name)?.total_value || 0), 0);
            entry[sub.id] = subVal;
            total += subVal;
          }
          const unassignedVal = dayRows
            .filter(r => !r.sub_item_id)
            .reduce((s, r) => s + (r.metrics.find(m => m.metric_name === chartMetric.name)?.total_value || 0), 0);
          entry['__unassigned__'] = unassignedVal;
          total += unassignedVal;
          entry['total'] = total;
        } else {
          const total = dayRows.reduce((s, r) => s + (r.metrics.find(m => m.metric_name === chartMetric.name)?.total_value || 0), 0);
          entry['total'] = total;
        }
      } else {
        if (hasSubItems) {
          let total = 0;
          for (const sub of subItems) {
            const subVal = dayRows.filter(r => r.sub_item_id === sub.id).reduce((s, r) => s + r.record_count, 0);
            entry[sub.id] = subVal;
            total += subVal;
          }
          const unassignedVal = dayRows.filter(r => !r.sub_item_id).reduce((s, r) => s + r.record_count, 0);
          entry['__unassigned__'] = unassignedVal;
          total += unassignedVal;
          entry['total'] = total;
        } else {
          const total = dayRows.reduce((s, r) => s + r.record_count, 0);
          entry['total'] = total;
        }
      }

      return entry;
    });

    return {
      last7Count,
      last7Duration,
      countChange,
      durationChange,
      activeDays,
      avgPerDay,
      metrics: Array.from(metricMap7.entries()).map(([name, { total, unit }]) => ({
        name, total, unit, prevTotal: metricMapPrev.get(name) || 0,
      })),
      chartMetric,
      metric7d,
      metric7dPrev,
      metric7dAvg,
      metric7dChange,
      chartData,
      hasSubItems,
    };
  }, [filteredStats, subItemColorMap, last7Days, subItems, activeSubItemId]);

  return (
    <div className="space-y-4">
      {/* 概览卡片：有度量值时优先显示度量，否则显示记录数/时长 */}
      {analysis.chartMetric ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">近7天{analysis.chartMetric.name}</p>
            <p className="text-lg font-bold text-slate-800">{fmtPanelNum(analysis.metric7d)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">{analysis.chartMetric.unit}</span></p>
            <ChangeIndicator value={analysis.metric7dChange} />
          </div>
          <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">日均{analysis.chartMetric.name}</p>
            <p className="text-lg font-bold text-slate-800">{analysis.metric7dAvg}<span className="text-[10px] font-normal text-slate-400 ml-0.5">{analysis.chartMetric.unit}</span></p>
            <p className="text-[10px] text-slate-400">{analysis.activeDays}/7 天活跃</p>
          </div>
          <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">近7天记录</p>
            <p className="text-lg font-bold text-slate-800">{analysis.last7Count}</p>
            <ChangeIndicator value={analysis.countChange} />
          </div>
        </div>
      ) : (
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
      )}

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

      {/* 近7天折线图 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-400">
            近7天{analysis.chartMetric ? `${analysis.chartMetric.name}值` : '记录数'}
          </p>
          {/* 图例：仅全部视图下有子项时显示 */}
          {analysis.hasSubItems && (
            <div className="flex items-center gap-2">
              {subItems.map((sub, i) => (
                <span key={sub.id} className="flex items-center gap-0.5 text-[9px] text-slate-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SUB_ITEM_COLORS[i % SUB_ITEM_COLORS.length].line }} />
                  {sub.title}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analysis.chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.chart.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: tokens.chart.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: tokens.chart.tick }} axisLine={false} tickLine={false} width={35} allowDecimals={false} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${tokens.chart.tooltipBorder}`, background: 'rgba(255,255,255,0.95)' }}
              />
              {analysis.hasSubItems ? (
                <>
                  {subItems.map((sub, i) => (
                    <Line
                      key={sub.id}
                      type="monotone"
                      dataKey={sub.id}
                      stroke={SUB_ITEM_COLORS[i % SUB_ITEM_COLORS.length].line}
                      strokeWidth={2}
                      dot={{ r: 3, fill: SUB_ITEM_COLORS[i % SUB_ITEM_COLORS.length].line }}
                      activeDot={{ r: 4 }}
                      name={sub.title}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="__unassigned__"
                    stroke={tokens.chart.tick}
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={{ r: 3, fill: tokens.chart.tick }}
                    activeDot={{ r: 4 }}
                    name="未归类"
                  />
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={DEFAULT_LINE_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3, fill: DEFAULT_LINE_COLOR }}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
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

function fmtPanelNum(n: number): string {
  if (n % 1 !== 0) return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return n.toLocaleString('zh-CN');
}
