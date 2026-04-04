import React from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TimeRange, RecordTrendData } from "../types";

interface RecordTrendSectionProps {
  isLoading: boolean;
  dailyRecordRange: TimeRange;
  recordTrend: Record<TimeRange, RecordTrendData[]>;
  collapsed: boolean;
  onToggle: () => void;
  onRangeChange: (range: TimeRange) => void;
}

export function RecordTrendSection({ 
  isLoading, 
  dailyRecordRange, 
  recordTrend, 
  collapsed, 
  onToggle, 
  onRangeChange 
}: RecordTrendSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">Daily Record 填写趋势</h2>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {/* Daily Record 独立时间切换 */}
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => onRangeChange("7days")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                dailyRecordRange === "7days"
                  ? "bg-slate-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              7天
            </button>
            <button
              onClick={() => onRangeChange("30days")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                dailyRecordRange === "30days"
                  ? "bg-slate-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              30天
            </button>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : !recordTrend[dailyRecordRange] || recordTrend[dailyRecordRange].length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-600">暂无数据</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recordTrend[dailyRecordRange]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(value) => value === 1 ? '已填写' : '未填写'} stroke="#64748b" />
                  <Tooltip 
                    formatter={(value) => [value === 1 ? '已填写' : '未填写', '状态']}
                    labelFormatter={(label) => `日期: ${label}`}
                  />
                  <Bar dataKey="hasRecord" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
