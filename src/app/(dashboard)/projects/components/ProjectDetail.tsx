import React from "react";
import { ArrowLeft, TrendingUp, Calendar, ChevronDown, ChevronUp, Trash2, Edit } from "lucide-react";
import type { ProjectWithLogs, ProjectLog } from "@/types/projects";
import { formatDateForDisplay, formatDateTimeForDisplay, calculateProjectPrediction } from "../utils/projectUtils";
import { ProjectLogForm } from "./ProjectLogForm";

interface ProjectDetailProps {
  project: ProjectWithLogs | null;
  isLoading: boolean;
  logForm: any;
  isSavingLog: boolean;
  saveSuccess: boolean;
  editingLogId: string | null;
  deletingLogId: string | null;
  collapsedDetailSections: Record<string, boolean>;
  onBackToList: () => void;
  onAddLog: () => void;
  onEditLog: (log: ProjectLog) => void;
  onDeleteLog: (logId: string) => void;
  onSaveLog: () => void;
  onCancelEdit: () => void;
  onLogFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onToggleSectionCollapse: (section: string) => void;
}

export function ProjectDetail({ 
  project, 
  isLoading, 
  logForm, 
  isSavingLog, 
  saveSuccess, 
  editingLogId, 
  deletingLogId, 
  collapsedDetailSections, 
  onBackToList, 
  onAddLog, 
  onEditLog, 
  onDeleteLog, 
  onSaveLog, 
  onCancelEdit, 
  onLogFormChange, 
  onToggleSectionCollapse 
}: ProjectDetailProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-10 text-gray-500">
        项目不存在
      </div>
    );
  }

  const prediction = calculateProjectPrediction(project);
  const progressPercentage = project.target_total > 0 
    ? (project.current_progress / project.target_total) * 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center">
        <button
          onClick={onBackToList}
          className="flex items-center text-gray-600 hover:text-gray-800 mr-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          返回列表
        </button>
        <h2 className="text-2xl font-bold">{project.name}</h2>
      </div>

      {/* 基本信息 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div 
          className="flex justify-between items-center cursor-pointer"
          onClick={() => onToggleSectionCollapse('basic')}
        >
          <h3 className="text-lg font-medium">基本信息</h3>
          {collapsedDetailSections['basic'] ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronUp className="h-5 w-5" />
          )}
        </div>
        
        {!collapsedDetailSections['basic'] && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">分类: {project.category}</p>
              <p className="text-sm text-gray-600">状态: {project.status === 'active' ? '进行中' : '已完成'}</p>
              <p className="text-sm text-gray-600">单位: {project.unit}</p>
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
        )}
      </div>

      {/* 进度预测 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div 
          className="flex justify-between items-center cursor-pointer"
          onClick={() => onToggleSectionCollapse('prediction')}
        >
          <h3 className="text-lg font-medium flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            进度预测
          </h3>
          {collapsedDetailSections['prediction'] ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronUp className="h-5 w-5" />
          )}
        </div>
        
        {!collapsedDetailSections['prediction'] && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600">剩余量: {prediction.remaining} {project.unit}</p>
              <p className="text-sm text-gray-600">日均进度: {prediction.avgProgressPerDay.toFixed(2)} {project.unit}/天</p>
              {prediction.predictedRemainingDays && (
                <p className="text-sm text-gray-600">预计剩余天数: {prediction.predictedRemainingDays} 天</p>
              )}
              {prediction.predictedFinishDate && (
                <p className="text-sm text-gray-600">预计完成日期: {formatDateForDisplay(prediction.predictedFinishDate.toISOString())}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 项目日志 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            项目日志
          </h3>
          <button
            onClick={onAddLog}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            添加日志
          </button>
        </div>
        
        {editingLogId === null && (
          <ProjectLogForm
            isLoading={isSavingLog}
            formValues={logForm}
            editingLogId={editingLogId}
            onFormChange={onLogFormChange}
            onSave={onSaveLog}
            onCancel={onCancelEdit}
          />
        )}
        
        {saveSuccess && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">
            保存成功！
          </div>
        )}
        
        <div className="mt-6">
          {project.logs.length === 0 ? (
            <p className="text-center text-gray-500">暂无日志记录</p>
          ) : (
            <div className="space-y-4">
              {project.logs.map((log) => (
                <div key={log.id} className="border-b border-gray-200 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{formatDateTimeForDisplay(log.log_date)}</p>
                      <p className="text-gray-600">+{log.progress_added} {project.unit}</p>
                      {log.note && (
                        <p className="text-sm text-gray-500 mt-1">{log.note}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => onEditLog(log)}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        className="text-red-600 hover:text-red-800"
                        disabled={deletingLogId === log.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
