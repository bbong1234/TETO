import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DiaryReviewFormValues } from "@/types/diary-review";

interface SummarySectionProps {
  formData: DiaryReviewFormValues;
  collapsed: boolean;
  onToggle: () => void;
  onFieldChange: (field: keyof DiaryReviewFormValues, value: string) => void;
}

export function SummarySection({ 
  formData, 
  collapsed, 
  onToggle, 
  onFieldChange 
}: SummarySectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">总结与计划</h2>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                今天最重要的推进
              </label>
              <input
                type="text"
                value={formData.biggest_progress}
                onChange={(e) => onFieldChange("biggest_progress", e.target.value)}
                placeholder="一句话写今天最重要推进"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                今天最大的问题
              </label>
              <input
                type="text"
                value={formData.biggest_problem}
                onChange={(e) => onFieldChange("biggest_problem", e.target.value)}
                placeholder="一句话写今天最大问题"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                明日计划
              </label>
              <textarea
                rows={4}
                value={formData.tomorrow_plan}
                onChange={(e) => onFieldChange("tomorrow_plan", e.target.value)}
                placeholder="写明天想做什么"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
