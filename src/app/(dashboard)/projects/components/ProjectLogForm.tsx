import React from "react";
import { Loader2 } from "lucide-react";
import type { ProjectLogFormValues } from "@/types/projects";

interface ProjectLogFormProps {
  isLoading: boolean;
  formValues: ProjectLogFormValues;
  editingLogId: string | null;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ProjectLogForm({ 
  isLoading, 
  formValues, 
  editingLogId, 
  onFormChange, 
  onSave, 
  onCancel 
}: ProjectLogFormProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <h4 className="text-lg font-medium mb-4">
        {editingLogId ? "编辑日志" : "添加日志"}
      </h4>
      
      <form onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期时间</label>
            <input
              type="datetime-local"
              name="log_date"
              value={formValues.log_date}
              onChange={onFormChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">进度增加量</label>
            <input
              type="number"
              name="progress_added"
              value={formValues.progress_added ?? ''}
              onChange={onFormChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              name="note"
              value={formValues.note}
              onChange={onFormChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
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
  );
}
