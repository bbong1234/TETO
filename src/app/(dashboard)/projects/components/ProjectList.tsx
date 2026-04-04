import React from "react";
import { Edit, Trash2, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { Project } from "@/types/projects";
import { formatDateForDisplay } from "../utils/projectUtils";

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  collapsedProjects: Record<string, boolean>;
  onEditProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onViewProject: (projectId: string) => void;
  onToggleCollapse: (projectId: string) => void;
  deletingProjectId: string | null;
}

export function ProjectList({ 
  projects, 
  isLoading, 
  collapsedProjects, 
  onEditProject, 
  onDeleteProject, 
  onViewProject, 
  onToggleCollapse, 
  deletingProjectId 
}: ProjectListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        暂无项目，点击右上角"新建项目"开始创建
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const isCollapsed = collapsedProjects[project.id] || false;
        const progressPercentage = project.target_total > 0 
          ? (project.current_progress / project.target_total) * 100 
          : 0;

        return (
          <div key={project.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div 
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
              onClick={() => onToggleCollapse(project.id)}
            >
              <div className="flex items-center">
                <ArrowRight 
                  className={`h-5 w-5 mr-2 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                />
                <h3 className="text-lg font-medium">{project.name}</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProject(project.id);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  查看
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditProject(project);
                  }}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  className="text-red-600 hover:text-red-800"
                  disabled={deletingProjectId === project.id}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">分类: {project.category}</p>
                    <p className="text-sm text-gray-600">状态: {project.status === 'active' ? '进行中' : '已完成'}</p>
                    <p className="text-sm text-gray-600">开始日期: {formatDateForDisplay(project.start_date)}</p>
                    <p className="text-sm text-gray-600">目标日期: {formatDateForDisplay(project.target_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-2">
                      进度: {project.current_progress} / {project.target_total} {project.unit}
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      完成度: {Math.round(progressPercentage)}%
                    </p>
                  </div>
                </div>
                {project.description && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">描述: {project.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
