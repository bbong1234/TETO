'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Layers, Clock, GitBranch } from 'lucide-react';
import type { InsightsData, PhaseStatus } from '@/types/teto';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// 阶段状态中文映射（直接使用中文值）
const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  '进行中': '进行中',
  '已结束': '已结束',
  '停滞': '停滞',
};

// 阶段状态颜色映射
const PHASE_STATUS_COLORS: Record<PhaseStatus, string> = {
  '进行中': 'bg-blue-500',
  '已结束': 'bg-slate-400',
  '停滞': 'bg-orange-500',
};

interface PhaseInsightsProps {
  data: InsightsData['phaseInsights'];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function PhaseInsights({ data }: PhaseInsightsProps) {
  if (!data) return null;

  const { recentPhases, statusDistribution, itemsWithPhaseChanges } = data;

  return (
    <div className="space-y-5">
      {/* Section title */}
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-500" />
        阶段洞察
      </h2>

      {/* Status distribution pie chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3">阶段状态分布</h3>
        {statusDistribution.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusDistribution}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={({ name, percent }: any) =>
                  `${PHASE_STATUS_LABELS[name as PhaseStatus] ?? name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {statusDistribution.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [
                  value,
                  PHASE_STATUS_LABELS[name as PhaseStatus] ?? name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-sm text-slate-400 py-8">暂无阶段数据</p>
        )}
      </div>

      {/* Recent phases list */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-blue-500" />
          最近创建的阶段
        </h3>
        {recentPhases.length > 0 ? (
          <div className="space-y-2">
            {recentPhases.map((phase) => (
              <div
                key={phase.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex-shrink-0 w-2 h-2 rounded-full ${
                      PHASE_STATUS_COLORS[phase.status]
                    }`}
                  />
                  <span className="text-sm text-slate-800 truncate">{phase.title}</span>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {formatDate(phase.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">暂无阶段</p>
        )}
      </div>

      {/* Items with phase changes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-emerald-500" />
          近期阶段变化活跃的事项
        </h3>
        {itemsWithPhaseChanges.length > 0 ? (
          <div className="space-y-2">
            {itemsWithPhaseChanges.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2"
              >
                <span className="text-sm text-slate-800">{item.item_title}</span>
                <span className="text-xs font-medium text-emerald-600">
                  {item.phase_count} 个新阶段
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">近期无阶段变化</p>
        )}
      </div>
    </div>
  );
}
