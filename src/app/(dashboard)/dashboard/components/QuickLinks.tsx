import React from "react";
import { FileText, BookOpen, Target, BarChart3, ArrowRight } from "lucide-react";

interface QuickLinksProps {
  // 快速链接组件不需要额外属性
}

export function QuickLinks({}: QuickLinksProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <a
        href="/daily-record"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">每日记录</p>
            <p className="text-sm text-slate-500">填写今日行为数据</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </a>

      <a
        href="/diary-review"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-3">
            <BookOpen className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">日记复盘</p>
            <p className="text-sm text-slate-500">结构化复盘输入</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </a>

      <a
        href="/projects"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-100 p-3">
            <Target className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">项目管理</p>
            <p className="text-sm text-slate-500">管理长期项目和进度</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </a>

      <a
        href="/stats"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-3">
            <BarChart3 className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">统计分析</p>
            <p className="text-sm text-slate-500">查看趋势和统计</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </a>
    </section>
  );
}
