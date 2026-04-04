import React from "react";
import { Calendar } from "lucide-react";
import type { TimeRange } from "../types";

interface GlobalTimeRangeProps {
  globalRange: TimeRange;
  onGlobalRangeChange: (range: TimeRange) => void;
}

export function GlobalTimeRange({ globalRange, onGlobalRangeChange }: GlobalTimeRangeProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">全局时间范围</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onGlobalRangeChange("7days")}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all ${
            globalRange === "7days"
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          最近 7 天
        </button>
        <button
          onClick={() => onGlobalRangeChange("30days")}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all ${
            globalRange === "30days"
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          最近 30 天
        </button>
      </div>
    </section>
  );
}
