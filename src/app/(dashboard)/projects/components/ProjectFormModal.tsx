import React from "react";
import { Plus, Edit, Loader2 } from "lucide-react";
import type { ProjectFormValues } from "@/types/projects";
import { PROJECT_CATEGORIES, PROJECT_STATUS_OPTIONS } from "@/types/projects";

interface ProjectFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  isLoading: boolean;
  formValues: ProjectFormValues;
  onClose: () => void;
  onSave: () => void;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export function ProjectFormModal({ 
  isOpen, 
  isEditing, 
  isLoading, 
  formValues, 
  onClose, 
  onSave, 
  onFormChange 
}: ProjectFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold flex items-center">
            {isEditing ? (
              <>
                <Edit className="mr-2 h-5 w-5" />
                编辑项目
              </>
            ) : (
              <>
                <Plus className="mr-2 h-5 w-5" />
                新建项目
              </>
            )}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
              <input
                type="text"
                name="name"
                value={formValues.name}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                name="category"
                value={formValues.category}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isLoading}
              >
                {PROJECT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
              <textarea
                name="description"
                value={formValues.description}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
              <input
                type="text"
                name="unit"
                value={formValues.unit}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目标总量</label>
              <input
                type="number"
                name="target_total"
                value={formValues.target_total}
                onChange={onFormChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前进度</label>
              <input
                type="number"
                name="current_progress"
                value={formValues.current_progress}
                onChange={onFormChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                name="start_date"
                value={formValues.start_date}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目标日期</label>
              <input
                type="date"
                name="target_date"
                value={formValues.target_date}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select
                name="status"
                value={formValues.status}
                onChange={onFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isLoading}
              >
                {PROJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={isLoading}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
