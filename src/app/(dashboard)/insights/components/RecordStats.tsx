'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { FileText, TrendingUp } from 'lucide-react';
import type { InsightsData } from '@/types/teto';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f97316', '#6366f1'];

interface RecordStatsProps {
  data: InsightsData['record_overview'];
}

function NumberCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function RecordStats({ data }: RecordStatsProps) {
  const { total_7d, total_30d, daily_counts, type_distribution, tag_distribution } = data;

  // Format date labels for daily chart
  const dailyChartData = daily_counts.map((d) => ({
    ...d,
    date: d.date.slice(5), // MM-DD
  }));

  return (
    <div className="space-y-5">
      {/* Section title */}
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-500" />
        记录维度统计
      </h2>

      {/* Number cards */}
      <div className="grid grid-cols-2 gap-3">
        <NumberCard icon={TrendingUp} label="近 7 天记录数" value={total_7d} color="bg-blue-500" />
        <NumberCard icon={TrendingUp} label="近 30 天记录数" value={total_30d} color="bg-indigo-500" />
      </div>

      {/* Daily counts bar chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3">每日记录数</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyChartData}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Type distribution pie chart + Tag distribution bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Type distribution pie chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700 mb-3">按类型分布</h3>
          {type_distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={type_distribution}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: any) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {type_distribution.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-slate-400 py-10">暂无数据</p>
          )}
        </div>

        {/* Tag distribution horizontal bar chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700 mb-3">按标签分布</h3>
          {tag_distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tag_distribution} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="tag_name" type="category" width={60} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-slate-400 py-10">暂无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
