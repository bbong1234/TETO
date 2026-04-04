import React from "react";
import { ChevronDown, ChevronUp, Target, Clock, CheckCircle, Loader2 } from "lucide-react";
import type { Project } from "@/types/projects";

interface ProjectStatsSectionProps {
  isLoading: boolean;
  projects: Project[];
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function ProjectStatsSection({ 
  isLoading, 
  projects, 
  totalProjects, 
  activeProjects, 
  completedProjects, 
  collapsed, 
  onToggle 
}: ProjectStatsSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">项目统计</h2>
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
                  <p className="text-sm text-slate-500">总项目数</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {totalProjects}
                  </p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">进行中项目</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {activeProjects}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">已完成项目</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {completedProjects}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
