import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DiaryReviewFormValues } from "@/types/diary-review";
import { STATUS_OPTIONS, EMOTION_OPTIONS } from "@/constants/review-options";

interface StatusSectionProps {
  formData: DiaryReviewFormValues;
  collapsed: boolean;
  onToggle: () => void;
  onFieldChange: (field: keyof DiaryReviewFormValues, value: string | number | null) => void;
}

export function StatusSection({ 
  formData, 
  collapsed, 
  onToggle, 
  onFieldChange 
}: StatusSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">状态评估</h2>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                完成度（0-100）
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.completion_rate ?? ""}
                onChange={(e) =>
                  onFieldChange(
                    "completion_rate",
                    e.target.value === "" ? null : parseInt(e.target.value, 10)
                  )
                }
                placeholder="0-100"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                今日状态
              </label>
              <select
                value={formData.status_label}
                onChange={(e) => onFieldChange("status_label", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              >
                <option value="">请选择</option>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                今日情绪
              </label>
              <select
                value={formData.emotion_label}
                onChange={(e) => onFieldChange("emotion_label", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              >
                <option value="">请选择</option>
                {EMOTION_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
