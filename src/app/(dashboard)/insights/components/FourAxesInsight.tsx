'use client';

import { Target, Calendar, TrendingUp, Clock } from 'lucide-react';

interface FourAxesData {
  action_vs_goal: Array<{
    item_id: string;
    item_title: string;
    record_count: number;
    total_duration_minutes: number;
    has_goal: boolean;
    goal_title: string | null;
    goal_progress: number | null;
    deficit: number | null;
    deficit_unit: string | null;
  }>;
  time_vs_plan: {
    total_plans: number;
    completed_plans: number;
    completion_rate: number;
    overdue_plans: number;
  };
  effort_vs_result: {
    total_records_with_duration: number;
    total_hours: number;
    records_with_result: number;
    result_rate: number;
  };
  recent_time_summary: {
    total_hours_7d: number;
    total_hours_30d: number;
    change_percent: number | null;
    top_item_title: string | null;
    top_item_hours: number | null;
  };
}

export default function FourAxesInsight({ data }: { data: FourAxesData }) {
  return (
    <div className="space-y-4">
      {/* 主轴1：行动vs目标 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-bold text-slate-700">行动 vs 目标</h3>
        </div>
        {data.action_vs_goal.length === 0 ? (
          <p className="text-xs text-slate-400">暂无活跃事项</p>
        ) : (
          <div className="space-y-2.5">
            {data.action_vs_goal.map(item => (
              <div key={item.item_id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{item.item_title}</span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{item.record_count}条</span>
                    {item.total_duration_minutes > 0 && (
                      <span>{(item.total_duration_minutes / 60).toFixed(1)}h</span>
                    )}
                  </div>
                </div>
                {item.has_goal && item.goal_progress !== null ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-slate-400">{item.goal_title || '目标'}</span>
                      <span className="text-[10px] font-semibold text-purple-600">{item.goal_progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className="bg-purple-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, item.goal_progress)}%` }}
                      />
                    </div>
                    {item.deficit !== null && item.deficit > 0 && (
                      <p className="text-[10px] text-amber-500 mt-1">
                        还差 {item.deficit.toLocaleString()}{item.deficit_unit || ''}
                      </p>
                    )}
                  </div>
                ) : item.has_goal ? (
                  <p className="text-[10px] text-slate-400">达标型目标</p>
                ) : (
                  <p className="text-[10px] text-slate-300">未设目标</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 主轴2：时间vs计划 + 主轴3：投入vs效果 并排 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 时间vs计划 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold text-slate-700">时间 vs 计划</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">计划完成率</span>
              <span className="text-lg font-bold text-blue-600">{data.time_vs_plan.completion_rate}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, data.time_vs_plan.completion_rate)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{data.time_vs_plan.completed_plans}/{data.time_vs_plan.total_plans} 已完成</span>
              {data.time_vs_plan.overdue_plans > 0 && (
                <span className="text-amber-500">{data.time_vs_plan.overdue_plans} 已过期</span>
              )}
            </div>
          </div>
        </div>

        {/* 投入vs效果 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-bold text-slate-700">投入 vs 效果</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">总投入</span>
              <span className="text-lg font-bold text-slate-800">{data.effort_vs_result.total_hours}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">有结果记录占比</span>
              <span className="text-lg font-bold text-green-600">{data.effort_vs_result.result_rate}%</span>
            </div>
            <p className="text-[10px] text-slate-400">
              {data.effort_vs_result.records_with_result} 条有明确结果 / {data.effort_vs_result.total_records_with_duration} 条有投入记录
            </p>
          </div>
        </div>
      </div>

      {/* 主轴4：近期时间分布 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-teal-500" />
          <h3 className="text-sm font-bold text-slate-700">近期时间分布</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-teal-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">近7天</p>
            <p className="text-lg font-bold text-teal-700">{data.recent_time_summary.total_hours_7d}h</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">近30天</p>
            <p className="text-lg font-bold text-slate-800">{data.recent_time_summary.total_hours_30d}h</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 mb-0.5">周环比</p>
            {data.recent_time_summary.change_percent !== null ? (
              <p className={`text-lg font-bold ${data.recent_time_summary.change_percent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {data.recent_time_summary.change_percent >= 0 ? '+' : ''}{data.recent_time_summary.change_percent}%
              </p>
            ) : (
              <p className="text-lg font-bold text-slate-400">-</p>
            )}
          </div>
        </div>
        {data.recent_time_summary.top_item_title && (
          <p className="text-[11px] text-slate-500 mt-2">
            最多时间：{data.recent_time_summary.top_item_title}（{data.recent_time_summary.top_item_hours}h）
          </p>
        )}
      </div>
    </div>
  );
}
