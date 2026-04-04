import React from "react";
import { CheckCircle, Clock, Target, ChevronDown, ChevronUp } from "lucide-react";

interface StatsCardsProps {
  todayRecord: boolean;
  todayReview: boolean;
  activeProjectsCount: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function StatsCards({ 
  todayRecord, 
  todayReview, 
  activeProjectsCount, 
  collapsed, 
  onToggle 
}: StatsCardsProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">今日状态</h2>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">今日记录</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {todayRecord ? "已填写" : "待填写"}
                  </p>
                </div>
                {todayRecord ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : (
                  <Clock className="h-8 w-8 text-orange-500" />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">今日复盘</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {todayReview ? "已填写" : "待填写"}
                  </p>
                </div>
                {todayReview ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : (
                  <Clock className="h-8 w-8 text-orange-500" />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">进行中项目</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {activeProjectsCount}
                  </p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
