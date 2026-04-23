'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, TrendingUp, Link2 } from 'lucide-react';
import type { InsightsData, GoalStatus } from '@/types/teto';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// 目标状态中文映射（直接使用中文值）
const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  '进行中': '进行中',
  '已达成': '已达成',
  '已放弃': '已放弃',
  '已暂停': '已暂停',
};

// 目标状态颜色映射
const GOAL_STATUS_COLORS: Record<GoalStatus, string> = {
  '进行中': 'bg-blue-500',
  '已达成': 'bg-emerald-500',
  '已放弃': 'bg-gray-500',
  '已暂停': 'bg-yellow-500',
};

interface GoalInsightsProps {
  data: InsightsData['goalInsights'];
}

export default function GoalInsights({ data }: GoalInsightsProps) {
  if (!data) return null;

  const { totalGoals, statusDistribution, goalsWithAssociations } = data;

  return (
    <div className="space-y-5">
      {/* Section title */}
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Target className="h-4 w-4 text-rose-500" />
        目标洞察
      </h2>

      {/* Total goals card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalGoals}</p>
              <p className="text-xs text-slate-500">目标总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {goalsWithAssociations.length}
              </p>
              <p className="text-xs text-slate-500">有关联的目标</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status distribution pie chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3">目标状态分布</h3>
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
                  `${GOAL_STATUS_LABELS[name as GoalStatus] ?? name} ${((percent ?? 0) * 100).toFixed(0)}%`
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
                  GOAL_STATUS_LABELS[name as GoalStatus] ?? name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-sm text-slate-400 py-8">暂无目标数据</p>
        )}
      </div>

      {/* Goals with associations */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-indigo-500" />
          目标关联统计
        </h3>
        {goalsWithAssociations.length > 0 ? (
          <div className="space-y-2">
            {goalsWithAssociations.map((goal) => (
              <div
                key={goal.goal_id}
                className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2"
              >
                <span className="text-sm text-slate-800 truncate flex-1 mr-2">
                  {goal.goal_title}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {goal.item_count > 0 && (
                    <span className="text-xs bg-white px-2 py-0.5 rounded text-indigo-600">
                      {goal.item_count} 事项
                    </span>
                  )}
                  {goal.record_count > 0 && (
                    <span className="text-xs bg-white px-2 py-0.5 rounded text-indigo-600">
                      {goal.record_count} 记录
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">暂无关联数据</p>
        )}
      </div>
    </div>
  );
}
