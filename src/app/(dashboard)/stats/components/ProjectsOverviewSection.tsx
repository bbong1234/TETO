import React from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { Project } from "@/types/projects";

interface ProjectsOverviewSectionProps {
  isLoading: boolean;
  projects: Project[];
  totalProjects: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function ProjectsOverviewSection({ 
  isLoading, 
  projects, 
  totalProjects, 
  collapsed, 
  onToggle 
}: ProjectsOverviewSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center justify-between flex-1">
          <h2 className="text-lg font-semibold text-slate-800">项目概览</h2>
          <span className="text-sm text-slate-500">
            共 {totalProjects} 个项目
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400 ml-3" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400 ml-3" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600">暂无项目</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => {
                const percent = project.target_total > 0 ? ((project.current_progress / project.target_total) * 100).toFixed(0) : '0';
                return (
                  <div key={project.id} className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-900">{project.name}</p>
                        <span className="text-sm text-slate-500">{percent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {project.current_progress} / {project.target_total} {project.unit}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
