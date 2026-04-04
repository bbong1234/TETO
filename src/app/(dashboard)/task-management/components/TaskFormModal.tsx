'use client';

import React, { useState, useEffect } from 'react';
import type { TaskDefinition, NewTaskFormValues, TaskType, GoalPeriod, TaskGoal, TaskGoalFormValues } from '@/types/tasks';
import type { Project } from '@/types/projects';
import { X } from 'lucide-react';
import { getDefaultUnit } from '../utils/taskUtils';

interface TaskFormModalProps {
  task: TaskDefinition | null;
  goal: TaskGoal | null;
  projects: Project[];
  onSave: (taskData: NewTaskFormValues) => void;
  onSaveGoal: (goalData: TaskGoalFormValues) => void;
  onClose: () => void;
}

export default function TaskFormModal({ task, goal, projects, onSave, onSaveGoal, onClose }: TaskFormModalProps) {
  const [formData, setFormData] = useState<NewTaskFormValues>({
    name: '',
    task_type: 'boolean',
    unit_name: '',
    include_in_stats: true,
    include_in_completion: true,
    include_in_project: true,
    project_id: null,
    is_long_term: false,
    start_date: '',
    end_date: '',
  });

  // 任务类型中文映射
  const taskTypeMap = {
    boolean: '完成/未完成',
    count: '次数型',
    number: '数值型'
  };

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [goalData, setGoalData] = useState<TaskGoalFormValues>({
    goal_value: 0,
    period: 'day',
    custom_period_days: 7,
    is_enabled: true,
  });

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name || '',
        task_type: task.task_type || 'boolean',
        unit_name: task.unit_name || '',
        include_in_stats: task.include_in_stats ?? true,
        include_in_completion: task.include_in_completion ?? true,
        include_in_project: task.include_in_project ?? true,
        project_id: task.project_id ?? null,
        is_long_term: task.is_long_term ?? false,
        start_date: task.start_date || '',
        end_date: task.end_date || '',
      });
    }
  }, [task]);

  useEffect(() => {
    if (goal) {
      setGoalData({
        goal_value: goal.goal_value || 0,
        period: goal.period || 'day',
        custom_period_days: goal.custom_period_days || 7,
        is_enabled: goal.is_enabled ?? true,
      });
    } else {
      // 重置目标值数据
      setGoalData({
        goal_value: 0,
        period: 'day',
        custom_period_days: 7,
        is_enabled: true,
      });
    }
  }, [goal]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '请输入任务名称';
    }

    if (formData.task_type !== 'boolean' && !formData.unit_name.trim()) {
      newErrors.unit_name = '请输入单位';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      // 只传递数据库表中实际存在的字段
      const taskData: any = {
        name: formData.name,
        task_type: formData.task_type,
        unit_name: formData.unit_name,
        include_in_stats: formData.include_in_stats,
        include_in_completion: formData.include_in_completion
      };
      
      // 始终添加project_id字段，即使为null
      if (formData.project_id !== undefined && formData.project_id !== 'undefined') {
        taskData.project_id = formData.project_id;
      }
      
      // 只添加非空的字段
      if (formData.start_date && formData.start_date.trim()) {
        taskData.start_date = formData.start_date;
      }
      if (formData.end_date && formData.end_date.trim()) {
        taskData.end_date = formData.end_date;
      }
      
      // 添加其他布尔字段
      if (formData.include_in_project !== undefined) {
        taskData.include_in_project = formData.include_in_project;
      }
      if (formData.is_long_term !== undefined) {
        taskData.is_long_term = formData.is_long_term;
      }
      
      try {
        // 先保存任务，再保存目标值
        console.log('开始保存任务');
        await onSave(taskData);
        console.log('任务保存成功');
        await onSaveGoal(goalData);
        console.log('目标值保存成功');
      } catch (error) {
        console.error('保存任务或目标值失败:', error);
      } finally {
        // 无论成功与否，都关闭模态框
        console.log('执行finally块，关闭模态框');
        onClose();
      }
    }
  };

  const handleTypeChange = (type: TaskType) => {
    setFormData(prev => ({
      ...prev,
      task_type: type,
      unit_name: type === 'boolean' ? '' : getDefaultUnit(type),
    }));
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {task ? '编辑任务' : '新建任务'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 任务名称 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              任务名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：每日阅读、运动"
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.name ? 'border-red-500' : 'border-slate-200'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* 任务类型 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              任务类型
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['boolean', 'count', 'number'] as TaskType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    formData.task_type === type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {taskTypeMap[type]}
                </button>
              ))}
            </div>
          </div>

          {/* 单位 */}
          {formData.task_type !== 'boolean' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                单位 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={formData.unit_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, unit_name: e.target.value }))}
                  placeholder="例如：次、分钟、页"
                  className={`flex-1 px-3 py-2 rounded-lg border ${
                    errors.unit_name ? 'border-red-500' : 'border-slate-200'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, unit_name: getDefaultUnit(prev.task_type) }))}
                  className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  默认
                </button>
              </div>
              {errors.unit_name && (
                <p className="mt-1 text-sm text-red-500">{errors.unit_name}</p>
              )}
            </div>
          )}

          {/* 所属项目 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              所属项目
            </label>
            <select
              value={formData.project_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value === '' ? null : e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未关联项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* 统计选项 */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.include_in_stats}
                onChange={(e) => setFormData(prev => ({ ...prev, include_in_stats: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">纳入统计分析</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.include_in_completion}
                onChange={(e) => setFormData(prev => ({ ...prev, include_in_completion: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">纳入完成度计算</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.include_in_project}
                onChange={(e) => setFormData(prev => ({ ...prev, include_in_project: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">纳入项目</span>
            </label>
          </div>

          {/* 时间设置 */}
          <div className="space-y-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_long_term}
                onChange={(e) => setFormData(prev => ({ ...prev, is_long_term: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">长期项目</span>
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  开始日期
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  disabled={formData.is_long_term}
                  className={`w-full px-3 py-2 rounded-lg border ${formData.is_long_term ? 'bg-slate-100' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  结束日期
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  disabled={formData.is_long_term}
                  className={`w-full px-3 py-2 rounded-lg border ${formData.is_long_term ? 'bg-slate-100' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
            </div>
          </div>

          {/* 目标值设置 */}
          <div className="space-y-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={goalData.is_enabled}
                onChange={(e) => setGoalData(prev => ({ ...prev, is_enabled: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">启用目标值</span>
            </label>
            
            {goalData.is_enabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    目标数值
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={goalData.goal_value}
                    onChange={(e) => setGoalData(prev => ({ ...prev, goal_value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    目标周期
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['day', 'week', 'month', 'year', 'custom'] as GoalPeriod[]).map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setGoalData(prev => ({ ...prev, period }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${goalData.period === period ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        {{
                          day: '每日',
                          week: '每周',
                          month: '每月',
                          year: '每年',
                          custom: '自定义'
                        }[period]}
                      </button>
                    ))}
                  </div>
                </div>
                
                {goalData.period === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      自定义周期（天）
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={goalData.custom_period_days}
                      onChange={(e) => setGoalData(prev => ({ ...prev, custom_period_days: parseInt(e.target.value) || 7 }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {task ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
