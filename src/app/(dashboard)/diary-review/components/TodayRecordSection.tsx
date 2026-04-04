import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DiaryReviewFormValues } from "@/types/diary-review";

interface TodayRecordSectionProps {
  formData: DiaryReviewFormValues;
  collapsed: boolean;
  onToggle: () => void;
  onFieldChange: (field: keyof DiaryReviewFormValues, value: string) => void;
}

export function TodayRecordSection({ 
  formData, 
  collapsed, 
  onToggle, 
  onFieldChange 
}: TodayRecordSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">今日记录</h2>
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
                今天做了什么
              </label>
              <textarea
                rows={5}
                value={formData.did_what}
                onChange={(e) => onFieldChange("did_what", e.target.value)}
                placeholder="用自然语言写今天实际做了什么"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                原本想做什么
              </label>
              <textarea
                rows={4}
                value={formData.planned_what}
                onChange={(e) => onFieldChange("planned_what", e.target.value)}
                placeholder="写原本计划完成的内容"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
